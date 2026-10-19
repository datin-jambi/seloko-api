import { z } from "zod";

/**
 * Dashboard & pelaporan PAD (LJ-3.1).
 *
 * Struktur mengikuti format pelaporan resmi SIKD/DJPK Kemenkeu:
 *   Akun | Anggaran/Pagu | Realisasi | %
 *
 * Konteks nyata (data SIKD Provinsi Jambi 2024): Retribusi Daerah hanya
 * ~0,68% dari PAD (14,31 M dari 2.089,31 M) dengan capaian 83,72% — di bawah
 * Pajak Daerah (99,20%). Artinya dashboard ini alat pengawasan penerimaan yang
 * capaiannya paling lemah, bukan sekadar pajangan.
 */

// ─── Query ────────────────────────────────────────────────────────────────────
export const DashboardPeriodSchema = z.enum([
  "TODAY", "THIS_MONTH", "THIS_YEAR", "LAST_MONTH", "LAST_YEAR", "CUSTOM",
]);
export type DashboardPeriod = z.infer<typeof DashboardPeriodSchema>;

export const DashboardQuerySchema = z.object({
  period: DashboardPeriodSchema.default("THIS_YEAR").describe("Rentang waktu"),
  /** Wajib bila period=CUSTOM. Format YYYY-MM-DD. */
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD").optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD").optional(),
  /** Kode OPD; kosong = seluruh OPD dalam lingkup. */
  organization: z.string().trim().max(50).optional(),
  /** Kelompokkan per kategori produk. */
  groupBy: z.enum(["ORG", "CATEGORY", "MONTH"]).default("ORG").describe("Dimensi pengelompokan"),
});
export type DashboardQuery = z.infer<typeof DashboardQuerySchema>;

export const TargetUpsertBodySchema = z.object({
  year: z.number().int().min(2020).max(2100),
  /** Kode OPD; kosong = target default aplikasi. */
  organizationCode: z.string().trim().max(50).nullable().optional(),
  amount: z.number().int().min(0).describe("Target penerimaan tahunan (rupiah)"),
  note: z.string().trim().max(255).optional(),
});
export type TargetUpsertBody = z.infer<typeof TargetUpsertBodySchema>;

export const TargetQuerySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100).optional(),
});
export type TargetQuery = z.infer<typeof TargetQuerySchema>;

export const TargetParamsSchema = z.object({
  id: z.string().uuid({ message: "ID target harus berupa UUID yang valid" }),
});
export type TargetParams = z.infer<typeof TargetParamsSchema>;

// ─── Shapes ───────────────────────────────────────────────────────────────────
/** Satu baris agregasi — mencerminkan 4 kolom laporan SIKD. */
export const RevenueRowShape = z.object({
  /** Kode/label dimensi: kode OPD, slug kategori, atau "2026-10". */
  key: z.string(),
  label: z.string(),
  /** Anggaran/pagu dari `lapak_targets`; null bila belum ditetapkan. */
  target: z.number().int().nullable(),
  /** Realisasi = jumlah pesanan LUNAS pada rentang. */
  realized: z.number().int(),
  /** Persentase capaian; null bila target belum ada. */
  percentage: z.number().nullable(),
  /** Jumlah pesanan yang berkontribusi. */
  orderCount: z.number().int(),
});

export const DashboardShape = z.object({
  period: z.object({
    from: z.string().datetime(),
    to: z.string().datetime(),
    label: z.string(),
  }),
  groupBy: z.enum(["ORG", "CATEGORY", "MONTH"]),
  /** Baris agregasi sesuai `groupBy`. */
  rows: z.array(RevenueRowShape),
  summary: z.object({
    target: z.number().int().nullable(),
    realized: z.number().int(),
    percentage: z.number().nullable(),
    orderCount: z.number().int(),
  }),
  /**
   * Penerimaan yang BELUM sah sebagai realisasi — penting untuk pengawasan:
   * uang bisa sudah masuk tetapi belum dikonfirmasi OPD.
   */
  pending: z.object({
    awaitingPayment: z.number().int().describe("Pesanan menunggu pembayaran (nilai)"),
    awaitingConfirmation: z.number().int().describe("Bukti transfer menunggu konfirmasi (nilai)"),
    expired: z.number().int().describe("Pesanan kedaluwarsa (nilai hangus)"),
    count: z.object({
      awaitingPayment: z.number().int(),
      awaitingConfirmation: z.number().int(),
      expired: z.number().int(),
    }),
  }),
  /** Tren harian 30 titik terakhir — untuk grafik garis. */
  trend: z.array(z.object({
    date: z.string(),
    realized: z.number().int(),
  })),
});

export const TargetShape = z.object({
  id: z.string().uuid(),
  year: z.number().int(),
  organizationCode: z.string().nullable(),
  organizationName: z.string().nullable(),
  amount: z.number().int(),
  note: z.string().nullable(),
  updatedAt: z.string().datetime(),
});

const envelope = { statusCode: z.number(), code: z.string(), message: z.string() } as const;

export const DashboardResponseSchema = z.object({ ...envelope, data: DashboardShape });
export const TargetResponseSchema = z.object({ ...envelope, data: TargetShape });
export const TargetListResponseSchema = z.object({ ...envelope, data: z.array(TargetShape) });
export const TargetDeleteResponseSchema = z.object({
  ...envelope,
  data: z.object({ id: z.string(), deleted: z.literal(true) }),
});

export type DashboardDto = z.infer<typeof DashboardShape>;
export type RevenueRowDto = z.infer<typeof RevenueRowShape>;
export type TargetDto = z.infer<typeof TargetShape>;
