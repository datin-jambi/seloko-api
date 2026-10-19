import { z } from "zod";

/**
 * FAQ & Kategori FAQ portal Bapenda (PRD 02 §F).
 * Tanpa alur review — terbit lewat toggle `PATCH /:id/publish` (seperti halaman profil).
 */

const nullableText = (max: number) => z.string().trim().max(max).optional().nullable();
const boolQuery = z
  .enum(["true", "false"])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === "true"));

// ─── Query & Params ───────────────────────────────────────────────────────────
export const PublicListFaqsQuerySchema = z.object({
  /** Slug kategori. */
  category: z.string().trim().max(120).optional(),
  search: z.string().trim().max(100).optional(),
});
export type PublicListFaqsQuery = z.infer<typeof PublicListFaqsQuerySchema>;

export const ListFaqsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(100).optional(),
  categoryId: z.string().uuid().optional(),
  isPublished: boolQuery,
  sortBy: z.enum(["sortOrder", "createdAt", "updatedAt", "viewCount", "question"]).default("sortOrder"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});
export type ListFaqsQuery = z.infer<typeof ListFaqsQuerySchema>;

export const ListFaqCategoriesQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  isActive: boolQuery,
});
export type ListFaqCategoriesQuery = z.infer<typeof ListFaqCategoriesQuerySchema>;

export const FaqIdParamsSchema = z.object({
  id: z.string().uuid({ message: "ID harus berupa UUID yang valid" }),
});
export type FaqIdParams = z.infer<typeof FaqIdParamsSchema>;

// ─── Body: FAQ ────────────────────────────────────────────────────────────────
export const CreateFaqBodySchema = z.object({
  categoryId: z.string().uuid({ message: "Kategori wajib dipilih" }),
  question: z.string().trim().min(5, { message: "Pertanyaan minimal 5 karakter" }).max(500),
  slug: z.string().trim().max(500).optional(),
  answer: z.string().trim().min(5, { message: "Jawaban minimal 5 karakter" }),
  sortOrder: z.number().int().min(0).optional(),
});
export type CreateFaqBody = z.infer<typeof CreateFaqBodySchema>;

export const UpdateFaqBodySchema = CreateFaqBodySchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: "Minimal satu field harus diisi" },
);
export type UpdateFaqBody = z.infer<typeof UpdateFaqBodySchema>;

export const PublishFaqBodySchema = z.object({ isPublished: z.boolean() });
export type PublishFaqBody = z.infer<typeof PublishFaqBodySchema>;

export const ReorderFaqsBodySchema = z.object({
  /** Seluruh ID FAQ (belum terhapus) dalam SATU kategori, urutan baru. */
  categoryId: z.string().uuid(),
  faqIds: z.array(z.string().uuid()).min(1).max(500),
});
export type ReorderFaqsBody = z.infer<typeof ReorderFaqsBodySchema>;

// ─── Body: Kategori ───────────────────────────────────────────────────────────
export const CreateFaqCategoryBodySchema = z.object({
  name: z.string().trim().min(2, { message: "Nama kategori minimal 2 karakter" }).max(100),
  slug: z.string().trim().max(120).optional(),
  description: nullableText(1000),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});
export type CreateFaqCategoryBody = z.infer<typeof CreateFaqCategoryBodySchema>;

export const UpdateFaqCategoryBodySchema = CreateFaqCategoryBodySchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: "Minimal satu field harus diisi" },
);
export type UpdateFaqCategoryBody = z.infer<typeof UpdateFaqCategoryBodySchema>;

export const SetFaqCategoryActiveBodySchema = z.object({ isActive: z.boolean() });
export type SetFaqCategoryActiveBody = z.infer<typeof SetFaqCategoryActiveBodySchema>;

// ─── Response ─────────────────────────────────────────────────────────────────
const dateLike = z.date().or(z.string());

export const FaqCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable().optional(),
  sortOrder: z.number(),
  isActive: z.boolean(),
}).passthrough();

export const FaqSchema = z.object({
  id: z.string(),
  question: z.string(),
  slug: z.string(),
  answer: z.string(),
  sortOrder: z.number(),
  isPublished: z.boolean(),
  viewCount: z.number(),
  publishedAt: dateLike.nullable().optional(),
  createdAt: dateLike,
  updatedAt: dateLike,
  category: z.object({ id: z.string(), name: z.string(), slug: z.string() }).optional(),
  author: z.object({ id: z.string(), fullName: z.string() }).optional(),
  updatedBy: z.object({ id: z.string(), fullName: z.string() }).nullable().optional(),
}).passthrough();

const envelope = <T extends z.ZodTypeAny>(data: T) =>
  z.object({ statusCode: z.number(), code: z.string(), message: z.string(), data });

const metaSchema = z.object({
  page: z.number(), limit: z.number(), totalItems: z.number(),
  totalPages: z.number(), hasNextPage: z.boolean(), hasPreviousPage: z.boolean(),
});

export const FaqResponseSchema = envelope(FaqSchema);
export const FaqListResponseSchema = envelope(z.array(FaqSchema)).extend({ meta: metaSchema });
export const PublicFaqListResponseSchema = envelope(z.array(FaqSchema));
export const FaqViewResponseSchema = envelope(z.object({ id: z.string(), viewCount: z.number() }));
export const FaqCategoryResponseSchema = envelope(FaqCategorySchema);
export const FaqCategoryListResponseSchema = envelope(z.array(FaqCategorySchema));
export const FaqDeleteResponseSchema = envelope(z.object({ id: z.string(), deleted: z.boolean() }));
