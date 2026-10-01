import type { FastifyRequest, FastifyReply } from "fastify";
import { ok } from "~/common/types/index.js";
import {
  listPermissions,
  listModules,
  getMyPermissions,
  getPermissionById,
  createPermission,
  updatePermission,
  deletePermission,
  CACHE_DEGRADED_NOTE,
} from "./permissions.service.js";
import type {
  ListPermissionsQuery,
  ListModulesQuery,
  MyPermissionsParams,
  CreatePermissionBody,
  UpdatePermissionBody,
} from "./permissions.schema.js";

// ─── List ─────────────────────────────────────────────────────────────────────
export async function handleListPermissions(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const result = await listPermissions(request.query as ListPermissionsQuery);
  void reply.status(200).send({
    success: true,
    message: "Daftar permission berhasil diambil",
    data: result.data,
    meta: result.meta,
  });
}

// ─── Modules ──────────────────────────────────────────────────────────────────
export async function handleListModules(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const modules = await listModules(request.query as ListModulesQuery);
  void reply.status(200).send(ok(modules, "Daftar modul berhasil diambil"));
}

// ─── Milik Sendiri ────────────────────────────────────────────────────────────
export async function handleGetMyPermissions(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { applicationId } = request.params as MyPermissionsParams;
  const userId = request.user.sub;
  void reply.status(200).send(ok(await getMyPermissions(userId, applicationId)));
}

// ─── Get ──────────────────────────────────────────────────────────────────────
export async function handleGetPermission(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  void reply.status(200).send(ok(await getPermissionById(id)));
}

// ─── Create ───────────────────────────────────────────────────────────────────
export async function handleCreatePermission(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const permission = await createPermission(request.body as CreatePermissionBody);
  void reply.status(201).send(ok(permission, "Permission berhasil dibuat"));
}

// ─── Update ───────────────────────────────────────────────────────────────────
export async function handleUpdatePermission(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const permission = await updatePermission(id, request.body as UpdatePermissionBody);
  void reply.status(200).send(ok(permission, "Permission berhasil diperbarui"));
}

// ─── Delete ───────────────────────────────────────────────────────────────────
export async function handleDeletePermission(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const { cacheCleared, ...impact } = await deletePermission(id);

  // Jumlah terdampak ikut dilaporkan supaya operator yang menghapus tanpa
  // membaca detail lebih dulu tetap tahu apa yang barusan ikut berubah.
  const parts: string[] = [];
  if (impact.revokedFromRoles > 0) {
    parts.push(`dicabut dari ${impact.revokedFromRoles} role`);
  }
  if (impact.unguardedMenus > 0) {
    parts.push(`${impact.unguardedMenus} menu kini terbuka tanpa izin ini`);
  }
  const impactNote = parts.length > 0 ? ` — ${parts.join(", ")}` : "";

  void reply
    .status(200)
    .send(
      ok(
        impact,
        `Permission berhasil dihapus${impactNote}${cacheCleared ? "" : CACHE_DEGRADED_NOTE}`,
      ),
    );
}
