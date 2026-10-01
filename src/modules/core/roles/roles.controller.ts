import type { FastifyRequest, FastifyReply } from "fastify";
import { ok, accepted } from "~/common/types/index.js";
import {
  listRoles,
  getRoleById,
  createRole,
  updateRole,
  setRolePermissions,
  revokeRolePermission,
  setRoleActiveStatus,
  deleteRole,
  CACHE_DEGRADED_NOTE,
} from "./roles.service.js";
import type {
  ListRolesQuery,
  CreateRoleBody,
  UpdateRoleBody,
  SetRolePermissionsBody,
  RolePermissionParams,
  SetRoleActiveBody,
} from "./roles.schema.js";

// ─── List ─────────────────────────────────────────────────────────────────────
export async function handleListRoles(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const result = await listRoles(request.query as ListRolesQuery);
  void reply.status(200).send({
    success: true,
    message: "Daftar role berhasil diambil",
    data: result.data,
    meta: result.meta,
  });
}

// ─── Get ──────────────────────────────────────────────────────────────────────
export async function handleGetRole(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  void reply.status(200).send(ok(await getRoleById(id)));
}

// ─── Create ───────────────────────────────────────────────────────────────────
export async function handleCreateRole(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const role = await createRole(request.body as CreateRoleBody);
  void reply.status(201).send(ok(role, "Role berhasil dibuat"));
}

// ─── Update ───────────────────────────────────────────────────────────────────
export async function handleUpdateRole(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const role = await updateRole(id, request.body as UpdateRoleBody);
  void reply.status(200).send(ok(role, "Role berhasil diperbarui"));
}

// ─── Set Permissions ──────────────────────────────────────────────────────────
export async function handleSetRolePermissions(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const { cacheCleared, ...result } = await setRolePermissions(
    id,
    (request.body as SetRolePermissionsBody).permissionIds,
  );
  void reply.status(200).send(
    ok(
      result,
      `Permission role berhasil disetel — ${result.granted} ditambah, ` +
        `${result.revoked} dicabut${cacheCleared ? "" : CACHE_DEGRADED_NOTE}`,
    ),
  );
}

// ─── Revoke Satu Permission ───────────────────────────────────────────────────
export async function handleRevokeRolePermission(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id, permissionId } = request.params as RolePermissionParams;
  const { cacheCleared, ...result } = await revokeRolePermission(id, permissionId);
  void reply
    .status(200)
    .send(ok(result, `Permission berhasil dicabut${cacheCleared ? "" : CACHE_DEGRADED_NOTE}`));
}

// ─── Set Active ───────────────────────────────────────────────────────────────
export async function handleSetRoleActive(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const { cacheCleared, ...result } = await setRoleActiveStatus(
    id,
    (request.body as SetRoleActiveBody).isActive,
  );
  const label = result.isActive ? "diaktifkan" : "dinonaktifkan";
  void reply
    .status(200)
    .send(ok(result, `Role berhasil ${label}${cacheCleared ? "" : CACHE_DEGRADED_NOTE}`));
}

// ─── Delete ───────────────────────────────────────────────────────────────────
export async function handleDeleteRole(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const { cacheCleared } = await deleteRole(id);
  void reply
    .status(200)
    .send(accepted(`Role berhasil dihapus${cacheCleared ? "" : CACHE_DEGRADED_NOTE}`));
}
