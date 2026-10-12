import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { APP_CODES } from "~/common/constants/index.js";
import {
  ArticleListResponseSchema,
  ArticleResponseSchema,
  CategoryListResponseSchema,
  CategoryResponseSchema,
  ChangeStatusBodySchema,
  CreateArticleBodySchema,
  CreateCategoryBodySchema,
  DeleteResponseSchema,
  IdParamsSchema,
  ListArticlesQuerySchema,
  ListCategoriesQuerySchema,
  PublicListArticlesQuerySchema,
  SetActiveBodySchema,
  SlugParamsSchema,
  UpdateArticleBodySchema,
  UpdateCategoryBodySchema,
} from "~/modules/shared/article/article.schema.js";
import {
  handleListPublicNews,
  handleGetPublicNewsBySlug,
  handleListPublicNewsCategories,
  handleListNews,
  handleGetNewsById,
  handleCreateNews,
  handleUpdateNews,
  handleChangeNewsStatus,
  handleDeleteNews,
  handleListNewsCategories,
  handleCreateNewsCategory,
  handleUpdateNewsCategory,
  handleSetNewsCategoryActive,
  handleDeleteNewsCategory,
} from "./news.controller.js";

const TAGS = ["bapenda-news"];
const guard = (fastify: FastifyInstance, permission: string) => [
  fastify.authenticate,
  fastify.requirePermission(permission, { app: APP_CODES.BAPENDA_PROFILE }),
];

export async function newsRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // ── 1. Endpoint Publik (Portal Bapenda Profile) ─────────────────────────────
  app.get("/public", {
    schema: {
      description: "Daftar berita terbit untuk portal publik (filter kategori & pencarian)",
      tags: TAGS,
      querystring: PublicListArticlesQuerySchema,
      response: { 200: ArticleListResponseSchema },
    },
  }, handleListPublicNews);

  app.get("/public/categories", {
    schema: {
      description: "Daftar kategori berita aktif",
      tags: TAGS,
      response: { 200: CategoryListResponseSchema },
    },
  }, handleListPublicNewsCategories);

  app.get("/public/:slug", {
    schema: {
      description: "Detail berita terbit berdasarkan slug + hitung pembaca",
      tags: TAGS,
      params: SlugParamsSchema,
      response: { 200: ArticleResponseSchema },
    },
  }, handleGetPublicNewsBySlug);

  // ── 2. Endpoint CMS: Kategori Berita ────────────────────────────────────────
  app.get("/categories", {
    schema: {
      description: "Daftar kategori berita untuk CMS",
      tags: TAGS,
      querystring: ListCategoriesQuerySchema,
      response: { 200: CategoryListResponseSchema },
    },
    preHandler: guard(fastify, "news-category:list"),
  }, handleListNewsCategories);

  app.post("/categories", {
    schema: {
      description: "Menambah kategori berita",
      tags: TAGS,
      body: CreateCategoryBodySchema,
      response: { 201: CategoryResponseSchema },
    },
    preHandler: guard(fastify, "news-category:create"),
  }, handleCreateNewsCategory);

  app.put("/categories/:id", {
    schema: {
      description: "Memperbarui kategori berita",
      tags: TAGS,
      params: IdParamsSchema,
      body: UpdateCategoryBodySchema,
      response: { 200: CategoryResponseSchema },
    },
    preHandler: guard(fastify, "news-category:update"),
  }, handleUpdateNewsCategory);

  app.patch("/categories/:id/active", {
    schema: {
      description: "Mengaktifkan atau menonaktifkan kategori berita",
      tags: TAGS,
      params: IdParamsSchema,
      body: SetActiveBodySchema,
      response: { 200: CategoryResponseSchema },
    },
    preHandler: guard(fastify, "news-category:update"),
  }, handleSetNewsCategoryActive);

  app.delete("/categories/:id", {
    schema: {
      description: "Menghapus (soft-delete) kategori berita yang tidak dipakai",
      tags: TAGS,
      params: IdParamsSchema,
      response: { 200: DeleteResponseSchema },
    },
    preHandler: guard(fastify, "news-category:delete"),
  }, handleDeleteNewsCategory);

  // ── 3. Endpoint CMS: Berita ─────────────────────────────────────────────────
  app.get("/", {
    schema: {
      description: "Daftar berita CMS (tanpa hak approve: hanya milik sendiri)",
      tags: TAGS,
      querystring: ListArticlesQuerySchema,
      response: { 200: ArticleListResponseSchema },
    },
    preHandler: guard(fastify, "news:list"),
  }, handleListNews);

  app.get("/:id", {
    schema: {
      description: "Detail berita untuk form edit CMS",
      tags: TAGS,
      params: IdParamsSchema,
      response: { 200: ArticleResponseSchema },
    },
    preHandler: guard(fastify, "news:read"),
  }, handleGetNewsById);

  app.post("/", {
    schema: {
      description: "Membuat berita baru (status DRAFT)",
      tags: TAGS,
      body: CreateArticleBodySchema,
      response: { 201: ArticleResponseSchema },
    },
    preHandler: guard(fastify, "news:create"),
  }, handleCreateNews);

  app.put("/:id", {
    schema: {
      description: "Memperbarui berita",
      tags: TAGS,
      params: IdParamsSchema,
      body: UpdateArticleBodySchema,
      response: { 200: ArticleResponseSchema },
    },
    preHandler: guard(fastify, "news:update"),
  }, handleUpdateNews);

  // Izin per aksi (news:approve/reject/publish) diperiksa di service.
  app.patch("/:id/status", {
    schema: {
      description: "Alur review berita: submit | approve | reject | publish | unpublish",
      tags: TAGS,
      params: IdParamsSchema,
      body: ChangeStatusBodySchema,
      response: { 200: ArticleResponseSchema },
    },
    preHandler: guard(fastify, "news:read"),
  }, handleChangeNewsStatus);

  app.delete("/:id", {
    schema: {
      description: "Menghapus (soft-delete) berita",
      tags: TAGS,
      params: IdParamsSchema,
      response: { 200: DeleteResponseSchema },
    },
    preHandler: guard(fastify, "news:delete"),
  }, handleDeleteNews);
}
