import type { FastifyReply, FastifyRequest } from "fastify";
import { HttpStatus } from "~/common/errors/index.js";
import {
  listSkrdSettings,
  upsertSkrdSetting,
  deleteSkrdSetting,
  issueSkrdForOrder,
  getSkrd,
  getSkrdByOrder,
  verifySkrdByToken,
  listSkrds,
  cancelSkrd,
  previewNextNumber,
} from "./skrd.service.js";
import { accessibleOrganizationIds } from "../availability/availability.service.js";
import type {
  SkrdSettingParams,
  SkrdParams,
  SkrdTokenParams,
  UpsertSkrdSettingBody,
  IssueSkrdBody,
  ListSkrdQuery,
} from "./skrd.schema.js";

async function scopeOf(request: FastifyRequest): Promise<string[] | null> {
  if (request.user.isSuperAdmin) return null;
  return accessibleOrganizationIds(request.user.sub, false);
}

// ─── Pengaturan ───────────────────────────────────────────────────────────────
export async function handleListSettings(
  _request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const data = await listSkrdSettings();
  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK, code: "SUCCESS",
    message: "Daftar pengaturan SKRD berhasil diambil", data,
  });
}

export async function handleUpsertSetting(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const body = request.body as UpsertSkrdSettingBody;
  const data = await upsertSkrdSetting(body);
  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK, code: "SUCCESS",
    message: "Pengaturan SKRD disimpan", data,
  });
}

export async function handleDeleteSetting(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as SkrdSettingParams;
  const data = await deleteSkrdSetting(id);
  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK, code: "SUCCESS",
    message: "Pengaturan SKRD dihapus", data,
  });
}

export async function handlePreviewNumber(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { organizationCode } = request.params as { organizationCode: string };
  const data = await previewNextNumber(organizationCode);
  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK, code: "SUCCESS",
    message: "Pratinjau nomor SKRD berikutnya", data,
  });
}

// ─── Penerbitan & pembacaan ───────────────────────────────────────────────────
export async function handleIssueSkrd(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { orderId } = request.params as { orderId: string };
  const body = request.body as IssueSkrdBody;
  const data = await issueSkrdForOrder(orderId, body);
  return reply.status(HttpStatus.CREATED).send({
    statusCode: HttpStatus.CREATED, code: "SUCCESS",
    message: "SKRD berhasil diterbitkan", data,
  });
}

export async function handleGetSkrd(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as SkrdParams;
  const data = await getSkrd(id);
  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK, code: "SUCCESS",
    message: "Detail SKRD berhasil diambil", data,
  });
}

export async function handleGetSkrdByOrder(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { orderId } = request.params as { orderId: string };
  const data = await getSkrdByOrder(orderId);
  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK, code: "SUCCESS",
    message: "SKRD pesanan berhasil diambil", data,
  });
}

/** Verifikasi publik lewat token QR — tanpa login, tanpa PII. */
export async function handleVerifySkrd(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { token } = request.params as SkrdTokenParams;
  const data = await verifySkrdByToken(token);
  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK, code: "SUCCESS",
    message: "Dokumen terverifikasi", data,
  });
}

export async function handleListSkrds(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = request.query as ListSkrdQuery;
  const result = await listSkrds(await scopeOf(request), query);
  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK, code: "SUCCESS",
    message: "Daftar SKRD berhasil diambil", data: result.data, meta: result.meta,
  });
}

export async function handleCancelSkrd(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as SkrdParams;
  const data = await cancelSkrd(id);
  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK, code: "SUCCESS",
    message: "SKRD dibatalkan (nomor tidak dipakai ulang)", data,
  });
}
