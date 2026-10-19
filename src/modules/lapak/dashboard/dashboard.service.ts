import { Prisma } from "@prisma/client";
import { prisma } from "~/config/database.js";
import { NotFoundError, BadRequestError } from "~/common/errors/index.js";
import { APP_CODES } from "~/common/constants/index.js";
import type {
  DashboardQuery,
  DashboardDto,
  RevenueRowDto,
  TargetUpsertBody,
  TargetDto,
} from "./dashboard.schema.js";

/**
 * Dashboard & pelaporan PAD (LJ-3.1).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PRINSIP YANG DIJAGA:
 *
 * 1. REALISASI HANYA DARI PESANAN `LUNAS`.
 *    Uang yang belum dikonfirmasi BUKAN realisasi. Ia dilaporkan terpisah di
 *    `pending` supaya pengawas bisa melihat selisih antara "uang sudah masuk"
 *    dan "uang sudah diakui".
 *
 * 2. TARGET DISIMPAN, REALISASI DIHITUNG.
 *    `lapak_targets` hanya menyimpan pagu. Capaian selalu dihitung dari
 *    transaksi, sehingga mustahil ada angka capaian yang tidak cocok dengan
 *    data pesanan (masalah pada pola `TargetOPD.achieve` backend lama).
 *
 * 3. LINGKUP OPD DIPAKSA DI SERVER.
 *    `scope = null` berarti Bapenda/superadmin (semua OPD). Admin OPD hanya
 *    menerima OPD-nya; permintaan OPD lain ditolak 404 agar keberadaannya tidak
 *    terbocorkan.
 *
 * 4. FORMAT MENGIKUTI SIKD/DJPK: Akun | Anggaran/Pagu | Realisasi | %.
 * ─────────────────────────────────────────────────────────────────────────────
 */

async function getLapakAppId(): Promise<string> {
  const app = await prisma.application.findUniqueOrThrow({
    where: { code: APP_CODES.LAPAK_JAMBI_WEB },
    select: { id: true },
  });
  return app.id;
}

// ─── Rentang waktu ────────────────────────────────────────────────────────────
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/**
 * Terjemahkan `period` menjadi rentang tanggal.
 *
 * Memakai waktu LOKAL server (WIB) untuk batas hari/bulan: laporan keuangan
 * daerah berpijak pada hari kalender setempat, bukan UTC. Memakai UTC akan
 * menggeser transaksi malam hari (mis. 23:30 WIB = 16:30 UTC) ke hari yang salah.
 */
function resolvePeriod(query: DashboardQuery): { from: Date; to: Date; label: string } {
  const now = new Date();

  switch (query.period) {
    case "TODAY":
      return { from: startOfDay(now), to: endOfDay(now), label: "Hari ini" };

    case "THIS_MONTH":
      return {
        from: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)),
        to: endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
        label: `Bulan ${now.getMonth() + 1}/${now.getFullYear()}`,
      };

    case "LAST_MONTH":
      return {
        from: startOfDay(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        to: endOfDay(new Date(now.getFullYear(), now.getMonth(), 0)),
        label: `Bulan ${now.getMonth()}/${now.getFullYear()}`,
      };

    case "LAST_YEAR":
      return {
        from: startOfDay(new Date(now.getFullYear() - 1, 0, 1)),
        to: endOfDay(new Date(now.getFullYear() - 1, 11, 31)),
        label: `Tahun ${now.getFullYear() - 1}`,
      };

    case "CUSTOM": {
      if (!query.from || !query.to) {
        throw new BadRequestError("period=CUSTOM wajib menyertakan from dan to");
      }
      const from = startOfDay(new Date(`${query.from}T00:00:00`));
      const to = endOfDay(new Date(`${query.to}T00:00:00`));
      if (from > to) throw new BadRequestError("Tanggal from tidak boleh setelah to");
      return { from, to, label: `${query.from} s/d ${query.to}` };
    }

    case "THIS_YEAR":
    default:
      return {
        from: startOfDay(new Date(now.getFullYear(), 0, 1)),
        to: endOfDay(new Date(now.getFullYear(), 11, 31)),
        label: `Tahun ${now.getFullYear()}`,
      };
  }
}

/**
 * `period` pada Prisma memakai setengah-terbuka `[gte, lt)`. Karena `to` sudah
 * akhir hari (23:59:59.999), menambahkan 1 ms membuat batas atas tetap inklusif
 * tanpa membuang transaksi pada milidetik terakhir.
 */
function dateRangeFilter(from: Date, to: Date) {
  return { gte: from, lt: new Date(to.getTime() + 1) };
}

// ─── Target ───────────────────────────────────────────────────────────────────
const TARGET_INCLUDE = {
  organization: { select: { code: true, name: true } },
} as const;

function toTargetDto(row: {
  id: string; year: number; amount: number; note: string | null; updatedAt: Date;
  organization: { code: string; name: string } | null;
}): TargetDto {
  return {
    id: row.id,
    year: row.year,
    organizationCode: row.organization?.code ?? null,
    organizationName: row.organization?.name ?? null,
    amount: row.amount,
    note: row.note,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listTargets(year?: number) {
  const applicationId = await getLapakAppId();
  const rows = await prisma.lapakTarget.findMany({
    where: { applicationId, ...(year && { year }) },
    include: TARGET_INCLUDE,
    orderBy: [{ year: "desc" }, { organizationId: "asc" }],
  });
  return rows.map(toTargetDto);
}

/**
 * Simpan target (upsert per OPD per tahun; kode kosong = target default).
 *
 * Upsert manual: Prisma tidak bisa memakai compound unique dengan `NULL`
 * (`organizationId = null`).
 */
export async function upsertTarget(body: TargetUpsertBody) {
  const applicationId = await getLapakAppId();

  let organizationId: string | null = null;
  if (body.organizationCode) {
    const org = await prisma.organization.findFirst({
      where: { code: body.organizationCode, deletedAt: null },
      select: { id: true },
    });
    if (!org) throw new NotFoundError("Organisasi", body.organizationCode);
    organizationId = org.id;
  }

  const existing = await prisma.lapakTarget.findFirst({
    where: { applicationId, organizationId, year: body.year },
    select: { id: true },
  });

  const row = existing
    ? await prisma.lapakTarget.update({
        where: { id: existing.id },
        data: { amount: body.amount, note: body.note ?? null },
        include: TARGET_INCLUDE,
      })
    : await prisma.lapakTarget.create({
        data: {
          applicationId, organizationId, year: body.year,
          amount: body.amount, note: body.note ?? null,
        },
        include: TARGET_INCLUDE,
      });

  return toTargetDto(row);
}

export async function deleteTarget(id: string) {
  const existing = await prisma.lapakTarget.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new NotFoundError("Target", id);
  await prisma.lapakTarget.delete({ where: { id } });
  return { id, deleted: true as const };
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export async function getDashboard(
  scope: string[] | null,
  query: DashboardQuery,
): Promise<DashboardDto> {
  const applicationId = await getLapakAppId();
  const { from, to, label } = resolvePeriod(query);

  // Lingkup OPD: null = semua (Bapenda). Admin OPD selalu dibatasi.
  let organizationIdIn: string[] | undefined;
  if (query.organization) {
    const org = await prisma.organization.findFirst({
      where: { code: query.organization, deletedAt: null },
      select: { id: true },
    });
    if (!org) throw new NotFoundError("Organisasi", query.organization);
    if (scope !== null && !scope.includes(org.id)) {
      throw new NotFoundError("Organisasi", query.organization);
    }
    organizationIdIn = [org.id];
  } else if (scope !== null) {
    organizationIdIn = scope;
  }

  const baseWhere = {
    applicationId,
    status: "LUNAS" as const,
    ...(organizationIdIn && { organizationId: { in: organizationIdIn } }),
  } satisfies Prisma.LapakOrderWhereInput;

  const rangeWhere = { ...baseWhere, createdAt: dateRangeFilter(from, to) };

  // ── Realisasi per dimensi ──────────────────────────────────────────────────
  const rows: RevenueRowDto[] = [];

  if (query.groupBy === "ORG") {
    const grouped = await prisma.lapakOrder.groupBy({
      by: ["organizationId"],
      where: rangeWhere,
      _sum: { total: true },
      _count: { _all: true },
    });

    const orgIds = grouped.map((g) => g.organizationId);
    const orgs = orgIds.length === 0 ? [] : await prisma.organization.findMany({
      where: { id: { in: orgIds } },
      select: { id: true, code: true, name: true },
    });
    const orgMap = new Map(orgs.map((o) => [o.id, o]));

    // Target per OPD untuk tahun yang bersangkutan.
    const year = from.getFullYear();
    const targets = await prisma.lapakTarget.findMany({
      where: { applicationId, year, organizationId: { in: orgIds } },
      select: { organizationId: true, amount: true },
    });
    const targetMap = new Map(targets.map((t) => [t.organizationId!, t.amount]));

    for (const g of grouped) {
      const org = orgMap.get(g.organizationId);
      const target = targetMap.get(g.organizationId) ?? null;
      const realized = g._sum.total ?? 0;
      rows.push({
        key: org?.code ?? g.organizationId,
        label: org?.name ?? "-",
        target,
        realized,
        percentage: target && target > 0 ? Math.round((realized / target) * 10000) / 100 : null,
        orderCount: g._count._all,
      });
    }
  } else if (query.groupBy === "CATEGORY") {
    // Kategori diambil dari produk pada tiap baris pesanan. Karena sum per
    // kategori tidak bisa langsung lewat Prisma groupBy (relasi berlapis),
    // dipakai query agregat SQL yang eksplisit.
    const catRows = await prisma.$queryRaw<Array<{
      key: string; label: string; realized: bigint; order_count: bigint;
    }>>`
      SELECT c.slug AS key, c.name AS label,
             COALESCE(SUM(oi.line_total), 0)::bigint AS realized,
             COUNT(DISTINCT o.id)::bigint AS order_count
      FROM lapak_order_items oi
      JOIN lapak_orders o ON o.id = oi.order_id
      JOIN lapak_products p ON p.id = oi.product_id
      JOIN lapak_categories c ON c.id = p.category_id
      WHERE o.app_id = ${applicationId}
        AND o.status = 'LUNAS'
        AND o.created_at >= ${from}
        AND o.created_at < ${new Date(to.getTime() + 1)}
        ${organizationIdIn ? Prisma.sql`AND o.organization_id IN (${Prisma.join(organizationIdIn)})` : Prisma.empty}
      GROUP BY c.slug, c.name
      ORDER BY realized DESC
    `;

    for (const r of catRows) {
      rows.push({
        key: r.key,
        label: r.label,
        // Target tidak didefinisikan per kategori — pagu hanya per OPD/aplikasi.
        target: null,
        realized: Number(r.realized),
        percentage: null,
        orderCount: Number(r.order_count),
      });
    }
  } else {
    // MONTH: tren bulanan dalam rentang.
    const monthRows = await prisma.$queryRaw<Array<{
      key: string; realized: bigint; order_count: bigint;
    }>>`
      SELECT to_char(o.created_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM') AS key,
             COALESCE(SUM(o.total), 0)::bigint AS realized,
             COUNT(*)::bigint AS order_count
      FROM lapak_orders o
      WHERE o.app_id = ${applicationId}
        AND o.status = 'LUNAS'
        AND o.created_at >= ${from}
        AND o.created_at < ${new Date(to.getTime() + 1)}
        ${organizationIdIn ? Prisma.sql`AND o.organization_id IN (${Prisma.join(organizationIdIn)})` : Prisma.empty}
      GROUP BY 1
      ORDER BY 1
    `;

    for (const r of monthRows) {
      rows.push({
        key: r.key,
        label: r.key,
        target: null,
        realized: Number(r.realized),
        percentage: null,
        orderCount: Number(r.order_count),
      });
    }
  }

  // ── Ringkasan ──────────────────────────────────────────────────────────────
  const agg = await prisma.lapakOrder.aggregate({
    where: rangeWhere,
    _sum: { total: true },
    _count: { _all: true },
  });
  const realized = agg._sum.total ?? 0;
  const orderCount = agg._count._all;

  // Target ringkasan: jumlah target semua OPD dalam lingkup (atau default).
  const year = from.getFullYear();
  const targetScope = organizationIdIn
    ? { organizationId: { in: organizationIdIn } }
    : {};
  const targetAgg = await prisma.lapakTarget.aggregate({
    where: { applicationId, year, ...targetScope },
    _sum: { amount: true },
  });
  const targetTotal = targetAgg._sum.amount ?? null;

  // ── Pending: uang yang belum sah sebagai realisasi ──────────────────────────
  const pendingWhere = {
    applicationId,
    ...(organizationIdIn && { organizationId: { in: organizationIdIn } }),
  } satisfies Prisma.LapakOrderWhereInput;

  const [awaitingPayment, awaitingConfirmation, expired] = await Promise.all([
    prisma.lapakOrder.aggregate({
      where: { ...pendingWhere, status: "MENUNGGU_PEMBAYARAN" },
      _sum: { total: true }, _count: { _all: true },
    }),
    prisma.lapakOrder.aggregate({
      where: { ...pendingWhere, status: "MENUNGGU_KONFIRMASI" },
      _sum: { total: true }, _count: { _all: true },
    }),
    prisma.lapakOrder.aggregate({
      where: { ...pendingWhere, status: "KEDALUWARSA" },
      _sum: { total: true }, _count: { _all: true },
    }),
  ]);

  // ── Tren harian (30 titik terakhir dalam rentang) ──────────────────────────
  const trendFrom = new Date(Math.max(from.getTime(), Date.now() - 30 * 86_400_000));
  const trendRows = await prisma.$queryRaw<Array<{ date: string; realized: bigint }>>`
    SELECT to_char(o.created_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD') AS date,
           COALESCE(SUM(o.total), 0)::bigint AS realized
    FROM lapak_orders o
    WHERE o.app_id = ${applicationId}
      AND o.status = 'LUNAS'
      AND o.created_at >= ${trendFrom}
      AND o.created_at < ${new Date(to.getTime() + 1)}
      ${organizationIdIn ? Prisma.sql`AND o.organization_id IN (${Prisma.join(organizationIdIn)})` : Prisma.empty}
    GROUP BY 1
    ORDER BY 1
  `;

  return {
    period: { from: from.toISOString(), to: to.toISOString(), label },
    groupBy: query.groupBy,
    rows,
    summary: {
      target: targetTotal,
      realized,
      percentage: targetTotal && targetTotal > 0
        ? Math.round((realized / targetTotal) * 10000) / 100
        : null,
      orderCount,
    },
    pending: {
      awaitingPayment: awaitingPayment._sum.total ?? 0,
      awaitingConfirmation: awaitingConfirmation._sum.total ?? 0,
      expired: expired._sum.total ?? 0,
      count: {
        awaitingPayment: awaitingPayment._count._all,
        awaitingConfirmation: awaitingConfirmation._count._all,
        expired: expired._count._all,
      },
    },
    trend: trendRows.map((r) => ({ date: r.date, realized: Number(r.realized) })),
  };
}
