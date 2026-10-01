import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  ListApplicationsQuerySchema,
  ListApplicationsResponseSchema,
  ApplicationParamsSchema,
  GetApplicationResponseSchema,
  CreateApplicationBodySchema,
  CreateApplicationResponseSchema,
  UpdateApplicationBodySchema,
  UpdateApplicationResponseSchema,
  SetApplicationActiveBodySchema,
  SetApplicationActiveResponseSchema,
  DeleteApplicationResponseSchema,
} from "./applications.schema.js";
import {
  handleListApplications,
  handleGetApplication,
  handleCreateApplication,
  handleUpdateApplication,
  handleSetApplicationActive,
  handleDeleteApplication,
} from "./applications.controller.js";

export async function applicationsRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // ── GET /applications ──────────────────────────────────────────────────────
  app.get("/", {
    schema: {
      description: "Daftar aplikasi terdaftar dengan pagination dan filter",
      tags: ["applications"],
      querystring: ListApplicationsQuerySchema,
      response: { 200: ListApplicationsResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("application:list"),
    ],
  }, handleListApplications);

  // ── GET /applications/:id ──────────────────────────────────────────────────
  app.get("/:id", {
    schema: {
      description: "Detail aplikasi beserta role dan permission-nya",
      tags: ["applications"],
      params: ApplicationParamsSchema,
      response: { 200: GetApplicationResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("application:read"),
    ],
  }, handleGetApplication);

  // ── POST /applications ─────────────────────────────────────────────────────
  app.post("/", {
    schema: {
      description: "Daftarkan aplikasi baru ke ekosistem",
      tags: ["applications"],
      body: CreateApplicationBodySchema,
      response: { 201: CreateApplicationResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("application:create"),
    ],
  }, handleCreateApplication);

  // ── PATCH /applications/:id ────────────────────────────────────────────────
  app.patch("/:id", {
    schema: {
      description: "Update metadata aplikasi (name, description, baseUrl, icon). Kode tidak dapat diubah",
      tags: ["applications"],
      params: ApplicationParamsSchema,
      body: UpdateApplicationBodySchema,
      response: { 200: UpdateApplicationResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("application:update"),
    ],
  }, handleUpdateApplication);

  // ── PATCH /applications/:id/activate ───────────────────────────────────────
  app.patch("/:id/activate", {
    schema: {
      description: "Aktifkan atau nonaktifkan aplikasi — nonaktif mencabut seluruh sesi aplikasi itu",
      tags: ["applications"],
      params: ApplicationParamsSchema,
      body: SetApplicationActiveBodySchema,
      response: { 200: SetApplicationActiveResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("application:update"),
    ],
  }, handleSetApplicationActive);

  // ── DELETE /applications/:id ───────────────────────────────────────────────
  app.delete("/:id", {
    schema: {
      description: "Hapus aplikasi permanen beserta permission, role, dan menu-nya",
      tags: ["applications"],
      params: ApplicationParamsSchema,
      response: { 200: DeleteApplicationResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("application:delete"),
    ],
  }, handleDeleteApplication);
}
