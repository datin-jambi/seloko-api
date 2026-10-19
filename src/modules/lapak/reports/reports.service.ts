import { Prisma } from "@prisma/client";
import { prisma } from "~/config/database.js";
import { NotFoundError, BadRequestError } from "~/common/errors/index.js";
import { APP_CODES } from "~/common/constants/index.js";
import type { TransactionQuery, TransactionRowDto, ExportQuery } from "./reports.schema.js";

/**
 * Daftar transaksi lintas OPD + ekspor (LJ-3.2).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DUA RISIKO YANG DITANGANI DI SINI:
 *
 * 1. PII BOCOR LEWAT EKSPOR.
 *    Nama pemohon dimasking di daftar DAN di CSV. Daftar lintas OPD bukan alasan
 *    untuk menyebar identitas warga ke seluruh Bapenda.
 *
 * 2. CSV INJECTION.
 *    Sel yang diawali `=`, `+`, `-`, `@`, TAB, atau CR akan dieksekusi Excel
 *    sebagai formula. Nama pemohon/maksud pemakaian diisi warga, jadi ini jalur
 *    nyata untuk menanam `=HYPERLINK(...)` atau perintah berbahaya. Setiap sel
 *    yang berisiko diberi prefiks `'` supaya Excel memperlakukannya sebagai teks.
 * ─────────────────────────────────────────────────────────────────────────────
 */

async function getLapakAppId(): Promise<string> {
  const app = await prisma.application.findUniqueOrThrow({
    where: { code: APP_CODES.LAPAK_JAMBI_WEB },
    select: { id: true },
  });
  return app.id;
}

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

/** Samarkan nama: sisakan 2 huruf depan + 1 belakang. */
function maskName(name: string | null | undefined): string {
  if (!name) return "-";
  const clean = name.trim();
  if (clean.length <= 3) return clean;
  return `${clean.slice(0, 2)}${"*".repeat(Math.min(6, clean.length - 3))}${clean.slice(-1)}`;
}

const ORDER_INCLUDE = {
  organization: { select: { code: true, name: true } },
  skrd: { select: { number: true, status: true } },
  payments: {
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: { status: true, paidAt: true, confirmedAt: true },
  },
  items: {
    select: { id: true, ticket: { select: { status: true } } },
  },
} as const;

type OrderRow = Prisma.LapakOrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

function toRow(row: OrderRow): TransactionRowDto {
  const applicant = (row.applicant ?? {}) as { name?: string };
  const latestPayment = row.payments[0];
  const tickets = row.items.map((i) => i.ticket).filter(Boolean);

  return {
    orderId: row.id,
    code: row.code,
    createdAt: row.createdAt.toISOString(),
    organizationCode: row.organization.code,
    organizationName: row.organization.name,
    status: row.status,
    amount: row.total,
    skrdNumber: row.skrd?.number ?? null,
    skrdStatus: row.skrd?.status ?? null,
    paymentStatus: latestPayment?.status ?? null,
    paidAt: (latestPayment?.confirmedAt ?? latestPayment?.paidAt)?.toISOString() ?? null,
    applicantName: maskName(applicant.name),
    purpose: row.purpose,
    itemCount: row.items.length,
    tickets: {
      total: tickets.length,
      used: tickets.filter((t) => t!.status === "DIGUNAKAN").length,
    },
  };
}

/** Bangun filter Prisma dari query, dengan lingkup OPD dipaksa di server. */
async function buildWhere(
  scope: string[] | null,
  query: TransactionQuery | ExportQuery,
  applicationId: string,
): Promise<Prisma.LapakOrderWhereInput> {
  let organizationIdIn: string[] | undefined;

  if (query.organization) {
    const org = await prisma.organization.findFirst({
      where: { code: query.organization, deletedAt: null },
      select: { id: true },
    });
    if (!org) throw new NotFoundError("Organisasi", query.organization);
    // 404 (bukan 403): jangan ungkap keberadaan OPD di luar lingkup.
    if (scope !== null && !scope.includes(org.id)) {
      throw new NotFoundError("Organisasi", query.organization);
    }
    organizationIdIn = [org.id];
  } else if (scope !== null) {
    organizationIdIn = scope;
  }

  const where: Prisma.LapakOrderWhereInput = {
    applicationId,
    ...(organizationIdIn && { organizationId: { in: organizationIdIn } }),
    ...(query.status && { status: query.status }),
  };

  if (query.from || query.to) {
    if (query.from && query.to && query.from > query.to) {
      throw new BadRequestError("Tanggal from tidak boleh setelah to");
    }
    where.createdAt = {
      ...(query.from && { gte: startOfDay(new Date(`${query.from}T00:00:00`)) }),
      ...(query.to && { lt: new Date(endOfDay(new Date(`${query.to}T00:00:00`)).getTime() + 1) }),
    };
  }

  if (query.q) {
    // Cari di kode pesanan saja. Mencari di `applicant` (JSON) akan menggeser
    // masalah PII ke jalur pencarian — pemohon tidak boleh bisa ditemukan
    // lintas OPD hanya dengan menebak namanya.
    where.code = { contains: query.q, mode: "insensitive" };
  }

  return where;
}

function orderByOf(sort: TransactionQuery["sort"]): Prisma.LapakOrderOrderByWithRelationInput {
  switch (sort) {
    case "OLDEST": return { createdAt: "asc" };
    case "HIGHEST": return { total: "desc" };
    case "LOWEST": return { total: "asc" };
    case "NEWEST":
    default: return { createdAt: "desc" };
  }
}

// ─── Daftar ───────────────────────────────────────────────────────────────────
export async function listTransactions(scope: string[] | null, query: TransactionQuery) {
  const applicationId = await getLapakAppId();
  const where = await buildWhere(scope, query, applicationId);

  const [rows, totalItems, agg] = await Promise.all([
    prisma.lapakOrder.findMany({
      where,
      include: ORDER_INCLUDE,
      orderBy: orderByOf(query.sort),
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.lapakOrder.count({ where }),
    prisma.lapakOrder.aggregate({ where, _sum: { total: true } }),
  ]);

  // Komposisi per status dihitung dari SELURUH hasil filter, bukan halaman ini —
  // pengawas perlu tahu totalnya, bukan hanya 20 baris yang tampil.
  const byStatusRaw = await prisma.lapakOrder.groupBy({
    by: ["status"],
    where,
    _sum: { total: true },
    _count: { _all: true },
  });

  const totalPages = Math.ceil(totalItems / query.limit) || 1;
  return {
    data: rows.map(toRow),
    summary: {
      totalAmount: agg._sum.total ?? 0,
      totalOrders: totalItems,
      byStatus: byStatusRaw
        .map((s) => ({
          status: s.status,
          count: s._count._all,
          amount: s._sum.total ?? 0,
        }))
        .sort((a, b) => b.amount - a.amount),
    },
    meta: {
      page: query.page, limit: query.limit, totalItems, totalPages,
      hasNextPage: query.page < totalPages, hasPreviousPage: query.page > 1,
    },
  };
}

// ─── Ekspor CSV ───────────────────────────────────────────────────────────────
/**
 * Netralkan sel yang bisa dieksekusi Excel sebagai formula.
 *
 * Karakter pemicu: `=` `+` `-` `@` serta TAB (0x09) dan CR (0x0D). Prefiks `'`
 * membuat Excel memperlakukannya sebagai teks biasa.
 *
 * Ini bukan teori: nama pemohon & maksud pemakaian diisi warga, dan file CSV
 * hasil ekspor akan dibuka pegawai di Excel. Tanpa ini, warga bisa menanam
 * `=HYPERLINK("http://jahat","klik")` yang berjalan di komputer pegawai.
 */
function neutralizeFormula(value: string): string {
  if (value.length === 0) return value;
  const first = value[0]!;
  if (["=", "+", "-", "@", "\t", "\r"].includes(first)) {
    return `'${value}`;
  }
  return value;
}

/** Bungkus nilai CSV sesuai RFC 4180. */
function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = neutralizeFormula(String(value));
  // Kutip bila mengandung pemisah, kutip, atau baris baru; gandakan kutipnya.
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Hasilkan CSV daftar transaksi.
 *
 * Memakai pemisah koma + BOM UTF-8 di awal: Excel di Windows perlu BOM agar
 * karakter non-ASCII (nama OPD) tidak menjadi mojibake.
 */
export async function exportTransactionsCsv(
  scope: string[] | null,
  query: ExportQuery,
): Promise<{ csv: string; filename: string; rowCount: number }> {
  const applicationId = await getLapakAppId();
  const where = await buildWhere(scope, query, applicationId);

  const rows = await prisma.lapakOrder.findMany({
    where,
    include: ORDER_INCLUDE,
    orderBy: orderByOf(query.sort),
  });

  const header = [
    "Kode Pesanan", "Tanggal", "OPD", "Nama OPD", "Status Pesanan",
    "Nominal (Rp)", "Nomor SKRD", "Status SKRD", "Status Pembayaran",
    "Dibayar Pada", "Pemohon", "Maksud", "Jumlah Item",
    "Tiket Terbit", "Tiket Terpakai",
  ];

  const lines: string[] = [header.map(csvCell).join(",")];
  for (const row of rows) {
    const d = toRow(row);
    lines.push([
      d.code,
      d.createdAt,
      d.organizationCode,
      d.organizationName,
      d.status,
      d.amount,
      d.skrdNumber,
      d.skrdStatus,
      d.paymentStatus,
      d.paidAt,
      d.applicantName,
      d.purpose,
      d.itemCount,
      d.tickets.total,
      d.tickets.used,
    ].map(csvCell).join(","));
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const csv = `\uFEFF${lines.join("\r\n")}\r\n`;

  return {
    csv,
    filename: `transaksi-lapak-${stamp}.csv`,
    rowCount: rows.length,
  };
}
