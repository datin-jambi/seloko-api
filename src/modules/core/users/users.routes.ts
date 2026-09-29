import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
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
      fastify.requirePermission("user:list"),
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
      fastify.requirePermission("user:read"),
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
      fastify.requirePermission("user:create"),
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
      fastify.requirePermission("user:update"),
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
      fastify.requirePermission("user:update"),
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
      fastify.requirePermission("user:delete"),
    ],
  }, handleDeleteUser);

  // ── POST /users/:id/roles ──────────────────────────────────────────────────
  app.post("/:id/roles", {
    schema: {
      description: "Tugaskan role ke pengguna pada aplikasi tertentu",
      tags: ["users"],
      params: UserParamsSchema,
      body: AssignRoleBodySchema,
      response: { 201: AssignRoleResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("user-app-role:create"),
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
      fastify.requirePermission("user-app-role:delete"),
    ],
  }, handleRevokeRole);
}
