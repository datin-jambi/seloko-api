import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { APP_CODES } from "~/common/constants/index.js";
import {
  ArticleListResponseSchema,
  ArticleResponseSchema,
  ChangeStatusBodySchema,
  CreateArticleBodySchema,
  DeleteResponseSchema,
  IdParamsSchema,
  ListArticlesQuerySchema,
  PublicListArticlesQuerySchema,
  UpdateArticleBodySchema,
} from "~/modules/shared/article/article.schema.js";
import {
  handleListPublicNews,
  handleGetPublicNewsBySlug,
  handleListNews,
  handleGetNews,
  handleCreateNews,
  handleUpdateNews,
  handleChangeNewsStatus,
  handleDeleteNews,
} from "./news.controller.js";
import { ListNewsQuerySchema, OrgQuerySchema, OrgParamsSchema, OrgSlugParamsSchema } from "./news.schema.js";

/**
 * Berita OPD (LJ-4.1, PRD 04 §G).
 *
 * Tabel `articles` dipakai bersama dengan Bapenda; kolom `organizationId`
 * memisahkan kepemilikan. Tidak ada tabel berita khusus Lapak.
 *
 * Rute publik memakai kode OPD di URL agar tautan bisa dibagikan.
 * Rute CMS menentukan OPD dari penugasan user (Bapenda boleh memilih `organization`).
 */
export async function lapakNewsRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const LAPAK = APP_CODES.LAPAK_JAMBI_WEB;

  // ── Publik ──────────────────────────────────────────────────────────────────
  app.get("/public/:code", {
    schema: {
      description: "Daftar berita publik sebuah OPD (tanpa login)",
      tags: ["lapak-news"],
      params: OrgParamsSchema,
      querystring: PublicListArticlesQuerySchema,
      response: { 200: ArticleListResponseSchema },
    },
  }, handleListPublicNews);

  app.get("/public/:code/:slug", {
    schema: {
      description: "Detail berita publik sebuah OPD berdasarkan slug",
      tags: ["lapak-news"],
      params: OrgSlugParamsSchema,
      response: { 200: ArticleResponseSchema },
    },
  }, handleGetPublicNewsBySlug);

  // ── CMS: kelola berita OPD ──────────────────────────────────────────────────
  app.get("/", {
    schema: {
      description: "Daftar berita CMS (lingkup OPD). Bapenda boleh memilih ?organization=KODE",
      tags: ["lapak-news"],
      querystring: ListNewsQuerySchema,
      response: { 200: ArticleListResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("news:read", { app: LAPAK }),
    ],
  }, handleListNews);

  app.get("/:id", {
    schema: {
      description: "Detail berita (lingkup OPD)",
      querystring: OrgQuerySchema,
      tags: ["lapak-news"],
      params: IdParamsSchema,
      response: { 200: ArticleResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("news:read", { app: LAPAK }),
    ],
  }, handleGetNews);

  app.post("/", {
    schema: {
      description: "Buat berita OPD (status awal DRAFT)",
      querystring: OrgQuerySchema,
      tags: ["lapak-news"],
      body: CreateArticleBodySchema,
      response: { 201: ArticleResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("news:create", { app: LAPAK }),
    ],
  }, handleCreateNews);

  app.put("/:id", {
    schema: {
      description: "Perbarui berita OPD",
      querystring: OrgQuerySchema,
      tags: ["lapak-news"],
      params: IdParamsSchema,
      body: UpdateArticleBodySchema,
      response: { 200: ArticleResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("news:update", { app: LAPAK }),
    ],
  }, handleUpdateNews);

  app.patch("/:id/status", {
    schema: {
      description: "Ubah status berita (submit/approve/reject/publish/unpublish)",
      querystring: OrgQuerySchema,
      tags: ["lapak-news"],
      params: IdParamsSchema,
      body: ChangeStatusBodySchema,
      response: { 200: ArticleResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("news:update", { app: LAPAK }),
    ],
  }, handleChangeNewsStatus);

  app.delete("/:id", {
    schema: {
      description: "Hapus berita OPD (soft delete + pembersihan media)",
      querystring: OrgQuerySchema,
      tags: ["lapak-news"],
      params: IdParamsSchema,
      response: { 200: DeleteResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("news:delete", { app: LAPAK }),
    ],
  }, handleDeleteNews);
}
