import { z } from "zod";

/**
 * Quote & checkout → pesanan (LJ-2.4, PRD 04 §4.F & §5).
 *
 * Dua operasi berbeda sifat:
 * - **QUOTE** hanya menghitung (tidak menyimpan apa pun) — dipakai frontend
 *   untuk menampilkan rincian sebelum warga menekan "Pesan".
 * - **CHECKOUT** membuat pesanan sungguhan, membekukan harga sebagai snapshot,
 *   dan mengubah reservasi HOLD menjadi CONFIRMED.
 */

// ─── Params ───────────────────────────────────────────────────────────────────
export const OrderParamsSchema = z.object({
  id: z.string().uuid({ message: "ID pesanan harus berupa UUID yang valid" }),
});
export type OrderParams = z.infer<typeof OrderParamsSchema>;

export const CartIdParamsSchema = z.object({
  cartId: z.string().uuid({ message: "ID keranjang harus berupa UUID yang valid" }),
});
export type CartIdParams = z.infer<typeof CartIdParamsSchema>;

// ─── Body ─────────────────────────────────────────────────────────────────────
/**
 * Data pemohon disimpan sebagai snapshot (PII). Divalidasi ketat di sini karena
 * setelah tersimpan ia menjadi dasar dokumen resmi (SKRD) dan tidak boleh
 * setengah jadi.
 */
export const ApplicantSchema = z.object({
  name: z.string().trim().min(3).max(150).describe("Nama pemohon / penanggung jawab"),
  nik: z.string().trim().regex(/^\d{16}$/, "NIK harus 16 digit").nullable().optional(),
  npwp: z.string().trim().max(20).nullable().optional(),
  phone: z.string().trim().min(8).max(20).describe("Nomor telepon yang bisa dihubungi"),
  email: z.string().trim().email().nullable().optional(),
  institution: z.string().trim().max(150).nullable().optional()
    .describe("Instansi/organisasi pemohon bila bukan perorangan"),
  address: z.string().trim().max(255).nullable().optional(),
});
export type Applicant = z.infer<typeof ApplicantSchema>;

export const CheckoutBodySchema = z.object({
  applicant: ApplicantSchema,
  purpose: z.string().trim().max(500).optional().describe("Maksud pemakaian"),
  /** Masa berlaku pembayaran (jam). Default 24 jam. */
  dueHours: z.number().int().min(1).max(720).default(24),
});
export type CheckoutBody = z.infer<typeof CheckoutBodySchema>;

// ─── Shapes ───────────────────────────────────────────────────────────────────
/** Baris hasil perhitungan harga. */
export const QuoteLineShape = z.object({
  cartItemId: z.string().uuid().nullable(),
  productId: z.string().uuid(),
  productName: z.string(),
  rateId: z.string().uuid().nullable(),
  rateName: z.string().nullable(),
  unit: z.string(),
  price: z.number().int(),
  qty: z.number().int(),
  lineTotal: z.number().int(),
  startAt: z.string().datetime().nullable(),
  endAt: z.string().datetime().nullable(),
  /** Peringatan per baris (mis. tarif belum disetujui) — quote tetap jalan. */
  warning: z.string().nullable(),
});

export const QuoteShape = z.object({
  organization: z.object({ code: z.string(), name: z.string() }),
  lines: z.array(QuoteLineShape),
  subtotal: z.number().int(),
  total: z.number().int(),
  /** Bila ada baris bermasalah, checkout akan ditolak sampai diperbaiki. */
  ready: z.boolean(),
  warnings: z.array(z.string()),
});

/** Data pemohon yang SUDAH DIMASKING — inilah yang boleh tampil di list. */
export const MaskedApplicantShape = z.object({
  name: z.string(),
  nik: z.string().nullable().describe("Dimasking, mis. 1234********5678"),
  npwp: z.string().nullable(),
  phone: z.string().nullable().describe("Dimasking, mis. 0812****7890"),
  email: z.string().nullable(),
  institution: z.string().nullable(),
  address: z.string().nullable(),
});

export const OrderItemShape = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  productName: z.string(),
  rateName: z.string(),
  unit: z.string(),
  price: z.number().int(),
  qty: z.number().int(),
  lineTotal: z.number().int(),
  startAt: z.string().datetime().nullable(),
  endAt: z.string().datetime().nullable(),
  note: z.string().nullable(),
});

export const OrderShape = z.object({
  id: z.string().uuid(),
  code: z.string(),
  status: z.string(),
  organization: z.object({ code: z.string(), name: z.string() }),
  items: z.array(OrderItemShape),
  subtotal: z.number().int(),
  total: z.number().int(),
  purpose: z.string().nullable(),
  expiresAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

/** Detail pesanan menampilkan pemohon TERMASKING — PII tidak pernah utuh. */
export const OrderDetailShape = OrderShape.extend({
  applicant: MaskedApplicantShape,
});

const envelope = {
  statusCode: z.number(),
  code: z.string(),
  message: z.string(),
} as const;

export const QuoteResponseSchema = z.object({
  ...envelope,
  data: QuoteShape,
});

export const CheckoutResponseSchema = z.object({
  ...envelope,
  data: OrderDetailShape,
});

export const OrderListResponseSchema = z.object({
  ...envelope,
  data: z.array(OrderDetailShape),
  meta: z.object({
    page: z.number(),
    limit: z.number(),
    totalItems: z.number(),
    totalPages: z.number(),
    hasNextPage: z.boolean(),
    hasPreviousPage: z.boolean(),
  }),
});

export const OrderDetailResponseSchema = z.object({
  ...envelope,
  data: OrderDetailShape,
});

export const ListOrdersQuerySchema = z.object({
  status: z.enum([
    "DRAFT", "MENUNGGU_VERIFIKASI", "MENUNGGU_PEMBAYARAN", "MENUNGGU_KONFIRMASI",
    "LUNAS", "AKTIF", "SELESAI", "DITOLAK", "DIBATALKAN", "KEDALUWARSA", "REFUND",
  ]).optional(),
  organization: z.string().trim().max(50).optional().describe("Kode OPD (CMS saja)"),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
export type ListOrdersQuery = z.infer<typeof ListOrdersQuerySchema>;

export type QuoteDto = z.infer<typeof QuoteShape>;
export type OrderDto = z.infer<typeof OrderShape>;
export type OrderDetailDto = z.infer<typeof OrderDetailShape>;
