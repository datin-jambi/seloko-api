import { z } from "zod";

// ─── Kontrak atribut produk (VARCHAR longgar di DB, ketat di sini) ────────────
export const PricingUnitSchema = z.enum([
  "SESSION", "HOUR", "DAY", "NIGHT", "MONTH", "YEAR",
  "PERSON", "UNIT", "M2", "TEST", "TRIP",
]);
export const AvailabilityTypeSchema = z.enum(["SLOT", "DATE_RANGE", "CONTRACT", "STOCK", "SCHEDULE"]);
export const FulfillmentTypeSchema = z.enum([
  "TICKET_QR", "BOOKING", "CONTRACT", "SCHEDULE", "RESULT", "DOCUMENT_SKRD",
]);
export const RequirementFieldTypeSchema = z.enum(["FILE", "TEXT", "NUMBER", "DATE", "SELECT"]);

export type PricingUnit = z.infer<typeof PricingUnitSchema>;
export type AvailabilityType = z.infer<typeof AvailabilityTypeSchema>;
export type FulfillmentType = z.infer<typeof FulfillmentTypeSchema>;
export type RequirementFieldType = z.infer<typeof RequirementFieldTypeSchema>;

const priceField = z.number().min(0, "Harga tidak boleh negatif").max(99_999_999_999);
const timeField = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Format jam HH:MM");

// ─── Tarif / Addon / Persyaratan (nested pada create & update produk) ─────────
export const RateInputSchema = z.object({
  id: z.string().uuid().optional().describe("Ada = perbarui baris ini; absen = buat baru"),
  name: z.string().trim().min(1).max(100),
  unit: PricingUnitSchema,
  price: priceField,
  minQty: z.number().int().min(1).default(1),
  maxQty: z.number().int().min(1).nullable().optional(),
  startTime: timeField.nullable().optional(),
  endTime: timeField.nullable().optional(),
  isActive: z.boolean().default(true),
});

export const AddonInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(100),
  unit: PricingUnitSchema,
  price: priceField,
  isActive: z.boolean().default(true),
});

export const RequirementInputSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().trim().min(2).max(150),
  fieldType: RequirementFieldTypeSchema,
  /** Pilihan untuk SELECT — array string 1–20 item. */
  options: z.array(z.string().trim().min(1).max(100)).min(1).max(20).nullable().optional(),
  isRequired: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(999).default(0),
});

export const FacilityInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(100),
  icon: z.string().trim().max(50).nullable().optional(),
});

export const ImageInputSchema = z.object({
  id: z.string().uuid().optional(),
  url: z.string().url("URL gambar tidak valid").max(500),
  fileId: z.string().trim().max(100).nullable().optional(),
  altText: z.string().trim().max(150).nullable().optional(),
  isPrimary: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(999).default(0),
});

export const ProductChildrenSchema = z.object({
  rates: z.array(RateInputSchema).max(50).optional(),
  addons: z.array(AddonInputSchema).max(50).optional(),
  requirements: z.array(RequirementInputSchema).max(30).optional(),
  facilities: z.array(FacilityInputSchema).max(50).optional(),
  images: z.array(ImageInputSchema).max(20).optional(),
});

// ─── Query Schemas ────────────────────────────────────────────────────────────
export const ListProductsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(100).optional(),
  organizationId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  status: z.enum(["DRAFT", "PENDING_REVIEW", "APPROVED", "REJECTED", "PUBLISHED"]).optional(),
  sortBy: z.enum(["createdAt", "updatedAt", "name", "publishedAt"]).default("updatedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type ListProductsQuery = z.infer<typeof ListProductsQuerySchema>;

/** Publik: hanya terbit, filter sesuai kebutuhan portal (PRD 04 §7). */
export const PublicListProductsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(12),
  search: z.string().trim().max(100).optional(),
  category: z.string().trim().max(120).optional()
    .describe("Slug kategori"),
  organization: z.string().trim().max(50).optional()
    .describe("Kode OPD, mis. BPSDM"),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  sortBy: z.enum(["publishedAt", "name", "price"]).default("publishedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type PublicListProductsQuery = z.infer<typeof PublicListProductsQuerySchema>;

// ─── Param Schemas ────────────────────────────────────────────────────────────
export const ProductParamsSchema = z.object({
  id: z.string().uuid({ message: "ID produk harus berupa UUID yang valid" }),
});

export type ProductParams = z.infer<typeof ProductParamsSchema>;

export const ProductSlugParamsSchema = z.object({
  slug: z.string().min(2).max(180),
});

export const ProductActionParamsSchema = ProductParamsSchema.extend({
  action: z.enum(["submit", "approve", "reject", "publish", "unpublish"]),
});

export type ProductActionParams = z.infer<typeof ProductActionParamsSchema>;

// ─── Body Schemas ─────────────────────────────────────────────────────────────
export const CreateProductBodySchema = z.object({
  organizationId: z.string().uuid("OPD pemilik wajib dipilih"),
  categoryId: z.string().uuid("Kategori wajib dipilih"),
  name: z.string().trim().min(3, "Nama produk minimal 3 karakter").max(150),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(180)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug harus huruf kecil/angka dipisah tanda hubung")
    .optional(),
  excerpt: z.string().trim().max(1000).nullable().optional(),
  description: z.string().trim().min(10, "Deskripsi minimal 10 karakter"),
  address: z.string().trim().max(255).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  capacity: z.number().int().min(1).nullable().optional(),
  areaM2: z.number().int().min(1).nullable().optional(),
  /**
   * Tiga atribut opsional: kosong = warisi nilai bawaan kategorinya.
   * Bila kategori punya null juga, wajib diisi manual — pesan kesalahan jelas.
   */
  pricingUnit: PricingUnitSchema.nullable().optional(),
  availabilityType: AvailabilityTypeSchema.nullable().optional(),
  fulfillmentType: FulfillmentTypeSchema.nullable().optional(),
  coverUrl: z.string().url().max(500).nullable().optional(),
  coverFileId: z.string().trim().max(100).nullable().optional(),
  ...ProductChildrenSchema.shape,
});

export type CreateProductBody = z.infer<typeof CreateProductBodySchema>;

export const UpdateProductBodySchema = CreateProductBodySchema.partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Setidaknya satu field harus diisi untuk update",
  });

export type UpdateProductBody = z.infer<typeof UpdateProductBodySchema>;

export const SetProductActiveBodySchema = z.object({
  isActive: z.boolean().optional(),
});

// ─── Shape & Response Schemas ─────────────────────────────────────────────────
const decimal = z.number();

export const RateShape = z.object({
  id: z.string().uuid(),
  name: z.string(),
  unit: PricingUnitSchema,
  price: decimal,
  minQty: z.number().int(),
  maxQty: z.number().int().nullable(),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  status: z.enum(["DRAFT", "PENDING_REVIEW", "APPROVED", "REJECTED", "PUBLISHED"]),
  effectiveFrom: z.string().datetime(),
  isActive: z.boolean(),
});

export const AddonShape = z.object({
  id: z.string().uuid(),
  name: z.string(),
  unit: PricingUnitSchema,
  price: decimal,
  isActive: z.boolean(),
});

export const RequirementShape = z.object({
  id: z.string().uuid(),
  label: z.string(),
  fieldType: RequirementFieldTypeSchema,
  options: z.array(z.string()).nullable(),
  isRequired: z.boolean(),
  sortOrder: z.number().int(),
});

export const FacilityShape = z.object({
  id: z.string().uuid(),
  name: z.string(),
  icon: z.string().nullable(),
});

export const ImageShape = z.object({
  id: z.string().uuid(),
  url: z.string(),
  fileId: z.string().nullable(),
  altText: z.string().nullable(),
  isPrimary: z.boolean(),
  sortOrder: z.number().int(),
});

/** Row produk + anak-anak → DTO CMS. */
export const ProductShape = z.object({
  id: z.string().uuid(),
  applicationId: z.string().uuid(),
  organizationId: z.string().uuid(),
  categoryId: z.string().uuid(),
  retributionObjectId: z.string().uuid().nullable(),
  name: z.string(),
  slug: z.string(),
  excerpt: z.string().nullable(),
  description: z.string(),
  address: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  capacity: z.number().int().nullable(),
  areaM2: z.number().int().nullable(),
  pricingUnit: PricingUnitSchema,
  availabilityType: AvailabilityTypeSchema,
  fulfillmentType: FulfillmentTypeSchema,
  status: z.enum(["DRAFT", "PENDING_REVIEW", "APPROVED", "REJECTED", "PUBLISHED"]),
  publishedAt: z.string().datetime().nullable(),
  coverUrl: z.string().nullable(),
  coverFileId: z.string().nullable(),
  organization: z.object({ id: z.string().uuid(), code: z.string(), name: z.string() }),
  category: z.object({ id: z.string().uuid(), name: z.string(), slug: z.string() }),
  rates: z.array(RateShape),
  addons: z.array(AddonShape),
  requirements: z.array(RequirementShape),
  facilities: z.array(FacilityShape),
  images: z.array(ImageShape),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type ProductDto = z.infer<typeof ProductShape>;

/** Kartu katalog publik — ringkas, ada harga termurah untuk sort/filter. */
export const PublicProductCardShape = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  excerpt: z.string().nullable(),
  coverUrl: z.string().nullable(),
  address: z.string().nullable(),
  pricingUnit: PricingUnitSchema,
  startingPrice: decimal.describe("Tarif APPROVED termurah yang aktif"),
  organization: z.object({ code: z.string(), name: z.string() }),
  category: z.object({ name: z.string(), slug: z.string() }),
});

export const PublicProductDetailShape = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  excerpt: z.string().nullable(),
  description: z.string(),
  address: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  capacity: z.number().int().nullable(),
  areaM2: z.number().int().nullable(),
  pricingUnit: PricingUnitSchema,
  availabilityType: AvailabilityTypeSchema,
  fulfillmentType: FulfillmentTypeSchema,
  coverUrl: z.string().nullable(),
  publishedAt: z.string().datetime().nullable(),
  organization: z.object({ code: z.string(), name: z.string() }),
  category: z.object({ name: z.string(), slug: z.string() }),
  rates: z.array(RateShape.pick({ id: true, name: true, unit: true, price: true, minQty: true, maxQty: true, startTime: true, endTime: true })),
  addons: z.array(AddonShape.pick({ id: true, name: true, unit: true, price: true })),
  requirements: z.array(RequirementShape.pick({ id: true, label: true, fieldType: true, options: true, isRequired: true, sortOrder: true })),
  facilities: z.array(FacilityShape),
  images: z.array(ImageShape.pick({ id: true, url: true, altText: true, isPrimary: true, sortOrder: true })),
});

const PaginationMetaSchema = z.object({
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

export const ListProductsResponseSchema = z.object({
  ...envelope,
  data: z.array(ProductShape),
  meta: PaginationMetaSchema,
});

export const PublicListProductsResponseSchema = z.object({
  ...envelope,
  data: z.array(PublicProductCardShape),
  meta: PaginationMetaSchema,
});

export const GetProductResponseSchema = z.object({
  ...envelope,
  data: ProductShape,
});

export const PublicGetProductResponseSchema = z.object({
  ...envelope,
  data: PublicProductDetailShape,
});

export const CreateProductResponseSchema = z.object({
  ...envelope,
  data: ProductShape,
});

export const UpdateProductResponseSchema = z.object({
  ...envelope,
  data: ProductShape,
});

export const PatchStatusResponseSchema = z.object({
  ...envelope,
  data: ProductShape,
});

export const DeleteProductResponseSchema = z.object({
  ...envelope,
  data: z.object({
    id: z.string().uuid(),
    deleted: z.literal(true),
  }),
});
