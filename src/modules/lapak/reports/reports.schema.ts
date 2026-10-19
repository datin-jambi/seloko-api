import { z } from "zod";

/**
 * Daftar transaksi lintas OPD + ekspor (LJ-3.2).
 *
 * Berbeda dari `/api/lapak/orders` (daftar pesanan operasional), endpoint di sini
 * berorientasi **audit & pelaporan**:
 * - kolomnya menyandingkan target/realisasi seperti laporan SIKD,
 * - menampilkan data yang dibutuhkan pemeriksa (SKRD, pembayaran, tiket),
 * - bisa diekspor ke CSV yang aman dibuka di Excel.
 */

// ─── Query ────────────────────────────────────────────────────────────────────
export const TRANSACTION_STATUSES = [
  "DRAFT", "MENUNGGU_VERIFIKASI", "MENUNGGU_PEMBAYARAN", "MENUNGGU_KONFIRMASI",
  "LUNAS", "AKTIF", "SELESAI", "DITOLAK", "DIBATALKAN", "KEDALUWARSA", "REFUND",
] as const;

export const TransactionQuerySchema = z.object({
  /** Rentang tanggal transaksi (YYYY-MM-DD). Kosong = tanpa batas. */
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD").optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD").optional(),
  /** Kode OPD. */
  organization: z.string().trim().max(50).optional(),
  status: z.enum(TRANSACTION_STATUSES).optional(),
  /** Cari kode pesanan / nama pemohon. */
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sort: z.enum(["NEWEST", "OLDEST", "HIGHEST", "LOWEST"]).default("NEWEST"),
});
export type TransactionQuery = z.infer<typeof TransactionQuerySchema>;

/** Ekspor memakai filter yang sama, tanpa paginasi. */
export const ExportQuerySchema = TransactionQuerySchema.omit({ page: true, limit: true });
export type ExportQuery = z.infer<typeof ExportQuerySchema>;

// ─── Shapes ───────────────────────────────────────────────────────────────────
export const TransactionRowShape = z.object({
  orderId: z.string().uuid(),
  code: z.string(),
  createdAt: z.string().datetime(),
  organizationCode: z.string(),
  organizationName: z.string(),
  status: z.enum(TRANSACTION_STATUSES),
  /** Jumlah rupiah yang menjadi hak daerah (total pesanan). */
  amount: z.number().int(),
  /** Nomor SKRD bila sudah terbit. */
  skrdNumber: z.string().nullable(),
  skrdStatus: z.enum(["TERBIT", "LUNAS", "CANCELLED"]).nullable(),
  /** Status pembayaran terakhir. */
  paymentStatus: z.enum(["MENUNGGU_BUKTI", "MENUNGGU_KONFIRMASI", "LUNAS", "DITOLAK", "KEDALUWARSA"]).nullable(),
  paidAt: z.string().datetime().nullable(),
  /** Nama pemohon DIMASKING — daftar lintas OPD tidak butuh identitas utuh. */
  applicantName: z.string(),
  purpose: z.string().nullable(),
  /** Jumlah baris pesanan (produk berbeda). */
  itemCount: z.number().int(),
  /** Tiket terbit dibanding total baris — penanda pemenuhan. */
  tickets: z.object({
    total: z.number().int(),
    used: z.number().int(),
  }),
});

export const TransactionSummaryShape = z.object({
  /** Total nilai seluruh baris yang cocok filter (bukan hanya halaman ini). */
  totalAmount: z.number().int(),
  totalOrders: z.number().int(),
  /** Pecahan per status agar pengawas tahu komposisinya. */
  byStatus: z.array(z.object({
    status: z.enum(TRANSACTION_STATUSES),
    count: z.number().int(),
    amount: z.number().int(),
  })),
});

const envelope = { statusCode: z.number(), code: z.string(), message: z.string() } as const;

export const TransactionListResponseSchema = z.object({
  ...envelope,
  data: z.array(TransactionRowShape),
  summary: TransactionSummaryShape,
  meta: z.object({
    page: z.number(), limit: z.number(), totalItems: z.number(),
    totalPages: z.number(), hasNextPage: z.boolean(), hasPreviousPage: z.boolean(),
  }),
});

/** Respons ekspor: berkas CSV dikirim sebagai lampiran, bukan JSON. */
export const ExportResponseSchema = z.string().describe("Berkas CSV (text/csv)");

export type TransactionRowDto = z.infer<typeof TransactionRowShape>;
