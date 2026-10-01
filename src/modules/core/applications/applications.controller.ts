import type { FastifyRequest, FastifyReply } from "fastify";
import { ok, accepted } from "~/common/types/index.js";
import {
  listApplications,
  listMyApplications,
  getApplicationById,
  createApplication,
  updateApplication,
  setApplicationActiveStatus,
  deleteApplication,
  CACHE_DEGRADED_NOTE,
} from "./applications.service.js";
import type {
  ListApplicationsQuery,
  CreateApplicationBody,
  UpdateApplicationBody,
  SetApplicationActiveBody,
} from "./applications.schema.js";

// ─── List ─────────────────────────────────────────────────────────────────────
export async function handleListApplications(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const result = await listApplications(request.query as ListApplicationsQuery);
  void reply.status(200).send({
    success: true,
    message: "Daftar aplikasi berhasil diambil",
    data: result.data,
    meta: result.meta,
  });
}

// ─── Get ──────────────────────────────────────────────────────────────────────
export async function handleGetApplication(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  void reply.status(200).send(ok(await getApplicationById(id)));
}

// ─── Milik Sendiri ────────────────────────────────────────────────────────────
export async function handleListMyApplications(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { sub, isSuperAdmin } = request.user;
  const apps = await listMyApplications(sub, isSuperAdmin);
  void reply.status(200).send(ok(apps, "Daftar aplikasi Anda berhasil diambil"));
}

// ─── Create ───────────────────────────────────────────────────────────────────
export async function handleCreateApplication(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const app = await createApplication(request.body as CreateApplicationBody);
  void reply.status(201).send(ok(app, "Aplikasi berhasil didaftarkan"));
}

// ─── Update ───────────────────────────────────────────────────────────────────
export async function handleUpdateApplication(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const app = await updateApplication(id, request.body as UpdateApplicationBody);
  void reply.status(200).send(ok(app, "Aplikasi berhasil diperbarui"));
}

// ─── Set Active ───────────────────────────────────────────────────────────────
export async function handleSetApplicationActive(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const { cacheCleared, ...result } = await setApplicationActiveStatus(
    id,
    (request.body as SetApplicationActiveBody).isActive,
  );
  const label = result.isActive ? "diaktifkan" : "dinonaktifkan";
  void reply
    .status(200)
    .send(ok(result, `Aplikasi berhasil ${label}${cacheCleared ? "" : CACHE_DEGRADED_NOTE}`));
}

// ─── Delete ───────────────────────────────────────────────────────────────────
export async function handleDeleteApplication(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const { cacheCleared } = await deleteApplication(id);
  void reply
    .status(200)
    .send(accepted(`Aplikasi berhasil dihapus${cacheCleared ? "" : CACHE_DEGRADED_NOTE}`));
}
