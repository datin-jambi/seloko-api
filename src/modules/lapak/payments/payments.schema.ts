import { z } from "zod";

/**
 * Pembayaran transfer manual (LJ-2.6, PRD 04 §E).
 *
 * Alur: pesanan checkout → pembayaran `MENUNGGU_BUKTI` dibuat otomatis →
 * warga unggah bukti ke ImageKit lalu kirim URL+fileId → `MENUNGGU_KONFIRMASI`
 * → admin OPD setujui → `LUNAS` (pesanan & SKRD ikut LUNAS) atau tolak
 * (warga boleh unggah ulang; riwayat tetap utuh).
 */

// ─── Params ───────────────────────────────────────────────────────────────────
export const PaymentParamsSchema = z.object({
  id: z.string().uuid({ message: "ID pembayaran harus berupa UUID yang valid" }),
});
export type PaymentParams = z.infer<typeof PaymentParamsSchema>;

export const PaymentOrderParamsSchema = z.object({
  orderId: z.string().uuid({ message: "ID pesanan harus berupa UUID yang valid" }),
});
export type PaymentOrderParams = z.infer<typeof PaymentOrderParamsSchema>;

// ─── Body ─────────────────────────────────────────────────────────────────────
/**
 * Bukti transfer WAJIB berasal dari ImageKit (`POST /api/storage/upload
 * ?module=lapak&subFolder=payments`). URL eksternal ditolak: bukti bayar adalah
 * lampiran resmi — harus tersimpan di storage yang kita kendalikan, bukan
 * tautan yang bisa hilang atau berubah isinya.
 */
export const SubmitProofBodySchema = z.object({
  proofUrl: z
    .string()
    .url({ message: "proofUrl harus berupa URL yang valid" })
    .max(500)
    .refine(
      (v) => /^https?:\/\//i.test(v),
      "proofUrl harus berupa URL http(s) dari ImageKit",
    )
    .describe("URL berkas hasil POST /api/storage/upload"),
  proofFileId: z
    .string()
    .trim()
    .min(3)
    .max(200)
    .describe("fileId ImageKit — dipakai untuk audit & pembersihan berkas"),
  senderName: z.string().trim().min(3).max(150).describe("Nama pengirim sesuai mutasi bank"),
  senderBank: z.string().trim().min(2).max(100).describe("Bank pengirim"),
  amount: z.number().int().positive().describe("Jumlah yang ditransfer (rupiah)"),
  paidAt: z.string().datetime({ offset: true }).describe("Waktu transfer"),
  note: z.string().trim().max(500).optional(),
});
export type SubmitProofBody = z.infer<typeof SubmitProofBodySchema>;

export const RejectPaymentBodySchema = z.object({
  reason: z.string().trim().min(5).max(500).describe("Alasan penolakan — dibaca warga"),
});
export type RejectPaymentBody = z.infer<typeof RejectPaymentBodySchema>;

export const VerifyPaymentBodySchema = z.object({
  /** Nominal yang benar-benar diterima (boleh beda dari yang dilaporkan). */
  amount: z.number().int().positive().optional(),
  note: z.string().trim().max(500).optional(),
});
export type VerifyPaymentBody = z.infer<typeof VerifyPaymentBodySchema>;

export const ListPaymentsQuerySchema = z.object({
  status: z.enum(["MENUNGGU_BUKTI", "MENUNGGU_KONFIRMASI", "LUNAS", "DITOLAK", "KEDALUWARSA"]).optional(),
  organization: z.string().trim().max(50).optional().describe("Kode OPD"),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
export type ListPaymentsQuery = z.infer<typeof ListPaymentsQuerySchema>;

// ─── Shapes ───────────────────────────────────────────────────────────────────
export const PaymentShape = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  orderCode: z.string(),
  method: z.enum(["MANUAL_TRANSFER", "VIRTUAL_ACCOUNT", "QRIS"]),
  status: z.enum(["MENUNGGU_BUKTI", "MENUNGGU_KONFIRMASI", "LUNAS", "DITOLAK", "KEDALUWARSA"]),
  amount: z.number().int(),
  organization: z.object({ code: z.string(), name: z.string() }),
  /** Rekening tujuan — dari snapshot SKRD, bukan pengaturan hidup. */
  bank: z.object({
    name: z.string().nullable(),
    account: z.string().nullable(),
    holder: z.string().nullable(),
  }),
  proofUrl: z.string().nullable(),
  proofFileId: z.string().nullable(),
  senderName: z.string().nullable(),
  senderBank: z.string().nullable(),
  note: z.string().nullable(),
  rejectReason: z.string().nullable(),
  paidAt: z.string().datetime().nullable(),
  confirmedAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

/** Ringkasan pembayaran di dalam detail pesanan (tanpa rekening berulang). */
export const OrderPaymentShape = z.object({
  id: z.string().uuid(),
  status: z.enum(["MENUNGGU_BUKTI", "MENUNGGU_KONFIRMASI", "LUNAS", "DITOLAK", "KEDALUWARSA"]),
  method: z.enum(["MANUAL_TRANSFER", "VIRTUAL_ACCOUNT", "QRIS"]),
  amount: z.number().int(),
  proofUrl: z.string().nullable(),
  senderName: z.string().nullable(),
  senderBank: z.string().nullable(),
  rejectReason: z.string().nullable(),
  paidAt: z.string().datetime().nullable(),
  confirmedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

const envelope = { statusCode: z.number(), code: z.string(), message: z.string() } as const;

export const PaymentResponseSchema = z.object({ ...envelope, data: PaymentShape });

/** Daftar pembayaran SATU pesanan — tanpa `meta` karena tidak berpaginasi. */
export const OrderPaymentListResponseSchema = z.object({
  ...envelope,
  data: z.array(PaymentShape),
});
export const PaymentListResponseSchema = z.object({
  ...envelope,
  data: z.array(PaymentShape),
  meta: z.object({
    page: z.number(), limit: z.number(), totalItems: z.number(),
    totalPages: z.number(), hasNextPage: z.boolean(), hasPreviousPage: z.boolean(),
  }),
});

export type PaymentDto = z.infer<typeof PaymentShape>;
