import { z } from "zod";

// ─── Query Schemas ────────────────────────────────────────────────────────────
export const ListPagesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(100).optional(),
  isPublished: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  sortBy: z.enum(["title", "createdAt", "updatedAt"]).default("title"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});
export type ListPagesQuery = z.infer<typeof ListPagesQuerySchema>;

// ─── Param Schemas ────────────────────────────────────────────────────────────
export const PageParamsSchema = z.object({
  id: z.string().uuid({ message: "ID halaman harus berupa UUID yang valid" }),
});
export type PageParams = z.infer<typeof PageParamsSchema>;

export const PageSlugParamsSchema = z.object({
  slug: z.string().trim().min(1).max(220),
});
export type PageSlugParams = z.infer<typeof PageSlugParamsSchema>;

// ─── Body Schemas ─────────────────────────────────────────────────────────────
export const CreatePageBodySchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, { message: "Judul halaman minimal 2 karakter" })
    .max(200, { message: "Judul halaman maksimal 200 karakter" }),
  slug: z.string().trim().max(220).optional(),
  content: z.string().trim().min(10, { message: "Konten minimal 10 karakter" }),
  seoTitle: z.string().trim().max(255).optional().nullable(),
  seoDescription: z.string().trim().max(500).optional().nullable(),
});
export type CreatePageBody = z.infer<typeof CreatePageBodySchema>;

export const UpdatePageBodySchema = CreatePageBodySchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: "Minimal satu field harus diisi" },
);
export type UpdatePageBody = z.infer<typeof UpdatePageBodySchema>;

export const SetPagePublishedBodySchema = z.object({ isPublished: z.boolean() });
export type SetPagePublishedBody = z.infer<typeof SetPagePublishedBodySchema>;

// ─── Response Schemas ─────────────────────────────────────────────────────────
const dateLike = z.date().or(z.string());

export const PageItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string(),
  content: z.string().optional(),
  seoTitle: z.string().nullable().optional(),
  seoDescription: z.string().nullable().optional(),
  isPublished: z.boolean(),
  publishedAt: dateLike.nullable().optional(),
  createdAt: dateLike,
  updatedAt: dateLike,
}).passthrough();

export const PaginationMetaSchema = z.object({
  page: z.number(),
  limit: z.number(),
  totalItems: z.number(),
  totalPages: z.number(),
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
});

const envelope = <T extends z.ZodTypeAny>(data: T) =>
  z.object({ statusCode: z.number(), code: z.string(), message: z.string(), data });

export const PageResponseSchema = envelope(PageItemSchema);
export const PageListResponseSchema = envelope(z.array(PageItemSchema)).extend({ meta: PaginationMetaSchema });
export const PublicPageListResponseSchema = envelope(z.array(PageItemSchema));
export const DeletePageResponseSchema = envelope(z.object({ id: z.string(), deleted: z.boolean() }));
