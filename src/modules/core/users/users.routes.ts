import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { APP_CODES } from "~/common/constants/index.js";
import {
  ListUsersQuerySchema,
  ListUsersResponseSchema,
  UserParamsSchema,
  GetUserResponseSchema,
  CreateUserBodySchema,
  CreateUserResponseSchema,
  UpdateUserBodySchema,
  UpdateUserResponseSchema,
  SetActiveBodySchema,
  SetActiveResponseSchema,
  DeleteUserResponseSchema,
  AssignRoleBodySchema,
  AssignRoleResponseSchema,
  ListRoleAssignmentsQuerySchema,
  ListRoleAssignmentsResponseSchema,
  RevokeRoleParamsSchema,
  RevokeRoleResponseSchema,
} from "./users.schema.js";
import {
  handleListUsers,
  handleGetUser,
  handleCreateUser,
  handleUpdateUser,
  handleSetActive,
  handleDeleteUser,
  handleAssignRole,
  handleListRoleAssignments,
  handleRevokeRole,
} from "./users.controller.js";

export async function usersRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // ── GET /users ─────────────────────────────────────────────────────────────
  app.get("/", {
    schema: {
      description: "Daftar pengguna dengan pagination dan filter",
      tags: ["users"],
      querystring: ListUsersQuerySchema,
      response: { 200: ListUsersResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("user:list", { app: APP_CODES.SELOKO }),
    ],
  }, handleListUsers);

  // ── GET /users/:id ─────────────────────────────────────────────────────────
  app.get("/:id", {
    schema: {
      description: "Detail satu pengguna beserta penugasan role-nya",
      tags: ["users"],
      params: UserParamsSchema,
      response: { 200: GetUserResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("user:read", { app: APP_CODES.SELOKO }),
    ],
  }, handleGetUser);

  // ── POST /users ────────────────────────────────────────────────────────────
  app.post("/", {
    schema: {
      description: "Buat pengguna baru",
      tags: ["users"],
      body: CreateUserBodySchema,
      response: { 201: CreateUserResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("user:create", { app: APP_CODES.SELOKO }),
    ],
  }, handleCreateUser);

  // ── PATCH /users/:id ───────────────────────────────────────────────────────
  app.patch("/:id", {
    schema: {
      description: "Update profil pengguna (fullName, phone, avatar, nip, isSuperAdmin)",
      tags: ["users"],
      params: UserParamsSchema,
      body: UpdateUserBodySchema,
      response: { 200: UpdateUserResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("user:update", { app: APP_CODES.SELOKO }),
    ],
  }, handleUpdateUser);

  // ── PATCH /users/:id/activate ──────────────────────────────────────────────
  app.patch("/:id/activate", {
    schema: {
      description: "Aktifkan atau nonaktifkan pengguna",
      tags: ["users"],
      params: UserParamsSchema,
      body: SetActiveBodySchema,
      response: { 200: SetActiveResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("user:update", { app: APP_CODES.SELOKO }),
    ],
  }, handleSetActive);

  // ── DELETE /users/:id ──────────────────────────────────────────────────────
  app.delete("/:id", {
    schema: {
      description: "Soft-delete pengguna — data historis tetap tersimpan",
      tags: ["users"],
      params: UserParamsSchema,
      response: { 200: DeleteUserResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("user:delete", { app: APP_CODES.SELOKO }),
    ],
  }, handleDeleteUser);

  // ── GET /users/:id/roles ──────────────────────────────────────────────────
  // Didaftarkan sebelum POST agar maksudnya jelas; path-nya berbeda method.
  app.get("/:id/roles", {
    schema: {
      description: "Daftar penugasan role user dengan paginasi, filter aplikasi/role/OPD/status",
      tags: ["users"],
      params: UserParamsSchema,
      querystring: ListRoleAssignmentsQuerySchema,
      response: { 200: ListRoleAssignmentsResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("user-app-role:list", { app: APP_CODES.SELOKO }),
    ],
  }, handleListRoleAssignments);

  // ── POST /users/:id/roles ──────────────────────────────────────────────────
  app.post("/:id/roles", {
    schema: {
      description: "Tugaskan role ke pengguna pada aplikasi tertentu, opsional dibatasi ke OPD tertentu",
      tags: ["users"],
      params: UserParamsSchema,
      body: AssignRoleBodySchema,
      response: { 201: AssignRoleResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("user-app-role:create", { app: APP_CODES.SELOKO }),
    ],
  }, handleAssignRole);

  // ── DELETE /users/:id/roles/:userAppRoleId ─────────────────────────────────
  app.delete("/:id/roles/:userAppRoleId", {
    schema: {
      description: "Cabut penugasan role dari pengguna",
      tags: ["users"],
      params: RevokeRoleParamsSchema,
      response: { 200: RevokeRoleResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("user-app-role:delete", { app: APP_CODES.SELOKO }),
    ],
  }, handleRevokeRole);
}
