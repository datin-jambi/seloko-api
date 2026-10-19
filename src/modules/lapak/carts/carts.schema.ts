import { z } from "zod";

/**
 * Keranjang belanja warga (LJ-2.3, PRD 04 §4.F).
 *
 * ATURAN INTI: satu keranjang per (user, OPD). Warga boleh punya beberapa
 * keranjang — satu per OPD — karena SKRD diterbitkan per penerbit sehingga
 * checkout lintas OPD dipecah menjadi beberapa pesanan. Menambah produk dari
 * OPD lain ke keranjang yang sudah ada ditolak `409`, bukan diam-diam
 * digabung.
 */

// ─── Params ───────────────────────────────────────────────────────────────────
export const CartOrgParamsSchema = z.object({
  code: z.string().trim().min(1).max(50).describe("Kode OPD, mis. BPSDM"),
});
export type CartOrgParams = z.infer<typeof CartOrgParamsSchema>;

export const CartParamsSchema = z.object({
  id: z.string().uuid({ message: "ID keranjang harus berupa UUID yang valid" }),
});
export type CartParams = z.infer<typeof CartParamsSchema>;

export const CartItemParamsSchema = z.object({
  itemId: z.string().uuid({ message: "ID item harus berupa UUID yang valid" }),
});
export type CartItemParams = z.infer<typeof CartItemParamsSchema>;

// ─── Body ─────────────────────────────────────────────────────────────────────
export const AddCartItemBodySchema = z.object({
  productId: z.string().uuid({ message: "ID produk harus berupa UUID yang valid" }),
  rateId: z.string().uuid().nullable().optional()
    .describe("Tarif yang dipilih; kosong = tarif termurah saat quote"),
  reservationId: z.string().uuid().nullable().optional()
    .describe("Reservasi HOLD yang menahan slot untuk baris ini"),
  qty: z.number().int().min(1).max(10_000).default(1),
  startAt: z.string().datetime({ offset: true }).nullable().optional(),
  endAt: z.string().datetime({ offset: true }).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});
export type AddCartItemBody = z.infer<typeof AddCartItemBodySchema>;

export const UpdateCartItemBodySchema = z
  .object({
    qty: z.number().int().min(1).max(10_000).optional(),
    rateId: z.string().uuid().nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "Setidaknya satu field harus diisi",
  });
export type UpdateCartItemBody = z.infer<typeof UpdateCartItemBodySchema>;

// ─── Shapes ───────────────────────────────────────────────────────────────────
export const CartItemShape = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  productName: z.string(),
  productSlug: z.string(),
  rateId: z.string().uuid().nullable(),
  rateName: z.string().nullable(),
  reservationId: z.string().uuid().nullable(),
  qty: z.number().int(),
  startAt: z.string().datetime().nullable(),
  endAt: z.string().datetime().nullable(),
  note: z.string().nullable(),
  /** Harga satuan dari tarif aktif saat ini — TIDAK disimpan, hanya informasi. */
  unitPrice: z.number().nullable().describe("Harga saat ini; dibekukan nanti saat checkout"),
  lineTotal: z.number().nullable(),
});

export const CartShape = z.object({
  id: z.string().uuid(),
  organization: z.object({ code: z.string(), name: z.string() }),
  items: z.array(CartItemShape),
  itemCount: z.number().int(),
  /** Subtotal informatif; angka final ditetapkan saat quote (LJ-2.4). */
  subtotal: z.number(),
});

const envelope = {
  statusCode: z.number(),
  code: z.string(),
  message: z.string(),
} as const;

export const CartResponseSchema = z.object({
  ...envelope,
  data: CartShape,
});

export const CartListResponseSchema = z.object({
  ...envelope,
  data: z.array(CartShape),
});

export const EmptyCartResponseSchema = z.object({
  ...envelope,
  data: z.object({ id: z.string().uuid(), deleted: z.literal(true) }),
});

export type CartDto = z.infer<typeof CartShape>;
export type CartItemDto = z.infer<typeof CartItemShape>;
