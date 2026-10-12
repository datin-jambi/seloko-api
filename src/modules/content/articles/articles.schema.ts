import { z } from "zod";

// ─── Query Schemas ────────────────────────────────────────────────────────────
export const ListArticlesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: z.enum(["DRAFT", "PENDING_REVIEW", "APPROVED", "REJECTED", "PUBLISHED"]).optional(),
  categoryId: z.string().uuid().optional(),
  sortBy: z.enum(["createdAt", "updatedAt", "publishedAt", "title", "viewCount"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
export type ListArticlesQuery = z.infer<typeof ListArticlesQuerySchema>;

export const PublicListArticlesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(10),
  search: z.string().trim().max(100).optional(),
  category: z.string().trim().max(120).optional(),
});
export type PublicListArticlesQuery = z.infer<typeof PublicListArticlesQuerySchema>;

export const ListCategoriesQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  isActive: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
});
export type ListCategoriesQuery = z.infer<typeof ListCategoriesQuerySchema>;

// ─── Param Schemas ────────────────────────────────────────────────────────────
export const IdParamsSchema = z.object({
  id: z.string().uuid({ message: "ID harus berupa UUID yang valid" }),
});
export type IdParams = z.infer<typeof IdParamsSchema>;

export const SlugParamsSchema = z.object({
  slug: z.string().trim().min(1).max(255),
});
export type SlugParams = z.infer<typeof SlugParamsSchema>;

// ─── Body Schemas: Article ────────────────────────────────────────────────────
const nullableText = (max: number) => z.string().trim().max(max).optional().nullable();

export const CreateArticleBodySchema = z.object({
  categoryId: z.string().uuid({ message: "Kategori wajib dipilih" }),
  title: z
    .string()
    .trim()
    .min(5, { message: "Judul minimal 5 karakter" })
    .max(255, { message: "Judul maksimal 255 karakter" }),
  slug: z.string().trim().max(255).optional(),
  excerpt: nullableText(1000),
  content: z.string().trim().min(10, { message: "Konten minimal 10 karakter" }),
  thumbnailUrl: z.string().trim().url({ message: "URL thumbnail harus valid" }).optional().nullable(),
  thumbnailFileId: nullableText(100),
  seoTitle: nullableText(255),
  seoDescription: nullableText(500),
});
export type CreateArticleBody = z.infer<typeof CreateArticleBodySchema>;

export const UpdateArticleBodySchema = CreateArticleBodySchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: "Minimal satu field harus diisi" },
);
export type UpdateArticleBody = z.infer<typeof UpdateArticleBodySchema>;

export const ARTICLE_ACTIONS = ["submit", "approve", "reject", "publish", "unpublish"] as const;
export type ArticleAction = (typeof ARTICLE_ACTIONS)[number];

export const ChangeStatusBodySchema = z.object({
  action: z.enum(ARTICLE_ACTIONS),
  note: z.string().trim().max(500).optional(),
});
export type ChangeStatusBody = z.infer<typeof ChangeStatusBodySchema>;

// ─── Body Schemas: Category ───────────────────────────────────────────────────
export const CreateCategoryBodySchema = z.object({
  name: z.string().trim().min(2, { message: "Nama kategori minimal 2 karakter" }).max(100),
  slug: z.string().trim().max(120).optional(),
  description: z.string().trim().optional().nullable(),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});
export type CreateCategoryBody = z.infer<typeof CreateCategoryBodySchema>;

export const UpdateCategoryBodySchema = CreateCategoryBodySchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: "Minimal satu field harus diisi" },
);
export type UpdateCategoryBody = z.infer<typeof UpdateCategoryBodySchema>;

export const SetActiveBodySchema = z.object({ isActive: z.boolean() });
export type SetActiveBody = z.infer<typeof SetActiveBodySchema>;

// ─── Response Schemas ─────────────────────────────────────────────────────────
const dateLike = z.date().or(z.string());

export const CategoryItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable().optional(),
  isActive: z.boolean(),
  sortOrder: z.number(),
}).passthrough();

const CategoryRefSchema = z.object({ id: z.string(), name: z.string(), slug: z.string() });
// Hanya nama penulis — email/NIP/telepon tidak pernah keluar dari modul konten.
const AuthorRefSchema = z.object({ id: z.string(), fullName: z.string() });

export const ArticleItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string(),
  excerpt: z.string().nullable().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  status: z.string(),
  publishedAt: dateLike.nullable().optional(),
  viewCount: z.number(),
  createdAt: dateLike,
  updatedAt: dateLike,
  category: CategoryRefSchema.optional(),
  author: AuthorRefSchema.optional(),
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
  z.object({
    statusCode: z.number(),
    code: z.string(),
    message: z.string(),
    data,
  });

export const ArticleResponseSchema = envelope(ArticleItemSchema);
export const ArticleListResponseSchema = envelope(z.array(ArticleItemSchema)).extend({
  meta: PaginationMetaSchema,
});
export const CategoryResponseSchema = envelope(CategoryItemSchema);
export const CategoryListResponseSchema = envelope(z.array(CategoryItemSchema));
export const DeleteResponseSchema = envelope(z.object({ id: z.string(), deleted: z.boolean() }));
