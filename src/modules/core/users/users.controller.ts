import type { FastifyRequest, FastifyReply } from "fastify";
import { ok, accepted } from "~/common/types/index.js";
import {
  listUsers,
  getUserById,
  createUser,
  updateUser,
  setUserActiveStatus,
  softDeleteUser,
  assignRole,
  revokeRole,
} from "./users.service.js";
import type {
  ListUsersQuery,
  CreateUserBody,
  UpdateUserBody,
  SetActiveBody,
  AssignRoleBody,
} from "./users.schema.js";

// ─── List Users ───────────────────────────────────────────────────────────────
export async function handleListUsers(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const result = await listUsers(request.query as ListUsersQuery);
  void reply.status(200).send({
    success: true,
    message: "Daftar pengguna berhasil diambil",
    data: result.data,
    meta: result.meta,
  });
}

// ─── Get User ─────────────────────────────────────────────────────────────────
export async function handleGetUser(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const user = await getUserById(id);
  void reply.status(200).send(ok(user));
}

// ─── Create User ──────────────────────────────────────────────────────────────
export async function handleCreateUser(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const user = await createUser(request.body as CreateUserBody);
  void reply.status(201).send(ok(user, "Pengguna berhasil dibuat"));
}

// ─── Update User ──────────────────────────────────────────────────────────────
export async function handleUpdateUser(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const user = await updateUser(id, request.body as UpdateUserBody);
  void reply.status(200).send(ok(user, "Pengguna berhasil diperbarui"));
}

// ─── Set Active Status ────────────────────────────────────────────────────────
export async function handleSetActive(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const result = await setUserActiveStatus(id, (request.body as SetActiveBody).isActive);
  const label = result.isActive ? "diaktifkan" : "dinonaktifkan";
  void reply.status(200).send(ok(result, `Pengguna berhasil ${label}`));
}

// ─── Delete User ──────────────────────────────────────────────────────────────
export async function handleDeleteUser(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  await softDeleteUser(id, request.user.sub);
  void reply.status(200).send(accepted("Pengguna berhasil dihapus"));
}

// ─── Assign Role ──────────────────────────────────────────────────────────────
export async function handleAssignRole(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const uar = await assignRole(id, request.body as AssignRoleBody, request.user.sub);
  void reply.status(201).send(ok(uar, "Role berhasil ditugaskan"));
}

// ─── Revoke Role ──────────────────────────────────────────────────────────────
export async function handleRevokeRole(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id, userAppRoleId } = request.params as { id: string; userAppRoleId: string };
  await revokeRole(id, userAppRoleId);
  void reply.status(200).send(accepted("Role berhasil dicabut"));
}
