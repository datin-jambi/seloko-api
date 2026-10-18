import { z } from "zod";

// ─── Kontrak (dipakai ulang dari products.schema agar satu sumber) ────────────
import { PricingUnitSchema } from "../products/products.schema.js";

const timeField = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Format jam HH:MM");
const priceField = z.number().min(0, "Harga tidak boleh negatif").max(99_999_999_999);

// ─── Param Schemas ────────────────────────────────────────────────────────────
export const RateParamsSchema = z.object({
  id: z.string().uuid({ message: "ID tarif harus berupa UUID yang valid" }),
});

export type RateParams = z.infer<typeof RateParamsSchema>;

export const RateActionParamsSchema = RateParamsSchema.extend({
  action: z.enum(["submit", "approve", "reject"]),
});

export type RateActionParams = z.infer<typeof RateActionParamsSchema>;

export const RateProductParamsSchema = z.object({
  productId: z.string().uuid({ message: "ID produk harus berupa UUID yang valid" }),
});

export type RateProductParams = z.infer<typeof RateProductParamsSchema>;

export const ListRatesQuerySchema = z.object({
  productId: z.string().uuid().optional(),
  status: z.enum(["DRAFT", "PENDING_REVIEW", "APPROVED", "REJECTED", "PUBLISHED"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export type ListRatesQuery = z.infer<typeof ListRatesQuerySchema>;

// ─── Body Schemas ─────────────────────────────────────────────────────────────
/** Buat tarif baru pada produk. TIDAK mengubah produk — PRD 04 §C. */
export const CreateRateBodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  unit: PricingUnitSchema,
  price: priceField,
  minQty: z.number().int().min(1).default(1),
  maxQty: z.number().int().min(1).nullable().optional(),
  startTime: timeField.nullable().optional(),
  endTime: timeField.nullable().optional(),
  /** Mulai berlaku; kosong = sekarang. Publik baru melihat setelah APPROVED + tanggal ini. */
  effectiveFrom: z.string().datetime().nullable().optional(),
  isActive: z.boolean().default(true),
});

export type CreateRateBody = z.infer<typeof CreateRateBodySchema>;

export const UpdateRateBodySchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    unit: PricingUnitSchema.optional(),
    price: priceField.optional(),
    minQty: z.number().int().min(1).optional(),
    maxQty: z.number().int().min(1).nullable().optional(),
    startTime: timeField.nullable().optional(),
    endTime: timeField.nullable().optional(),
    effectiveFrom: z.string().datetime().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Setidaknya satu field harus diisi untuk update",
  });

export type UpdateRateBody = z.infer<typeof UpdateRateBodySchema>;

/**
 * Body opsional — hanya reject yang memerlukan note.
 * `.nullable()`: PATCH tanpa body membuat Fastify mengirim `null`, bukan
 * undefined, dan Zod tanpa nullable menolaknya (VALIDATION_ERROR).
 */
export const RateActionBodySchema = z
  .object({
    note: z.string().trim().max(500).optional()
      .describe("Alasan penolakan — wajib bila action=reject"),
  })
  .nullable()
  .optional();

// ─── Shape & Response Schemas ─────────────────────────────────────────────────
export const RateShape = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  name: z.string(),
  unit: PricingUnitSchema,
  price: z.number(),
  minQty: z.number().int(),
  maxQty: z.number().int().nullable(),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  status: z.enum(["DRAFT", "PENDING_REVIEW", "APPROVED", "REJECTED", "PUBLISHED"]),
  effectiveFrom: z.string().datetime(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type RateDto = z.infer<typeof RateShape>;

const envelope = {
  statusCode: z.number(),
  code: z.string(),
  message: z.string(),
} as const;

export const ListRatesResponseSchema = z.object({
  ...envelope,
  data: z.array(RateShape),
  meta: z.object({
    page: z.number(),
    limit: z.number(),
    totalItems: z.number(),
    totalPages: z.number(),
    hasNextPage: z.boolean(),
    hasPreviousPage: z.boolean(),
  }),
});

export const GetRateResponseSchema = z.object({
  ...envelope,
  data: RateShape,
});

export const MutateRateResponseSchema = z.object({
  ...envelope,
  data: RateShape,
});

export const DeleteRateResponseSchema = z.object({
  ...envelope,
  data: z.object({
    id: z.string().uuid(),
    deleted: z.literal(true),
  }),
});
