import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { APP_CODES } from "~/common/constants/index.js";
import {
  ListUptdsQuerySchema,
  ListUptdsResponseSchema,
  PublicListUptdsQuerySchema,
  PublicListUptdsResponseSchema,
  UptdParamsSchema,
  UptdCodeParamsSchema,
  GetUptdResponseSchema,
  CreateUptdBodySchema,
  CreateUptdResponseSchema,
  UpdateUptdBodySchema,
  UpdateUptdResponseSchema,
  SetUptdActiveBodySchema,
  SetUptdPublicMapBodySchema,
  DeleteUptdResponseSchema,
} from "./uptds.schema.js";
import {
  handleListUptds,
  handleGetPublicUptds,
  handleGetUptdById,
  handleGetUptdByCode,
  handleCreateUptd,
  handleUpdateUptd,
  handleSetUptdActive,
  handleSetUptdPublicMap,
  handleDeleteUptd,
} from "./uptds.controller.js";

export async function uptdsRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // ── 1. Endpoint Publik (Website Bapenda Profile & Peta Layanan) ─────────────
  app.get("/public", {
    schema: {
      description: "Daftar kantor layanan Samsat aktif untuk portal publik dan peta sebaran",
      tags: ["bapenda-uptds"],
      querystring: PublicListUptdsQuerySchema,
      response: { 200: PublicListUptdsResponseSchema },
    },
  }, handleGetPublicUptds);

  app.get("/public/:code", {
    schema: {
      description: "Detail kantor layanan Samsat berdasarkan kode untuk portal publik",
      tags: ["bapenda-uptds"],
      params: UptdCodeParamsSchema,
      response: { 200: GetUptdResponseSchema },
    },
  }, handleGetUptdByCode);

  // ── 2. Endpoint CMS / Internal (Pengelolaan Data UPTD) ───────────────────────
  app.get("/", {
    schema: {
      description: "Daftar seluruh UPTD Samsat untuk CMS dengan filter dan paginasi",
      tags: ["bapenda-uptds"],
      querystring: ListUptdsQuerySchema,
      response: { 200: ListUptdsResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("uptd:list", { app: APP_CODES.BAPENDA_PROFILE }),
    ],
  }, handleListUptds);

  app.get("/:id", {
    schema: {
      description: "Detail data UPTD Samsat untuk CMS",
      tags: ["bapenda-uptds"],
      params: UptdParamsSchema,
      response: { 200: GetUptdResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("uptd:read", { app: APP_CODES.BAPENDA_PROFILE }),
    ],
  }, handleGetUptdById);

  app.post("/", {
    schema: {
      description: "Menambah UPTD Samsat baru",
      tags: ["bapenda-uptds"],
      body: CreateUptdBodySchema,
      response: { 201: CreateUptdResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("uptd:create", { app: APP_CODES.BAPENDA_PROFILE }),
    ],
  }, handleCreateUptd);

  app.put("/:id", {
    schema: {
      description: "Memperbarui data UPTD Samsat",
      tags: ["bapenda-uptds"],
      params: UptdParamsSchema,
      body: UpdateUptdBodySchema,
      response: { 200: UpdateUptdResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("uptd:update", { app: APP_CODES.BAPENDA_PROFILE }),
    ],
  }, handleUpdateUptd);

  app.patch("/:id/active", {
    schema: {
      description: "Mengaktifkan atau menonaktifkan status UPTD Samsat",
      tags: ["bapenda-uptds"],
      params: UptdParamsSchema,
      body: SetUptdActiveBodySchema,
      response: { 200: UpdateUptdResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("uptd:update", { app: APP_CODES.BAPENDA_PROFILE }),
    ],
  }, handleSetUptdActive);

  app.patch("/:id/map", {
    schema: {
      description: "Mengatur visibilitas UPTD Samsat pada peta publik",
      tags: ["bapenda-uptds"],
      params: UptdParamsSchema,
      body: SetUptdPublicMapBodySchema,
      response: { 200: UpdateUptdResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("uptd:update", { app: APP_CODES.BAPENDA_PROFILE }),
    ],
  }, handleSetUptdPublicMap);

  app.delete("/:id", {
    schema: {
      description: "Menghapus (soft-delete) UPTD Samsat",
      tags: ["bapenda-uptds"],
      params: UptdParamsSchema,
      response: { 200: DeleteUptdResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("uptd:delete", { app: APP_CODES.BAPENDA_PROFILE }),
    ],
  }, handleDeleteUptd);
}
