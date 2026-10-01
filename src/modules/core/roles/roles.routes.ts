import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  ListRolesQuerySchema,
  ListRolesResponseSchema,
  RoleParamsSchema,
  GetRoleResponseSchema,
  CreateRoleBodySchema,
  CreateRoleResponseSchema,
  UpdateRoleBodySchema,
  UpdateRoleResponseSchema,
  SetRolePermissionsBodySchema,
  SetRolePermissionsResponseSchema,
  RolePermissionParamsSchema,
  RevokeRolePermissionResponseSchema,
  SetRoleActiveBodySchema,
  SetRoleActiveResponseSchema,
  DeleteRoleResponseSchema,
} from "./roles.schema.js";
import {
  handleListRoles,
  handleGetRole,
  handleCreateRole,
  handleUpdateRole,
  handleSetRolePermissions,
  handleRevokeRolePermission,
  handleSetRoleActive,
  handleDeleteRole,
} from "./roles.controller.js";

export async function rolesRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // ── GET /roles ─────────────────────────────────────────────────────────────
  app.get("/", {
    schema: {
      description: "Daftar role dengan pagination dan filter per aplikasi",
      tags: ["roles"],
      querystring: ListRolesQuerySchema,
      response: { 200: ListRolesResponseSchema },
    },
    preHandler: [fastify.authenticate, fastify.requirePermission("role:list")],
  }, handleListRoles);

  // ── GET /roles/:id ─────────────────────────────────────────────────────────
  app.get("/:id", {
    schema: {
      description:
        "Detail role beserta seluruh permission aplikasinya, ditandai mana yang dipegang",
      tags: ["roles"],
      params: RoleParamsSchema,
      response: { 200: GetRoleResponseSchema },
    },
    preHandler: [fastify.authenticate, fastify.requirePermission("role:read")],
  }, handleGetRole);

  // ── POST /roles ────────────────────────────────────────────────────────────
  app.post("/", {
    schema: {
      description: "Buat role baru pada satu aplikasi, sekaligus set permission-nya",
      tags: ["roles"],
      body: CreateRoleBodySchema,
      response: { 201: CreateRoleResponseSchema },
    },
    preHandler: [fastify.authenticate, fastify.requirePermission("role:create")],
  }, handleCreateRole);

  // ── PATCH /roles/:id ───────────────────────────────────────────────────────
  app.patch("/:id", {
    schema: {
      description: "Ubah nama atau deskripsi role. Aplikasi tidak dapat dipindah",
      tags: ["roles"],
      params: RoleParamsSchema,
      body: UpdateRoleBodySchema,
      response: { 200: UpdateRoleResponseSchema },
    },
    preHandler: [fastify.authenticate, fastify.requirePermission("role:update")],
  }, handleUpdateRole);

  // ── PUT /roles/:id/permissions ─────────────────────────────────────────────
  // PUT, bukan PATCH: body memuat SELURUH permission role, bukan tambahan.
  app.put("/:id/permissions", {
    schema: {
      description: "Setel ulang seluruh permission role — menggantikan yang ada",
      tags: ["roles"],
      params: RoleParamsSchema,
      body: SetRolePermissionsBodySchema,
      response: { 200: SetRolePermissionsResponseSchema },
    },
    preHandler: [fastify.authenticate, fastify.requirePermission("role:update")],
  }, handleSetRolePermissions);

  // ── DELETE /roles/:id/permissions/:permissionId ─────────────────────────────
  // Pelengkap PUT di atas: mencabut satu izin tanpa perlu mengirim daftar
  // lengkap. Mengirim permissionId yang tidak dipegang role → 404, bukan 200,
  // supaya pemanggil tidak menyangka ada yang berubah.
  app.delete("/:id/permissions/:permissionId", {
    schema: {
      description: "Cabut satu permission dari role",
      tags: ["roles"],
      params: RolePermissionParamsSchema,
      response: { 200: RevokeRolePermissionResponseSchema },
    },
    preHandler: [fastify.authenticate, fastify.requirePermission("role:update")],
  }, handleRevokeRolePermission);

  // ── PATCH /roles/:id/activate ──────────────────────────────────────────────
  app.patch("/:id/activate", {
    schema: {
      description:
        "Aktifkan atau nonaktifkan role — nonaktif mencabut izin seluruh pemegangnya",
      tags: ["roles"],
      params: RoleParamsSchema,
      body: SetRoleActiveBodySchema,
      response: { 200: SetRoleActiveResponseSchema },
    },
    preHandler: [fastify.authenticate, fastify.requirePermission("role:update")],
  }, handleSetRoleActive);

  // ── DELETE /roles/:id ──────────────────────────────────────────────────────
  app.delete("/:id", {
    schema: {
      description: "Hapus role permanen — ditolak bila masih dipegang pengguna",
      tags: ["roles"],
      params: RoleParamsSchema,
      response: { 200: DeleteRoleResponseSchema },
    },
    preHandler: [fastify.authenticate, fastify.requirePermission("role:delete")],
  }, handleDeleteRole);
}
