import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { APP_CODES } from "~/common/constants/index.js";
import {
  ListBannersQuerySchema,
  ListBannersResponseSchema,
  PublicListBannersQuerySchema,
  PublicListBannersResponseSchema,
  BannerParamsSchema,
  GetBannerResponseSchema,
  CreateBannerBodySchema,
  CreateBannerResponseSchema,
  UpdateBannerBodySchema,
  UpdateBannerResponseSchema,
  SetBannerActiveBodySchema,
  ReorderBannersBodySchema,
  DeleteBannerResponseSchema,
} from "./banners.schema.js";
import {
  handleListBanners,
  handleGetPublicBanners,
  handleGetBannerById,
  handleCreateBanner,
  handleUpdateBanner,
  handleSetBannerActive,
  handleReorderBanners,
  handleDeleteBanner,
} from "./banners.controller.js";

export async function bannersRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // ── 1. Endpoint Publik (Portal Bapenda Profile) ─────────────────────────────
  app.get("/public", {
    schema: {
      description: "Daftar banner aktif untuk carousel/hero portal publik",
      tags: ["bapenda-banners"],
      querystring: PublicListBannersQuerySchema,
      response: { 200: PublicListBannersResponseSchema },
    },
  }, handleGetPublicBanners);

  // ── 2. Endpoint CMS / Internal (Pengelolaan Banner) ─────────────────────────
  app.get("/", {
    schema: {
      description: "Daftar seluruh banner untuk CMS dengan filter dan paginasi",
      tags: ["bapenda-banners"],
      querystring: ListBannersQuerySchema,
      response: { 200: ListBannersResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("banner:list", { app: APP_CODES.BAPENDA_PROFILE }),
    ],
  }, handleListBanners);

  app.get("/:id", {
    schema: {
      description: "Detail data banner untuk CMS",
      tags: ["bapenda-banners"],
      params: BannerParamsSchema,
      response: { 200: GetBannerResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("banner:read", { app: APP_CODES.BAPENDA_PROFILE }),
    ],
  }, handleGetBannerById);

  app.post("/", {
    schema: {
      description: "Menambah banner baru",
      tags: ["bapenda-banners"],
      body: CreateBannerBodySchema,
      response: { 201: CreateBannerResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("banner:create", { app: APP_CODES.BAPENDA_PROFILE }),
    ],
  }, handleCreateBanner);

  app.put("/:id", {
    schema: {
      description: "Memperbarui data banner",
      tags: ["bapenda-banners"],
      params: BannerParamsSchema,
      body: UpdateBannerBodySchema,
      response: { 200: UpdateBannerResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("banner:update", { app: APP_CODES.BAPENDA_PROFILE }),
    ],
  }, handleUpdateBanner);

  app.patch("/:id/active", {
    schema: {
      description: "Mengaktifkan atau menonaktifkan status banner",
      tags: ["bapenda-banners"],
      params: BannerParamsSchema,
      body: SetBannerActiveBodySchema,
      response: { 200: UpdateBannerResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("banner:update", { app: APP_CODES.BAPENDA_PROFILE }),
    ],
  }, handleSetBannerActive);

  app.patch("/reorder", {
    schema: {
      description: "Mengatur urutan sortOrder banner secara massal",
      tags: ["bapenda-banners"],
      body: ReorderBannersBodySchema,
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("banner:update", { app: APP_CODES.BAPENDA_PROFILE }),
    ],
  }, handleReorderBanners);

  app.delete("/:id", {
    schema: {
      description: "Menghapus (soft-delete) data banner",
      tags: ["bapenda-banners"],
      params: BannerParamsSchema,
      response: { 200: DeleteBannerResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("banner:delete", { app: APP_CODES.BAPENDA_PROFILE }),
    ],
  }, handleDeleteBanner);
}
