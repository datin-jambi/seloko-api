import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { APP_CODES } from "~/common/constants/index.js";
import {
  ListCategoriesQuerySchema,
  ListCategoriesResponseSchema,
  PublicListCategoriesQuerySchema,
  PublicListCategoriesResponseSchema,
  CategoryParamsSchema,
  CategorySlugParamsSchema,
  GetCategoryResponseSchema,
  PublicGetCategoryResponseSchema,
  CreateCategoryBodySchema,
  CreateCategoryResponseSchema,
  UpdateCategoryBodySchema,
  UpdateCategoryResponseSchema,
  SetCategoryActiveBodySchema,
  ReorderCategoriesBodySchema,
  ReorderCategoriesResponseSchema,
  DeleteCategoryResponseSchema,
} from "./categories.schema.js";
import {
  handleListCategories,
  handleGetPublicCategories,
  handleGetCategoryById,
  handleGetPublicCategoryBySlug,
  handleCreateCategory,
  handleUpdateCategory,
  handleSetCategoryActive,
  handleReorderCategories,
  handleDeleteCategory,
} from "./categories.controller.js";

/**
 * Kategori layanan aset daerah — master yang dikelola Bapenda (PRD 04 §3).
 * Endpoint CMS memakai permission `category:*` milik aplikasi Lapak Web;
 * wewenang ini TIDAK dimiliki admin OPD (lihat seed roles `allowedEntities`).
 */
export async function lapakCategoriesRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const LAPAK = APP_CODES.LAPAK_JAMBI_WEB;

  // ── 1. Endpoint Publik (portal Lapak Jambi) ─────────────────────────────────
  app.get("/public", {
    schema: {
      description: "Daftar kategori layanan aktif untuk portal publik (urut sortOrder)",
      tags: ["lapak-categories"],
      querystring: PublicListCategoriesQuerySchema,
      response: { 200: PublicListCategoriesResponseSchema },
    },
  }, handleGetPublicCategories);

  // Didaftarkan sebelum "/:id" agar slug tidak tertelan param UUID.
  app.get("/public/:slug", {
    schema: {
      description: "Detail kategori aktif berdasarkan slug untuk portal publik",
      tags: ["lapak-categories"],
      params: CategorySlugParamsSchema,
      response: { 200: PublicGetCategoryResponseSchema },
    },
  }, handleGetPublicCategoryBySlug);

  // ── 2. Endpoint CMS (seloko, Bapenda saja) ──────────────────────────────────
  app.get("/", {
    schema: {
      description: "Daftar seluruh kategori untuk CMS dengan filter dan paginasi",
      tags: ["lapak-categories"],
      querystring: ListCategoriesQuerySchema,
      response: { 200: ListCategoriesResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("category:list", { app: LAPAK }),
    ],
  }, handleListCategories);

  app.get("/:id", {
    schema: {
      description: "Detail kategori untuk CMS",
      tags: ["lapak-categories"],
      params: CategoryParamsSchema,
      response: { 200: GetCategoryResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("category:read", { app: LAPAK }),
    ],
  }, handleGetCategoryById);

  app.post("/", {
    schema: {
      description: "Menambah kategori layanan baru (Bapenda)",
      tags: ["lapak-categories"],
      body: CreateCategoryBodySchema,
      response: { 201: CreateCategoryResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("category:create", { app: LAPAK }),
    ],
  }, handleCreateCategory);

  app.patch("/reorder", {
    schema: {
      description: "Mengurutkan ulang kategori secara massal (urutan tampil portal)",
      tags: ["lapak-categories"],
      body: ReorderCategoriesBodySchema,
      response: { 200: ReorderCategoriesResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("category:update", { app: LAPAK }),
    ],
  }, handleReorderCategories);

  app.put("/:id", {
    schema: {
      description: "Memperbarui kategori layanan",
      tags: ["lapak-categories"],
      params: CategoryParamsSchema,
      body: UpdateCategoryBodySchema,
      response: { 200: UpdateCategoryResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("category:update", { app: LAPAK }),
    ],
  }, handleUpdateCategory);

  app.patch("/:id/active", {
    schema: {
      description: "Mengaktifkan atau menonaktifkan kategori",
      tags: ["lapak-categories"],
      params: CategoryParamsSchema,
      body: SetCategoryActiveBodySchema,
      response: { 200: UpdateCategoryResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("category:update", { app: LAPAK }),
    ],
  }, handleSetCategoryActive);

  app.delete("/:id", {
    schema: {
      description: "Menghapus (soft-delete) kategori layanan",
      tags: ["lapak-categories"],
      params: CategoryParamsSchema,
      response: { 200: DeleteCategoryResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("category:delete", { app: LAPAK }),
    ],
  }, handleDeleteCategory);
}
