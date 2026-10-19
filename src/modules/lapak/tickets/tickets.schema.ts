import { z } from "zod";

/**
 * Tiket / bukti pemenuhan (LJ-2.7, PRD 04 §3 & §5).
 *
 * Terbit SAAT LUNAS — bukan saat checkout. Tiket adalah bukti hak pakai, dan hak
 * itu baru sah setelah dibayar.
 *
 * Dua jalur pemakaian:
 * - `POST /:id/use`   — petugas scan QR/kode lalu menandai terpakai.
 * - `GET /verify/:token` — publik, memeriksa keaslian & status tiket.
 */

// ─── Params ───────────────────────────────────────────────────────────────────
export const TicketParamsSchema = z.object({
  id: z.string().uuid({ message: "ID tiket harus berupa UUID yang valid" }),
});
export type TicketParams = z.infer<typeof TicketParamsSchema>;

export const TicketOrderParamsSchema = z.object({
  orderId: z.string().uuid({ message: "ID pesanan harus berupa UUID yang valid" }),
});
export type TicketOrderParams = z.infer<typeof TicketOrderParamsSchema>;

export const TicketTokenParamsSchema = z.object({
  token: z.string().trim().min(10).max(64).describe("Token QR tiket atau kode pendek"),
});
export type TicketTokenParams = z.infer<typeof TicketTokenParamsSchema>;

// ─── Body ─────────────────────────────────────────────────────────────────────
// Catatan petugas lokasi (mis. jumlah rombongan yang benar-benar masuk).
export const UseTicketBodySchema = z.object({
  note: z.string().trim().max(500).optional(),
});
export type UseTicketBody = z.infer<typeof UseTicketBodySchema>;

export const ListTicketsQuerySchema = z.object({
  status: z.enum(["AKTIF", "DIGUNAKAN", "KEDALUWARSA", "DIBATALKAN"]).optional(),
  kind: z.enum(["TICKET", "BOOKING", "CONTRACT", "HANDOVER", "RESULT", "SCHEDULE"]).optional(),
  organization: z.string().trim().max(50).optional().describe("Kode OPD"),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
export type ListTicketsQuery = z.infer<typeof ListTicketsQuerySchema>;

// ─── Shapes ───────────────────────────────────────────────────────────────────
export const TicketShape = z.object({
  id: z.string().uuid(),
  orderItemId: z.string().uuid(),
  orderId: z.string().uuid(),
  orderCode: z.string(),
  kind: z.enum(["TICKET", "BOOKING", "CONTRACT", "HANDOVER", "RESULT", "SCHEDULE"]),
  code: z.string(),
  status: z.enum(["AKTIF", "DIGUNAKAN", "KEDALUWARSA", "DIBATALKAN"]),
  productName: z.string(),
  rateName: z.string(),
  organization: z.object({ code: z.string(), name: z.string() }),
  validFrom: z.string().datetime().nullable(),
  validUntil: z.string().datetime().nullable(),
  usedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

/** Respons verifikasi publik — TANPA data pribadi pemesan. */
export const TicketVerifyShape = z.object({
  code: z.string(),
  kind: z.enum(["TICKET", "BOOKING", "CONTRACT", "HANDOVER", "RESULT", "SCHEDULE"]),
  productName: z.string(),
  rateName: z.string(),
  organizationName: z.string(),
  status: z.enum(["AKTIF", "DIGUNAKAN", "KEDALUWARSA", "DIBATALKAN"]),
  validFrom: z.string().datetime().nullable(),
  validUntil: z.string().datetime().nullable(),
  usedAt: z.string().datetime().nullable(),
  /** Boleh dipakai sekarang? Dihitung dari status + masa berlaku. */
  usable: z.boolean(),
  /** Alasan bila tidak bisa dipakai — dibaca petugas di lapangan. */
  reason: z.string().nullable(),
});

/** Ringkasan tiket di dalam detail pesanan. */
export const OrderTicketShape = z.object({
  id: z.string().uuid(),
  orderItemId: z.string().uuid(),
  kind: z.enum(["TICKET", "BOOKING", "CONTRACT", "HANDOVER", "RESULT", "SCHEDULE"]),
  code: z.string(),
  status: z.enum(["AKTIF", "DIGUNAKAN", "KEDALUWARSA", "DIBATALKAN"]),
  productName: z.string(),
  rateName: z.string(),
  validFrom: z.string().datetime().nullable(),
  validUntil: z.string().datetime().nullable(),
  usedAt: z.string().datetime().nullable(),
});

const envelope = { statusCode: z.number(), code: z.string(), message: z.string() } as const;

export const TicketResponseSchema = z.object({ ...envelope, data: TicketShape });
export const TicketVerifyResponseSchema = z.object({ ...envelope, data: TicketVerifyShape });
export const TicketOrderListResponseSchema = z.object({ ...envelope, data: z.array(TicketShape) });
export const TicketListResponseSchema = z.object({
  ...envelope,
  data: z.array(TicketShape),
  meta: z.object({
    page: z.number(), limit: z.number(), totalItems: z.number(),
    totalPages: z.number(), hasNextPage: z.boolean(), hasPreviousPage: z.boolean(),
  }),
});

export type TicketDto = z.infer<typeof TicketShape>;
