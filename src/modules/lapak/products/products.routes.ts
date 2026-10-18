import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { APP_CODES } from "~/common/constants/index.js";
import {
  ListProductsQuerySchema,
  ListProductsResponseSchema,
  PublicListProductsQuerySchema,
  PublicListProductsResponseSchema,
  ProductParamsSchema,
  ProductSlugParamsSchema,
  ProductActionParamsSchema,
  GetProductResponseSchema,
  PublicGetProductResponseSchema,
  CreateProductBodySchema,
  CreateProductResponseSchema,
  UpdateProductBodySchema,
  UpdateProductResponseSchema,
  PatchStatusResponseSchema,
  DeleteProductResponseSchema,
} from "./products.schema.js";
import {
  handleListProducts,
  handleGetPublicProducts,
  handleGetProductById,
  handleGetPublicProductBySlug,
  handleCreateProduct,
  handleUpdateProduct,
  handlePatchProductStatus,
  handleDeleteProduct,
} from "./products.controller.js";

/**
 * Produk / aset Lapak (PRD 04 Fase 1). Izin `product:*` milik aplikasi
 * Lapak Web; admin-opd boleh mengelola produk OPD-nya, manajer-opd
 * menyetujui/menerbitkan, Bapenda melihat semuanya. Penjagaan lingkup OPD
 * terjadi di service lewat `user_app_role_organizations`.
 */
export async function lapakProductsRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const LAPAK = APP_CODES.LAPAK_JAMBI_WEB;

  // ── 1. Endpoint Publik (portal Lapak Jambi) ─────────────────────────────────
  app.get("/public", {
    schema: {
      description: "Katalog publik: produk terbit dengan filter kategori/OPD/harga + paginasi",
      tags: ["lapak-products"],
      querystring: PublicListProductsQuerySchema,
      response: { 200: PublicListProductsResponseSchema },
    },
  }, handleGetPublicProducts);

  // Didaftarkan sebelum "/:id" agar slug tidak tertelan param UUID.
  app.get("/public/:slug", {
    schema: {
      description: "Detail produk terbit berdasarkan slug untuk halaman katalog publik",
      tags: ["lapak-products"],
      params: ProductSlugParamsSchema,
      response: { 200: PublicGetProductResponseSchema },
    },
  }, handleGetPublicProductBySlug);

  // ── 2. Endpoint CMS (seloko, INTERNAL) ──────────────────────────────────────
  app.get("/", {
    schema: {
      description: "Daftar produk untuk CMS — OPD hanya melihat produknya, Bapenda semuanya",
      tags: ["lapak-products"],
      querystring: ListProductsQuerySchema,
      response: { 200: ListProductsResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("product:list", { app: LAPAK }),
    ],
  }, handleListProducts);

  app.get("/:id", {
    schema: {
      description: "Detail produk untuk CMS (termasuk tarif/addon/persyaratan/fasilitas/gambar)",
      tags: ["lapak-products"],
      params: ProductParamsSchema,
      response: { 200: GetProductResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("product:read", { app: LAPAK }),
    ],
  }, handleGetProductById);

  app.post("/", {
    schema: {
      description: "Menambah produk baru (status DRAFT). Tiga atribut opsional diwarisi kategori.",
      tags: ["lapak-products"],
      body: CreateProductBodySchema,
      response: { 201: CreateProductResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("product:create", { app: LAPAK }),
    ],
  }, handleCreateProduct);

  app.put("/:id", {
    schema: {
      description: "Memperbarui produk beserta tarif/addon/persyaratan/fasilitas/gambar (replace-set)",
      tags: ["lapak-products"],
      params: ProductParamsSchema,
      body: UpdateProductBodySchema,
      response: { 200: UpdateProductResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("product:update", { app: LAPAK }),
    ],
  }, handleUpdateProduct);

  app.patch("/:id/status/:action", {
    schema: {
      description:
        "Transisi alur persetujuan: submit | approve | reject | publish | unpublish. " +
        "approve/reject butuh product:approve|reject, publish/unpublish butuh product:publish — dalam lingkup OPD.",
      tags: ["lapak-products"],
      params: ProductActionParamsSchema,
      response: { 200: PatchStatusResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("product:read", { app: LAPAK }),
    ],
  }, handlePatchProductStatus);

  app.delete("/:id", {
    schema: {
      description: "Menghapus (soft-delete) produk. Produk terbit harus di-unpublish dahulu.",
      tags: ["lapak-products"],
      params: ProductParamsSchema,
      response: { 200: DeleteProductResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("product:delete", { app: LAPAK }),
    ],
  }, handleDeleteProduct);
}
