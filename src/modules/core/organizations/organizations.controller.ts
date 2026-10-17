import type { FastifyReply, FastifyRequest } from "fastify";
import { ok, accepted } from "~/common/types/index.js";
import {
  listOrganizations,
  listPublicOrganizations,
  getOrganizationById,
  getPublicOrganizationByCode,
  createOrganization,
  updateOrganization,
  setOrganizationActiveStatus,
  deleteOrganization,
} from "./organizations.service.js";
import type {
  OrganizationParams,
  OrganizationCodeParams,
  ListOrganizationsQuery,
  PublicListOrganizationsQuery,
  CreateOrganizationBody,
  UpdateOrganizationBody,
  SetOrganizationActiveBody,
} from "./organizations.schema.js";

// ─── Publik ───────────────────────────────────────────────────────────────────
export async function handleListPublicOrganizations(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const data = await listPublicOrganizations(request.query as PublicListOrganizationsQuery);
  void reply.status(200).send(ok(data, "Daftar OPD berhasil diambil"));
}

export async function handleGetPublicOrganization(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { code } = request.params as OrganizationCodeParams;
  void reply.status(200).send(ok(await getPublicOrganizationByCode(code), "Profil OPD berhasil diambil"));
}

// ─── CMS ──────────────────────────────────────────────────────────────────────
export async function handleListOrganizations(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const result = await listOrganizations(request.query as ListOrganizationsQuery);
  void reply.status(200).send({
    success: true,
    message: "Daftar organisasi berhasil diambil",
    data: result.data,
    meta: result.meta,
  });
}

export async function handleGetOrganization(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as OrganizationParams;
  void reply.status(200).send(ok(await getOrganizationById(id), "Detail organisasi berhasil diambil"));
}

export async function handleCreateOrganization(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const org = await createOrganization(request.body as CreateOrganizationBody);
  void reply.status(201).send(ok(org, "Organisasi berhasil dibuat"));
}

export async function handleUpdateOrganization(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as OrganizationParams;
  const org = await updateOrganization(id, request.body as UpdateOrganizationBody);
  void reply.status(200).send(ok(org, "Organisasi berhasil diperbarui"));
}

export async function handleSetOrganizationActive(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as OrganizationParams;
  const { isActive } = request.body as SetOrganizationActiveBody;
  const org = await setOrganizationActiveStatus(id, isActive);
  void reply.status(200).send(ok(org, `Organisasi berhasil ${isActive ? "diaktifkan" : "dinonaktifkan"}`));
}

export async function handleDeleteOrganization(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as OrganizationParams;
  await deleteOrganization(id);
  void reply.status(200).send(accepted("Organisasi berhasil dihapus"));
}
