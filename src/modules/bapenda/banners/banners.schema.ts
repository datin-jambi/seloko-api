import { z } from "zod";

// ─── Query Schemas ────────────────────────────────────────────────────────────
export const ListBannersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(100).optional(),
  isActive: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  sortBy: z.enum(["sortOrder", "createdAt", "title"]).default("sortOrder"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

export type ListBannersQuery = z.infer<typeof ListBannersQuerySchema>;

export const PublicListBannersQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(20).default(10),
});

export type PublicListBannersQuery = z.infer<typeof PublicListBannersQuerySchema>;

// ─── Param Schemas ────────────────────────────────────────────────────────────
export const BannerParamsSchema = z.object({
  id: z.string().uuid({ message: "ID Banner harus berupa UUID yang valid" }),
});

export type BannerParams = z.infer<typeof BannerParamsSchema>;

// ─── Body Schemas ─────────────────────────────────────────────────────────────
export const CreateBannerBodySchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, { message: "Judul banner minimal 3 karakter" })
    .max(150, { message: "Judul banner maksimal 150 karakter" }),
  description: z.string().trim().optional().nullable(),
  imageUrl: z.string().trim().url({ message: "URL gambar banner harus valid" }),
  imageFileId: z.string().trim().max(100).optional().nullable(),
  mobileImageUrl: z
    .string()
    .trim()
    .url({ message: "URL gambar banner mobile harus berupa URL valid" })
    .optional()
    .nullable(),
  mobileImageFileId: z.string().trim().max(100).optional().nullable(),
  buttonText: z.string().trim().max(50).optional().nullable(),
  buttonUrl: z.string().trim().max(255).optional().nullable(),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export type CreateBannerBody = z.infer<typeof CreateBannerBodySchema>;

export const UpdateBannerBodySchema = CreateBannerBodySchema.partial();
export type UpdateBannerBody = z.infer<typeof UpdateBannerBodySchema>;

export const SetBannerActiveBodySchema = z.object({
  isActive: z.boolean(),
});
export type SetBannerActiveBody = z.infer<typeof SetBannerActiveBodySchema>;

export const ReorderBannersBodySchema = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid({ message: "ID Banner harus berupa UUID valid" }),
      sortOrder: z.number().int(),
    }),
  ).min(1, { message: "Daftar urutan banner minimal 1 item" }),
});
export type ReorderBannersBody = z.infer<typeof ReorderBannersBodySchema>;

// ─── Response Schemas ─────────────────────────────────────────────────────────
export const BannerItemSchema = z.object({
  id: z.string(),
  applicationId: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  imageUrl: z.string(),
  imageFileId: z.string().nullable().optional(),
  mobileImageUrl: z.string().nullable().optional(),
  mobileImageFileId: z.string().nullable().optional(),
  buttonText: z.string().nullable().optional(),
  buttonUrl: z.string().nullable().optional(),
  sortOrder: z.number(),
  isActive: z.boolean(),
  createdAt: z.date().or(z.string()),
  updatedAt: z.date().or(z.string()),
}).passthrough();

export type BannerItem = z.infer<typeof BannerItemSchema>;

export const PaginationMetaSchema = z.object({
  page: z.number(),
  limit: z.number(),
  totalItems: z.number(),
  totalPages: z.number(),
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
});

export const ListBannersResponseSchema = z.object({
  statusCode: z.number().default(200),
  code: z.string().default("SUCCESS"),
  message: z.string(),
  data: z.array(BannerItemSchema),
  meta: PaginationMetaSchema,
});

export const PublicListBannersResponseSchema = z.object({
  statusCode: z.number().default(200),
  code: z.string().default("SUCCESS"),
  message: z.string(),
  data: z.array(BannerItemSchema),
});

export const GetBannerResponseSchema = z.object({
  statusCode: z.number().default(200),
  code: z.string().default("SUCCESS"),
  message: z.string(),
  data: BannerItemSchema,
});

export const CreateBannerResponseSchema = z.object({
  statusCode: z.number().default(201),
  code: z.string().default("SUCCESS"),
  message: z.string(),
  data: BannerItemSchema,
});

export const UpdateBannerResponseSchema = z.object({
  statusCode: z.number().default(200),
  code: z.string().default("SUCCESS"),
  message: z.string(),
  data: BannerItemSchema,
});

export const DeleteBannerResponseSchema = z.object({
  statusCode: z.number().default(200),
  code: z.string().default("SUCCESS"),
  message: z.string(),
  data: z.object({
    id: z.string(),
    deleted: z.boolean(),
  }),
});
