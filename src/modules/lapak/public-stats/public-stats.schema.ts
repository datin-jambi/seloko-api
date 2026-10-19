import { z } from "zod";

/**
 * Transparansi PAD publik (LJ-3.3).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PRINSIP DARI PRD 04 §1:
 *   "data dikelola per OPD, tetapi disajikan ke publik PER KATEGORI
 *    (dikelola Bapenda) agar mudah dicerna."
 *
 * Karena itu endpoint ini TIDAK mengelompokkan per OPD. Alasannya bukan hanya
 * keterbacaan: perbandingan "OPD A menerima lebih banyak dari OPD B" mudah
 * berubah menjadi polemik, padahal jumlah aset dan tarif tiap OPD berbeda.
 * Kategori adalah unit yang adil untuk dilihat publik.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * BATAS YANG DIJAGA:
 *
 * 1. HANYA AGREGAT. Tidak ada satu pun respons yang memuat kode pesanan,
 *    nama pemohon, atau nominal transaksi tunggal.
 * 2. SUPPRESSION: kelompok dengan pesanan terlalu sedikit tidak ditampilkan
 *    nominalnya. Dengan 1 pesanan, "total kategori X = Rp5 jt" secara praktis
 *    membuka nilai transaksi satu orang. Ambang minimal 3 pesanan.
 * 3. HANYA YANG SUDAH LUNAS. Janji yang belum dibayar bukan penerimaan.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Ambang minimal pesanan agar sebuah kelompok boleh ditampilkan. */
export const MIN_ORDERS_FOR_DISCLOSURE = 3;

export const PublicStatsQuerySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100).optional()
    .describe("Tahun anggaran; kosong = tahun berjalan"),
});
export type PublicStatsQuery = z.infer<typeof PublicStatsQuerySchema>;

// ─── Shapes ───────────────────────────────────────────────────────────────────
export const PublicCategoryRowShape = z.object({
  slug: z.string(),
  name: z.string(),
  /** Realisasi tahun berjalan; null bila pesanan kurang dari ambang. */
  realized: z.number().int().nullable(),
  orderCount: z.number().int(),
  /** true bila nominal disembunyikan karena kelompok terlalu kecil. */
  suppressed: z.boolean(),
});

export const PublicMonthlyRowShape = z.object({
  month: z.string().describe("Format YYYY-MM"),
  label: z.string().describe("Nama bulan dalam Bahasa Indonesia"),
  realized: z.number().int().nullable(),
  orderCount: z.number().int(),
  suppressed: z.boolean(),
});

export const PublicStatsShape = z.object({
  year: z.number().int(),
  /** Total penerimaan aplikasi pada tahun tersebut. */
  total: z.object({
    realized: z.number().int().nullable(),
    orderCount: z.number().int(),
    suppressed: z.boolean(),
  }),
  /** Rincian per kategori — unit penyajian publik sesuai PRD. */
  byCategory: z.array(PublicCategoryRowShape),
  /** Tren bulanan tahun berjalan. */
  byMonth: z.array(PublicMonthlyRowShape),
  /** Penjelasan ambang, ditampilkan apa adanya ke publik. */
  disclosure: z.object({
    minOrders: z.number().int(),
    note: z.string(),
  }),
  generatedAt: z.string().datetime(),
});

export const PublicStatsResponseSchema = z.object({
  statusCode: z.number(),
  code: z.string(),
  message: z.string(),
  data: PublicStatsShape,
});

export type PublicStatsDto = z.infer<typeof PublicStatsShape>;
