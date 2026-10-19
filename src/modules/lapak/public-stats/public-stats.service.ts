import { Prisma } from "@prisma/client";
import { prisma } from "~/config/database.js";
import { APP_CODES } from "~/common/constants/index.js";
import { MIN_ORDERS_FOR_DISCLOSURE } from "./public-stats.schema.js";

/**
 * Transparansi PAD publik (LJ-3.3).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MENGAPA ADA SUPPRESSION, BUKAN SEKADAR AGREGASI
 *
 * "Agregat" saja tidak cukup melindungi siapa pun. Bila sebuah kategori hanya
 * punya 1 pesanan senilai Rp5.000.000, maka menampilkan "Kategori X: Rp5 jt"
 * SAMA DENGAN membuka nilai transaksi satu orang — dan siapa pun yang tahu
 * siapa yang menyewa hari itu bisa menyimpulkan nominalnya.
 *
 * Karena itu kelompok dengan pesanan < 3 disembunyikan nominalnya (`realized:
 * null`, `suppressed: true`), tetapi jumlah pesanannya tetap dilaporkan agar
 * publik tahu aktivitasnya ada. Ambang dinaikkan sesuai kebutuhan.
 *
 * Yang TIDAK pernah dikirim ke publik: kode pesanan, nama pemohon, nominal
 * transaksi tunggal, dan identitas OPD per transaksi.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const MONTH_LABELS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

async function getLapakAppId(): Promise<string> {
  const app = await prisma.application.findUniqueOrThrow({
    where: { code: APP_CODES.LAPAK_JAMBI_WEB },
    select: { id: true },
  });
  return app.id;
}

/** Terapkan ambang: sembunyikan nominal bila kelompok terlalu kecil. */
function disclosure(orderCount: number, realized: number): { realized: number | null; suppressed: boolean } {
  if (orderCount < MIN_ORDERS_FOR_DISCLOSURE) {
    return { realized: null, suppressed: true };
  }
  return { realized, suppressed: false };
}

export async function getPublicStats(year?: number) {
  const applicationId = await getLapakAppId();
  const targetYear = year ?? new Date().getFullYear();

  // Batas tahun dalam zona Asia/Jakarta agar transaksi 31 Des pukul 23:30 WIB
  // tidak jatuh ke tahun berikutnya.
  const from = new Date(`${targetYear}-01-01T00:00:00+07:00`);
  const to = new Date(`${targetYear + 1}-01-01T00:00:00+07:00`);

  const baseWhere = {
    applicationId,
    status: "LUNAS" as const,
    createdAt: { gte: from, lt: to },
  } satisfies Prisma.LapakOrderWhereInput;

  // ── Total tahunan ──────────────────────────────────────────────────────────
  const totalAgg = await prisma.lapakOrder.aggregate({
    where: baseWhere,
    _sum: { total: true },
    _count: { _all: true },
  });
  const totalCount = totalAgg._count._all;
  const totalRealized = totalAgg._sum.total ?? 0;

  // ── Per kategori (unit penyajian publik sesuai PRD) ────────────────────────
  const categoryRows = await prisma.$queryRaw<Array<{
    slug: string; name: string; realized: bigint; order_count: bigint;
  }>>`
    SELECT c.slug AS slug, c.name AS name,
           COALESCE(SUM(oi.line_total), 0)::bigint AS realized,
           COUNT(DISTINCT o.id)::bigint AS order_count
    FROM lapak_order_items oi
    JOIN lapak_orders o ON o.id = oi.order_id
    JOIN lapak_products p ON p.id = oi.product_id
    JOIN lapak_categories c ON c.id = p.category_id
    WHERE o.app_id = ${applicationId}
      AND o.status = 'LUNAS'
      AND o.created_at >= ${from}
      AND o.created_at < ${to}
    GROUP BY c.slug, c.name
    ORDER BY realized DESC
  `;

  const byCategory = categoryRows.map((r) => {
    const orderCount = Number(r.order_count);
    const realized = Number(r.realized);
    return {
      slug: r.slug,
      name: r.name,
      orderCount,
      ...disclosure(orderCount, realized),
    };
  });

  // ── Tren bulanan ───────────────────────────────────────────────────────────
  const monthRows = await prisma.$queryRaw<Array<{
    month: string; realized: bigint; order_count: bigint;
  }>>`
    SELECT to_char(o.created_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM') AS month,
           COALESCE(SUM(o.total), 0)::bigint AS realized,
           COUNT(*)::bigint AS order_count
    FROM lapak_orders o
    WHERE o.app_id = ${applicationId}
      AND o.status = 'LUNAS'
      AND o.created_at >= ${from}
      AND o.created_at < ${to}
    GROUP BY 1
    ORDER BY 1
  `;

  const monthMap = new Map(monthRows.map((r) => [
    r.month,
    { realized: Number(r.realized), orderCount: Number(r.order_count) },
  ]));

  // Kirim 12 bulan penuh — bulan tanpa transaksi bernilai 0, bukan hilang.
  // Lubang di grafik membuat publik mengira datanya tidak tersedia.
  const byMonth = Array.from({ length: 12 }, (_, i) => {
    const key = `${targetYear}-${String(i + 1).padStart(2, "0")}`;
    const found = monthMap.get(key);
    const orderCount = found?.orderCount ?? 0;
    const realized = found?.realized ?? 0;
    return {
      month: key,
      label: MONTH_LABELS[i]!,
      orderCount,
      // Bulan tanpa transaksi: 0 (bukan suppressed) — "tidak ada" berbeda dari
      // "ada tetapi disembunyikan".
      ...(orderCount === 0
        ? { realized: 0, suppressed: false }
        : disclosure(orderCount, realized)),
    };
  });

  return {
    year: targetYear,
    total: {
      orderCount: totalCount,
      ...(totalCount === 0 ? { realized: 0, suppressed: false } : disclosure(totalCount, totalRealized)),
    },
    byCategory,
    byMonth,
    disclosure: {
      minOrders: MIN_ORDERS_FOR_DISCLOSURE,
      note:
        `Kelompok dengan kurang dari ${MIN_ORDERS_FOR_DISCLOSURE} pesanan disembunyikan nominalnya ` +
        `untuk melindungi kerahasiaan pemesan. Jumlah pesanan tetap ditampilkan.`,
    },
    generatedAt: new Date().toISOString(),
  };
}
