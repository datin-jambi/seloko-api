import { z } from "zod";

/**
 * Regulasi & dokumen PDF (PRD 02 §G).
 * Status cukup DRAFT/PUBLISHED — tanpa alur review.
 */

const nullableText = (max: number) => z.string().trim().max(max).optional().nullable();

// ─── Query & Params ───────────────────────────────────────────────────────────
export const PublicListRegulationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(10),
  search: z.string().trim().max(100).optional(),
});
export type PublicListRegulationsQuery = z.infer<typeof PublicListRegulationsQuerySchema>;

export const ListRegulationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: z.enum(["DRAFT", "PENDING_REVIEW", "APPROVED", "REJECTED", "PUBLISHED"]).optional(),
  sortBy: z.enum(["createdAt", "updatedAt", "publishedAt", "title"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
export type ListRegulationsQuery = z.infer<typeof ListRegulationsQuerySchema>;

export const RegulationIdParamsSchema = z.object({
  id: z.string().uuid({ message: "ID harus berupa UUID yang valid" }),
});
export type RegulationIdParams = z.infer<typeof RegulationIdParamsSchema>;

export const RegulationSlugParamsSchema = z.object({ slug: z.string().trim().min(1).max(255) });
export type RegulationSlugParams = z.infer<typeof RegulationSlugParamsSchema>;

// ─── Body ─────────────────────────────────────────────────────────────────────
export const CreateRegulationBodySchema = z.object({
  title: z.string().trim().min(5, { message: "Judul minimal 5 karakter" }).max(255),
  slug: z.string().trim().max(255).optional(),
  description: nullableText(5000),
  /** URL PDF dari `POST /api/storage/upload`. */
  fileUrl: z.string().trim().url({ message: "URL berkas harus valid" }),
  fileId: nullableText(100),
  fileName: nullableText(255),
  fileSize: z.number().int().min(0).max(50 * 1024 * 1024).optional().nullable(),
});
export type CreateRegulationBody = z.infer<typeof CreateRegulationBodySchema>;

export const UpdateRegulationBodySchema = CreateRegulationBodySchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: "Minimal satu field harus diisi" },
);
export type UpdateRegulationBody = z.infer<typeof UpdateRegulationBodySchema>;

export const RegulationStatusBodySchema = z.object({
  status: z.enum(["DRAFT", "PUBLISHED"]),
});
export type RegulationStatusBody = z.infer<typeof RegulationStatusBodySchema>;

// ─── Response ─────────────────────────────────────────────────────────────────
const dateLike = z.date().or(z.string());

export const RegulationSchema = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string(),
  description: z.string().nullable().optional(),
  fileUrl: z.string(),
  fileId: z.string().nullable().optional(),
  fileName: z.string().nullable().optional(),
  fileSize: z.number().nullable().optional(),
  status: z.string(),
  publishedAt: dateLike.nullable().optional(),
  createdAt: dateLike,
  updatedAt: dateLike,
}).passthrough();

const envelope = <T extends z.ZodTypeAny>(data: T) =>
  z.object({ statusCode: z.number(), code: z.string(), message: z.string(), data });

export const RegulationResponseSchema = envelope(RegulationSchema);
export const RegulationListResponseSchema = envelope(z.array(RegulationSchema)).extend({
  meta: z.object({
    page: z.number(), limit: z.number(), totalItems: z.number(),
    totalPages: z.number(), hasNextPage: z.boolean(), hasPreviousPage: z.boolean(),
  }),
});
export const RegulationDeleteResponseSchema = envelope(z.object({ id: z.string(), deleted: z.boolean() }));
