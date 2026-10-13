import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { APP_CODES } from "~/common/constants/index.js";
import {
  ListPagesQuerySchema,
  PageParamsSchema,
  PageSlugParamsSchema,
  CreatePageBodySchema,
  UpdatePageBodySchema,
  SetPagePublishedBodySchema,
  PageResponseSchema,
  PageListResponseSchema,
  PublicPageListResponseSchema,
  DeletePageResponseSchema,
} from "./pages.schema.js";
import {
  handleListPublicPages,
  handleGetPublicPage,
  handleListPages,
  handleGetPageById,
  handleCreatePage,
  handleUpdatePage,
  handleSetPagePublished,
  handleDeletePage,
} from "./pages.controller.js";

const TAGS = ["bapenda-pages"];
const guard = (fastify: FastifyInstance, permission: string) => [
  fastify.authenticate,
  fastify.requirePermission(permission, { app: APP_CODES.BAPENDA_PROFILE }),
];

export async function pagesRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // ── 1. Endpoint Publik (Portal Bapenda Profile) ─────────────────────────────
  app.get("/public", {
    schema: {
      description: "Daftar halaman profil terbit (tanpa isi) untuk menu navigasi",
      tags: TAGS,
      response: { 200: PublicPageListResponseSchema },
    },
  }, handleListPublicPages);

  app.get("/public/:slug", {
    schema: {
      description: "Detail halaman profil terbit berdasarkan slug (mis. sejarah, visi-misi)",
      tags: TAGS,
      params: PageSlugParamsSchema,
      response: { 200: PageResponseSchema },
    },
  }, handleGetPublicPage);

  // ── 2. Endpoint CMS / Internal ──────────────────────────────────────────────
  app.get("/", {
    schema: {
      description: "Daftar halaman profil untuk CMS dengan filter dan paginasi",
      tags: TAGS,
      querystring: ListPagesQuerySchema,
      response: { 200: PageListResponseSchema },
    },
    preHandler: guard(fastify, "page:list"),
  }, handleListPages);

  app.get("/:id", {
    schema: {
      description: "Detail halaman profil untuk form edit CMS",
      tags: TAGS,
      params: PageParamsSchema,
      response: { 200: PageResponseSchema },
    },
    preHandler: guard(fastify, "page:read"),
  }, handleGetPageById);

  app.post("/", {
    schema: {
      description: "Menambah halaman profil (status draft)",
      tags: TAGS,
      body: CreatePageBodySchema,
      response: { 201: PageResponseSchema },
    },
    preHandler: guard(fastify, "page:create"),
  }, handleCreatePage);

  app.put("/:id", {
    schema: {
      description: "Memperbarui halaman profil",
      tags: TAGS,
      params: PageParamsSchema,
      body: UpdatePageBodySchema,
      response: { 200: PageResponseSchema },
    },
    preHandler: guard(fastify, "page:update"),
  }, handleUpdatePage);

  app.patch("/:id/publish", {
    schema: {
      description: "Menerbitkan atau menarik halaman profil ke draft",
      tags: TAGS,
      params: PageParamsSchema,
      body: SetPagePublishedBodySchema,
      response: { 200: PageResponseSchema },
    },
    preHandler: guard(fastify, "page:publish"),
  }, handleSetPagePublished);

  app.delete("/:id", {
    schema: {
      description: "Menghapus (soft-delete) halaman profil",
      tags: TAGS,
      params: PageParamsSchema,
      response: { 200: DeletePageResponseSchema },
    },
    preHandler: guard(fastify, "page:delete"),
  }, handleDeletePage);
}
