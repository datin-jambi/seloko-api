import { z } from "zod";

// ─── Query Schemas ────────────────────────────────────────────────────────────
export const ListUptdsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional(),
  isActive: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  showOnPublicMap: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  sortBy: z.enum(["name", "code", "city", "createdAt"]).default("name"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

export type ListUptdsQuery = z.infer<typeof ListUptdsQuerySchema>;

export const PublicListUptdsQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional(),
});

export type PublicListUptdsQuery = z.infer<typeof PublicListUptdsQuerySchema>;

// ─── Param Schemas ────────────────────────────────────────────────────────────
export const UptdParamsSchema = z.object({
  id: z.string().uuid({ message: "ID UPTD harus berupa UUID yang valid" }),
});

export type UptdParams = z.infer<typeof UptdParamsSchema>;

export const UptdCodeParamsSchema = z.object({
  code: z.string().trim().min(2).max(50),
});

export type UptdCodeParams = z.infer<typeof UptdCodeParamsSchema>;

// ─── Body Schemas ─────────────────────────────────────────────────────────────
export const CreateUptdBodySchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, { message: "Kode UPTD minimal 2 karakter" })
    .max(50, { message: "Kode UPTD maksimal 50 karakter" })
    .regex(/^[a-z0-9_-]+$/i, { message: "Kode hanya boleh huruf, angka, strip, atau underscore" }),
  name: z
    .string()
    .trim()
    .min(3, { message: "Nama UPTD minimal 3 karakter" })
    .max(150, { message: "Nama UPTD maksimal 150 karakter" }),
  description: z.string().trim().optional(),
  address: z.string().trim().optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().email({ message: "Format email tidak valid" }).max(100).optional(),
  headName: z.string().trim().max(150).optional(),
  province: z.string().trim().max(50).default("Jambi"),
  city: z.string().trim().max(100).optional(),
  district: z.string().trim().max(100).optional(),
  subDistrict: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(10).optional(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  googleMapsUrl: z.string().trim().url({ message: "Format URL Google Maps tidak valid" }).optional().nullable(),
  isActive: z.boolean().default(true),
  showOnPublicMap: z.boolean().default(false),
});

export type CreateUptdBody = z.infer<typeof CreateUptdBodySchema>;

export const UpdateUptdBodySchema = CreateUptdBodySchema.partial();
export type UpdateUptdBody = z.infer<typeof UpdateUptdBodySchema>;

export const SetUptdActiveBodySchema = z.object({
  isActive: z.boolean(),
});
export type SetUptdActiveBody = z.infer<typeof SetUptdActiveBodySchema>;

export const SetUptdPublicMapBodySchema = z.object({
  showOnPublicMap: z.boolean(),
});
export type SetUptdPublicMapBody = z.infer<typeof SetUptdPublicMapBodySchema>;

// ─── Response Schemas ─────────────────────────────────────────────────────────
export const UptdItemSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  headName: z.string().nullable().optional(),
  province: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  district: z.string().nullable().optional(),
  subDistrict: z.string().nullable().optional(),
  postalCode: z.string().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  googleMapsUrl: z.string().nullable().optional(),
  isActive: z.boolean(),
  showOnPublicMap: z.boolean(),
  createdAt: z.date().or(z.string()),
  updatedAt: z.date().or(z.string()),
}).passthrough();

export type UptdItem = z.infer<typeof UptdItemSchema>;

export const PaginationMetaSchema = z.object({
  page: z.number(),
  limit: z.number(),
  totalItems: z.number(),
  totalPages: z.number(),
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
});

export const ListUptdsResponseSchema = z.object({
  statusCode: z.number().default(200),
  code: z.string().default("SUCCESS"),
  message: z.string(),
  data: z.array(UptdItemSchema),
  meta: PaginationMetaSchema,
});

export const PublicListUptdsResponseSchema = z.object({
  statusCode: z.number().default(200),
  code: z.string().default("SUCCESS"),
  message: z.string(),
  data: z.array(UptdItemSchema),
});

export const GetUptdResponseSchema = z.object({
  statusCode: z.number().default(200),
  code: z.string().default("SUCCESS"),
  message: z.string(),
  data: UptdItemSchema,
});

export const CreateUptdResponseSchema = z.object({
  statusCode: z.number().default(201),
  code: z.string().default("SUCCESS"),
  message: z.string(),
  data: UptdItemSchema,
});

export const UpdateUptdResponseSchema = z.object({
  statusCode: z.number().default(200),
  code: z.string().default("SUCCESS"),
  message: z.string(),
  data: UptdItemSchema,
});

export const DeleteUptdResponseSchema = z.object({
  statusCode: z.number().default(200),
  code: z.string().default("SUCCESS"),
  message: z.string(),
  data: z.object({
    id: z.string(),
    deleted: z.boolean(),
  }),
});
