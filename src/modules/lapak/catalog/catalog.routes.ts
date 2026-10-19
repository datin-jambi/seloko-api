import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  CatalogOrgParamsSchema,
  CatalogOrgProductsQuerySchema,
  PublicOrganizationProfileResponseSchema,
  PublicOrganizationProductsResponseSchema,
} from "./catalog.schema.js";
import {
  handleGetOrganizationProducts,
  handleGetOrganizationProfile,
} from "./catalog.controller.js";

/**
 * Katalog publik OPD (LJ-1.6, PRD 04 §176).
 *
 * Semua rute di sini PUBLIK — tanpa autentikasi. Endpoint ini melengkapi
 * `/api/lapak/products/public` dan `/api/lapak/categories/public` agar
 * halaman SEO `/lapak/opd/:code` bisa dirender dalam satu permintaan profil
 * tanpa harus memanggil core organizations secara terpisah.
 */
export async function lapakCatalogRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get("/organizations/:code", {
    schema: {
      description: "Profil publik OPD di katalog Lapak (tanpa login)",
      tags: ["lapak-catalog"],
      params: CatalogOrgParamsSchema,
      response: { 200: PublicOrganizationProfileResponseSchema },
    },
  }, handleGetOrganizationProfile);

  app.get("/organizations/:code/products", {
    schema: {
      description: "Produk terbit milik satu OPD, dengan filter & paginasi katalog",
      tags: ["lapak-catalog"],
      params: CatalogOrgParamsSchema,
      querystring: CatalogOrgProductsQuerySchema,
      response: { 200: PublicOrganizationProductsResponseSchema },
    },
  }, handleGetOrganizationProducts);
}
