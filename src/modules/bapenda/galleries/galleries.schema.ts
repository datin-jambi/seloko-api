import { z } from "zod";
import { ARTICLE_ACTIONS } from "~/modules/shared/article/article.schema.js";

/** Galeri Bapenda (PRD 02 §E). Alur status = berita (PRD 02 §4). */

const nullableText = (max: number) => z.string().trim().max(max).optional().nullable();
const STATUSES = ["DRAFT", "PENDING_REVIEW", "APPROVED", "REJECTED", "PUBLISHED"] as const;

// ─── Query & Params ───────────────────────────────────────────────────────────
export const PublicListGalleriesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(12),
  search: z.string().trim().max(100).optional(),
});
export type PublicListGalleriesQuery = z.infer<typeof PublicListGalleriesQuerySchema>;

export const ListGalleriesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: z.enum(STATUSES).optional(),
  sortBy: z.enum(["createdAt", "updatedAt", "publishedAt", "title"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
export type ListGalleriesQuery = z.infer<typeof ListGalleriesQuerySchema>;

export const GalleryIdParamsSchema = z.object({
  id: z.string().uuid({ message: "ID harus berupa UUID yang valid" }),
});
export type GalleryIdParams = z.infer<typeof GalleryIdParamsSchema>;

export const GallerySlugParamsSchema = z.object({ slug: z.string().trim().min(1).max(220) });
export type GallerySlugParams = z.infer<typeof GallerySlugParamsSchema>;

export const GalleryItemParamsSchema = GalleryIdParamsSchema.extend({
  itemId: z.string().uuid({ message: "ID item harus berupa UUID yang valid" }),
});
export type GalleryItemParams = z.infer<typeof GalleryItemParamsSchema>;

// ─── Body ─────────────────────────────────────────────────────────────────────
export const GalleryItemInputSchema = z.object({
  mediaType: z.enum(["IMAGE", "VIDEO", "PDF"]).default("IMAGE"),
  fileUrl: z.string().trim().url({ message: "URL berkas harus valid" }),
  fileId: nullableText(100),
  title: nullableText(150),
  description: nullableText(1000),
});
export type GalleryItemInput = z.infer<typeof GalleryItemInputSchema>;

export const CreateGalleryBodySchema = z.object({
  title: z.string().trim().min(5, { message: "Judul minimal 5 karakter" }).max(200),
  slug: z.string().trim().max(220).optional(),
  description: nullableText(10000),
  coverImageUrl: z.string().trim().url({ message: "URL sampul harus valid" }).optional().nullable(),
  coverImageFileId: nullableText(100),
  /** Item awal opsional; bisa juga ditambah belakangan lewat /:id/items. */
  items: z.array(GalleryItemInputSchema).max(50).optional(),
});
export type CreateGalleryBody = z.infer<typeof CreateGalleryBodySchema>;

export const UpdateGalleryBodySchema = CreateGalleryBodySchema.omit({ items: true })
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: "Minimal satu field harus diisi" });
export type UpdateGalleryBody = z.infer<typeof UpdateGalleryBodySchema>;

export const GalleryStatusBodySchema = z.object({
  action: z.enum(ARTICLE_ACTIONS),
  note: z.string().trim().max(500).optional(),
});
export type GalleryStatusBody = z.infer<typeof GalleryStatusBodySchema>;

export const AddGalleryItemsBodySchema = z.object({
  items: z.array(GalleryItemInputSchema).min(1, { message: "Minimal satu item" }).max(50),
});
export type AddGalleryItemsBody = z.infer<typeof AddGalleryItemsBodySchema>;

export const ReorderGalleryItemsBodySchema = z.object({
  /** Seluruh ID item galeri dalam urutan baru — tidak boleh kurang atau lebih. */
  itemIds: z.array(z.string().uuid()).min(1).max(200),
});
export type ReorderGalleryItemsBody = z.infer<typeof ReorderGalleryItemsBodySchema>;

// ─── Response ─────────────────────────────────────────────────────────────────
const dateLike = z.date().or(z.string());

export const GalleryItemSchema = z.object({
  id: z.string(),
  mediaType: z.string(),
  fileUrl: z.string(),
  title: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  sortOrder: z.number(),
}).passthrough();

export const GallerySchema = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string(),
  description: z.string().nullable().optional(),
  coverImageUrl: z.string().nullable().optional(),
  status: z.string(),
  publishedAt: dateLike.nullable().optional(),
  createdAt: dateLike,
  updatedAt: dateLike,
  author: z.object({ id: z.string(), fullName: z.string() }).optional(),
  items: z.array(GalleryItemSchema).optional(),
  itemCount: z.number().optional(),
}).passthrough();

const envelope = <T extends z.ZodTypeAny>(data: T) =>
  z.object({ statusCode: z.number(), code: z.string(), message: z.string(), data });

export const GalleryResponseSchema = envelope(GallerySchema);
export const GalleryListResponseSchema = envelope(z.array(GallerySchema)).extend({
  meta: z.object({
    page: z.number(), limit: z.number(), totalItems: z.number(),
    totalPages: z.number(), hasNextPage: z.boolean(), hasPreviousPage: z.boolean(),
  }),
});
export const GalleryItemListResponseSchema = envelope(z.array(GalleryItemSchema));
export const GalleryDeleteResponseSchema = envelope(z.object({ id: z.string(), deleted: z.boolean() }));
