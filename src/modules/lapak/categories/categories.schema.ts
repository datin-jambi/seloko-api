import { z } from "zod";

// ─── Atribut Bawaan (diwarisi produk baru pada kategori ini, LJ-1.2) ──────────
/**
 * Kolom DB memakai VARCHAR longgar (bukan enum) supaya menambah jenis tarif
 * tidak butuh migrasi. Kontrak API yang tetap ketat lewat Zod di sini.
 */
export const PricingUnitSchema = z.enum([
  "SESSION", "HOUR", "DAY", "NIGHT", "MONTH", "YEAR",
  "PERSON", "UNIT", "M2", "TEST", "TRIP",
]);
export const AvailabilityTypeSchema = z.enum(["SLOT", "DATE_RANGE", "CONTRACT", "STOCK", "SCHEDULE"]);
export const FulfillmentTypeSchema = z.enum([
  "TICKET_QR", "BOOKING", "CONTRACT", "SCHEDULE", "RESULT", "DOCUMENT_SKRD",
]);

export type PricingUnit = z.infer<typeof PricingUnitSchema>;
export type AvailabilityType = z.infer<typeof AvailabilityTypeSchema>;
export type FulfillmentType = z.infer<typeof FulfillmentTypeSchema>;

const pricingUnitField = PricingUnitSchema.nullable()
  .describe("Satuan tarif bawaan; null = OPD wajib memilih sendiri saat membuat produk");
const availabilityTypeField = AvailabilityTypeSchema.nullable()
  .describe("Jenis ketersediaan bawaan (slot kalender, rentang tanggal, kontrak, stok, jadwal)");
const fulfillmentTypeField = FulfillmentTypeSchema.nullable()
  .describe("Hasil akhir bawaan (tiket QR, booking, kontrak, jadwal, hasil, dokumen SKRD)");

// ─── Query Schemas ────────────────────────────────────────────────────────────
export const ListCategoriesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(100).optional()
    .describe("Cari di nama, slug, atau deskripsi"),
  isActive: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  sortBy: z.enum(["sortOrder", "name", "createdAt"]).default("sortOrder"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

export type ListCategoriesQuery = z.infer<typeof ListCategoriesQuerySchema>;

export const PublicListCategoriesQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
});

export type PublicListCategoriesQuery = z.infer<typeof PublicListCategoriesQuerySchema>;

// ─── Param Schemas ────────────────────────────────────────────────────────────
export const CategoryParamsSchema = z.object({
  id: z.string().uuid({ message: "ID kategori harus berupa UUID yang valid" }),
});

export type CategoryParams = z.infer<typeof CategoryParamsSchema>;
export type CategorySlugParams = z.infer<typeof CategorySlugParamsSchema>;

export const CategorySlugParamsSchema = z.object({
  slug: z.string().min(2).max(120),
});

// ─── Body Schemas ─────────────────────────────────────────────────────────────
export const CreateCategoryBodySchema = z.object({
  name: z.string().trim().min(2, "Nama kategori minimal 2 karakter").max(100),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug harus huruf kecil/angka dipisah tanda hubung")
    .optional()
    .describe("Kosong = dibentuk otomatis dari nama; URL publik tetap, hati-hati mengganti"),
  description: z.string().trim().max(500).nullable().optional(),
  icon: z.string().trim().max(50).nullable().optional()
    .describe("Nama ikon lucide untuk kartu kategori di portal"),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  isActive: z.boolean().default(true),
  defaultPricingUnit: pricingUnitField.optional(),
  defaultAvailabilityType: availabilityTypeField.optional(),
  defaultFulfillmentType: fulfillmentTypeField.optional(),
});

export type CreateCategoryBody = z.infer<typeof CreateCategoryBodySchema>;

export const UpdateCategoryBodySchema = CreateCategoryBodySchema.partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Setidaknya satu field harus diisi untuk update",
  });

export type UpdateCategoryBody = z.infer<typeof UpdateCategoryBodySchema>;

export const SetCategoryActiveBodySchema = z.object({
  isActive: z.boolean(),
});

export const ReorderCategoriesBodySchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        sortOrder: z.number().int().min(0).max(9999),
      }),
    )
    .min(1, "Minimal satu item urutan"),
});

export type ReorderCategoriesBody = z.infer<typeof ReorderCategoriesBodySchema>;

// ─── Shape & Response Schemas ─────────────────────────────────────────────────
export const LapakCategoryShape = z.object({
  id: z.string().uuid(),
  applicationId: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  icon: z.string().nullable(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  defaultPricingUnit: PricingUnitSchema.nullable(),
  defaultAvailabilityType: AvailabilityTypeSchema.nullable(),
  defaultFulfillmentType: FulfillmentTypeSchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type LapakCategoryDto = z.infer<typeof LapakCategoryShape>;

/** Versi publik: tanpa audit/waktu, hanya yang perlu ditampilkan portal. */
export const PublicCategoryShape = LapakCategoryShape.pick({
  id: true,
  name: true,
  slug: true,
  description: true,
  icon: true,
});

export const PaginationMetaSchema = z.object({
  page: z.number(),
  limit: z.number(),
  totalItems: z.number(),
  totalPages: z.number(),
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
});

const envelope = {
  statusCode: z.number(),
  code: z.string(),
  message: z.string(),
} as const;

export const ListCategoriesResponseSchema = z.object({
  ...envelope,
  data: z.array(LapakCategoryShape),
  meta: PaginationMetaSchema,
});

export const PublicListCategoriesResponseSchema = z.object({
  ...envelope,
  data: z.array(PublicCategoryShape),
});

export const GetCategoryResponseSchema = z.object({
  ...envelope,
  data: LapakCategoryShape,
});

/** Detail publik: shape ringkas (id, name, slug, description, icon). */
export const PublicGetCategoryResponseSchema = z.object({
  ...envelope,
  data: PublicCategoryShape,
});

export const CreateCategoryResponseSchema = z.object({
  ...envelope,
  data: LapakCategoryShape,
});

export const UpdateCategoryResponseSchema = z.object({
  ...envelope,
  data: LapakCategoryShape,
});

export const DeleteCategoryResponseSchema = z.object({
  ...envelope,
  data: z.object({
    id: z.string().uuid(),
    deleted: z.literal(true),
  }),
});

export const ReorderCategoriesResponseSchema = z.object({
  ...envelope,
  data: z.object({
    updated: z.number().int(),
  }),
});

// ─── Inferred Types ───────────────────────────────────────────────────────────
export type CategoryParamsInput = z.infer<typeof CategoryParamsSchema>;
export type SetCategoryActiveBody = z.infer<typeof SetCategoryActiveBodySchema>;
