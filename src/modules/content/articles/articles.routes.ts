import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { ContentScope } from "./articles.service.js";
import { createArticleHandlers } from "./articles.controller.js";
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
} from "./articles.schema.js";

/**
 * Route konten universal. Dipasang sekali per jenis konten:
 *   api.register(articlesRoutes, { prefix: "/bapenda/news", scope: {...NEWS} })
 * Kategori di `/categories`, permission `<entity>-category:*`.
 */
export async function articlesRoutes(
  fastify: FastifyInstance,
  opts: { scope: ContentScope },
): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const { scope } = opts;
  const h = createArticleHandlers(scope);
  const tags = [`${scope.appCode}-${scope.entity}`];
  const guard = (code: string) => [
    fastify.authenticate,
    fastify.requirePermission(code, { app: scope.appCode }),
  ];
  const perm = (action: string) => guard(`${scope.entity}:${action}`);
  const catPerm = (action: string) => guard(`${scope.entity}-category:${action}`);

  // ── Publik ────────────────────────────────────────────────────────────────
  app.get("/public", {
    schema: {
      description: `Daftar ${scope.label} terbit untuk portal publik`,
      tags,
      querystring: PublicListArticlesQuerySchema,
      response: { 200: ArticleListResponseSchema },
    },
  }, h.listPublic);

  app.get("/public/categories", {
    schema: {
      description: `Kategori ${scope.label} aktif`,
      tags,
      response: { 200: CategoryListResponseSchema },
    },
  }, h.listPublicCategories);

  app.get("/public/:slug", {
    schema: {
      description: `Detail ${scope.label} terbit + hitung pembaca`,
      tags,
      params: SlugParamsSchema,
      response: { 200: ArticleResponseSchema },
    },
  }, h.getPublicBySlug);

  // ── CMS: Kategori ─────────────────────────────────────────────────────────
  app.get("/categories", {
    schema: { tags, querystring: ListCategoriesQuerySchema, response: { 200: CategoryListResponseSchema } },
    preHandler: catPerm("list"),
  }, h.listCategories);

  app.post("/categories", {
    schema: { tags, body: CreateCategoryBodySchema, response: { 201: CategoryResponseSchema } },
    preHandler: catPerm("create"),
  }, h.createCategory);

  app.put("/categories/:id", {
    schema: { tags, params: IdParamsSchema, body: UpdateCategoryBodySchema, response: { 200: CategoryResponseSchema } },
    preHandler: catPerm("update"),
  }, h.updateCategory);

  app.patch("/categories/:id/active", {
    schema: { tags, params: IdParamsSchema, body: SetActiveBodySchema, response: { 200: CategoryResponseSchema } },
    preHandler: catPerm("update"),
  }, h.setCategoryActive);

  app.delete("/categories/:id", {
    schema: { tags, params: IdParamsSchema, response: { 200: DeleteResponseSchema } },
    preHandler: catPerm("delete"),
  }, h.removeCategory);

  // ── CMS: Konten ───────────────────────────────────────────────────────────
  app.get("/", {
    schema: {
      description: `Daftar ${scope.label} CMS (tanpa hak approve: hanya milik sendiri)`,
      tags,
      querystring: ListArticlesQuerySchema,
      response: { 200: ArticleListResponseSchema },
    },
    preHandler: perm("list"),
  }, h.list);

  app.get("/:id", {
    schema: { tags, params: IdParamsSchema, response: { 200: ArticleResponseSchema } },
    preHandler: perm("read"),
  }, h.getById);

  app.post("/", {
    schema: { tags, body: CreateArticleBodySchema, response: { 201: ArticleResponseSchema } },
    preHandler: perm("create"),
  }, h.create);

  app.put("/:id", {
    schema: { tags, params: IdParamsSchema, body: UpdateArticleBodySchema, response: { 200: ArticleResponseSchema } },
    preHandler: perm("update"),
  }, h.update);

  // Izin per aksi (approve/reject/publish) diperiksa di service.
  app.patch("/:id/status", {
    schema: {
      description: "Alur review: submit | approve | reject | publish | unpublish",
      tags,
      params: IdParamsSchema,
      body: ChangeStatusBodySchema,
      response: { 200: ArticleResponseSchema },
    },
    preHandler: perm("read"),
  }, h.changeStatus);

  app.delete("/:id", {
    schema: { tags, params: IdParamsSchema, response: { 200: DeleteResponseSchema } },
    preHandler: perm("delete"),
  }, h.remove);
}
