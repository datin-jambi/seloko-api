import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  ListPermissionsQuerySchema,
  ListPermissionsResponseSchema,
  ListModulesQuerySchema,
  ListModulesResponseSchema,
  MyPermissionsParamsSchema,
  MyPermissionsResponseSchema,
  PermissionParamsSchema,
  GetPermissionResponseSchema,
  CreatePermissionBodySchema,
  CreatePermissionResponseSchema,
  UpdatePermissionBodySchema,
  UpdatePermissionResponseSchema,
  DeletePermissionResponseSchema,
} from "./permissions.schema.js";
import {
  handleListPermissions,
  handleListModules,
  handleGetMyPermissions,
  handleGetPermission,
  handleCreatePermission,
  handleUpdatePermission,
  handleDeletePermission,
} from "./permissions.controller.js";

export async function permissionsRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // ── GET /permissions/modules ───────────────────────────────────────────────
  // Sebelum "/:id": "modules" akan dicocokkan sebagai UUID dan kena 400.
  app.get("/modules", {
    schema: {
      description: "Daftar modul distingtif beserta jumlah permission — isi dropdown filter",
      tags: ["permissions"],
      querystring: ListModulesQuerySchema,
      response: { 200: ListModulesResponseSchema },
    },
    preHandler: [fastify.authenticate, fastify.requirePermission("permission:list")],
  }, handleListModules);

  // ── GET /permissions/:applicationId/me ─────────────────────────────────────
  // TANPA requirePermission: isinya izin si pemanggil sendiri. Menuntut
  // "permission:read" akan mengunci justru pengguna yang paling butuh — dan
  // pengguna aplikasi lain tidak akan pernah punya izin itu di appCode-nya.
  // Didaftarkan sebelum "/:id" agar "…/me" tidak dicocokkan sebagai UUID.
  app.get("/:applicationId/me", {
    schema: {
      description: "Permission efektif milik pemanggil pada satu aplikasi",
      tags: ["permissions"],
      params: MyPermissionsParamsSchema,
      response: { 200: MyPermissionsResponseSchema },
    },
    preHandler: [fastify.authenticate],
  }, handleGetMyPermissions);

  // ── GET /permissions ───────────────────────────────────────────────────────
  app.get("/", {
    schema: {
      description: "Daftar permission dengan pagination, filter aplikasi dan modul",
      tags: ["permissions"],
      querystring: ListPermissionsQuerySchema,
      response: { 200: ListPermissionsResponseSchema },
    },
    preHandler: [fastify.authenticate, fastify.requirePermission("permission:list")],
  }, handleListPermissions);

  // ── GET /permissions/:id ───────────────────────────────────────────────────
  app.get("/:id", {
    schema: {
      description: "Detail permission beserta role dan menu yang memakainya",
      tags: ["permissions"],
      params: PermissionParamsSchema,
      response: { 200: GetPermissionResponseSchema },
    },
    preHandler: [fastify.authenticate, fastify.requirePermission("permission:read")],
  }, handleGetPermission);

  // ── POST /permissions ──────────────────────────────────────────────────────
  app.post("/", {
    schema: {
      description: "Buat permission baru pada satu aplikasi",
      tags: ["permissions"],
      body: CreatePermissionBodySchema,
      response: { 201: CreatePermissionResponseSchema },
    },
    preHandler: [fastify.authenticate, fastify.requirePermission("permission:create")],
  }, handleCreatePermission);

  // ── PATCH /permissions/:id ─────────────────────────────────────────────────
  app.patch("/:id", {
    schema: {
      description: "Ubah nama atau modul permission. Kode dan aplikasi tidak dapat diubah",
      tags: ["permissions"],
      params: PermissionParamsSchema,
      body: UpdatePermissionBodySchema,
      response: { 200: UpdatePermissionResponseSchema },
    },
    preHandler: [fastify.authenticate, fastify.requirePermission("permission:update")],
  }, handleUpdatePermission);

  // ── DELETE /permissions/:id ────────────────────────────────────────────────
  app.delete("/:id", {
    schema: {
      description:
        "Hapus permission permanen — izin tercabut dari semua role, menu yang memakainya menjadi terbuka",
      tags: ["permissions"],
      params: PermissionParamsSchema,
      response: { 200: DeletePermissionResponseSchema },
    },
    preHandler: [fastify.authenticate, fastify.requirePermission("permission:delete")],
  }, handleDeletePermission);
}
