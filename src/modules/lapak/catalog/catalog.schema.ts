import { z } from "zod";
import { PublicProductCardShape } from "../products/products.schema.js";

/**
 * Profil OPD di katalog publik (LJ-1.6, PRD 04 §176).
 *
 * Endpoint ini hidup di modul lapak — bukan di `core/organizations` — karena
 * bentuk responsnya menggabungkan data OPD dengan katalog produk. Menaruhnya
 * di core akan memaksa core mengimpor modul lapak (coupling terbalik).
 */
export const CatalogOrgParamsSchema = z.object({
  code: z.string().trim().min(1).max(50).describe("Kode OPD, mis. BPSDM"),
});

export type CatalogOrgParams = z.infer<typeof CatalogOrgParamsSchema>;

export const CatalogOrgProductsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(12),
  category: z.string().trim().max(120).optional().describe("Slug kategori"),
  search: z.string().trim().max(100).optional(),
  sortBy: z.enum(["publishedAt", "name", "price"]).default("publishedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type CatalogOrgProductsQuery = z.infer<typeof CatalogOrgProductsQuerySchema>;

const envelope = {
  statusCode: z.number(),
  code: z.string(),
  message: z.string(),
} as const;

/** Profil ringkas OPD — hanya field yang aman & relevan untuk publik. */
export const PublicOrganizationProfileShape = z.object({
  code: z.string(),
  name: z.string(),
  shortName: z.string().nullable(),
  description: z.string().nullable(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  website: z.string().nullable(),
  logoUrl: z.string().nullable(),
  productCount: z.number().int().describe("Jumlah produk terbit milik OPD ini"),
});

export const PublicOrganizationProfileResponseSchema = z.object({
  ...envelope,
  data: PublicOrganizationProfileShape,
});

export const PublicOrganizationProductsResponseSchema = z.object({
  ...envelope,
  data: z.array(PublicProductCardShape),
  meta: z.object({
    page: z.number(),
    limit: z.number(),
    totalItems: z.number(),
    totalPages: z.number(),
    hasNextPage: z.boolean(),
    hasPreviousPage: z.boolean(),
  }),
});
