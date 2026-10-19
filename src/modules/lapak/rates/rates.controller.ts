import type { FastifyReply, FastifyRequest } from "fastify";
import { HttpStatus } from "~/common/errors/index.js";
import {
  listRates,
  getRateById,
  createRate,
  updateRate,
  reviseRate,
  patchRateStatus,
  deactivateRate,
  deleteRate,
} from "./rates.service.js";
import { resolveUserPermissions } from "~/common/guards/permission.guard.js";
import { APP_CODES } from "~/common/constants/index.js";
import type {
  ListRatesQuery,
  RateParams,
  RateActionParams,
  CreateRateBody,
  UpdateRateBody,
} from "./rates.schema.js";

async function scopeOf(request: FastifyRequest): Promise<string[] | null> {
  if (request.user.isSuperAdmin) return null;
  // Lingkup dihitung di service; controller hanya meneruskan identitas.
  const { accessibleOrganizationIds } = await import("./rates.service.js");
  return accessibleOrganizationIds(request.user.sub, request.user.isSuperAdmin);
}

async function productPermissions(request: FastifyRequest): Promise<string[]> {
  return resolveUserPermissions(request.user.sub, APP_CODES.LAPAK_JAMBI_WEB);
}

// ─── CMS ──────────────────────────────────────────────────────────────────────
export async function handleListRates(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = request.query as ListRatesQuery;
  const scope = await scopeOf(request);
  const result = await listRates(query, scope);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Daftar tarif berhasil diambil",
    data: result.data,
    meta: result.meta,
  });
}

export async function handleGetRateById(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as RateParams;
  const scope = await scopeOf(request);
  const data = await getRateById(id, scope);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Detail tarif berhasil diambil",
    data,
  });
}

export async function handleCreateRate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { productId } = request.params as { productId: string };
  const body = request.body as CreateRateBody;
  const scope = await scopeOf(request);
  const data = await createRate(productId, body, scope);

  return reply.status(HttpStatus.CREATED).send({
    statusCode: HttpStatus.CREATED,
    code: "SUCCESS",
    message: "Tarif berhasil ditambahkan",
    data,
  });
}

export async function handleUpdateRate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as RateParams;
  const body = request.body as UpdateRateBody;
  const scope = await scopeOf(request);
  const data = await updateRate(id, body, scope);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Tarif berhasil diperbarui",
    data,
  });
}

export async function handleReviseRate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as RateParams;
  const body = request.body as UpdateRateBody;
  const scope = await scopeOf(request);
  const data = await reviseRate(id, body, scope);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Tarif revisi dibuat — menunggu persetujuan",
    data,
  });
}

export async function handlePatchRateStatus(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const params = request.params as RateActionParams;
  const body = (request.body ?? {}) as { note?: string };
  const scope = await scopeOf(request);
  const permissions = await productPermissions(request);
  const data = await patchRateStatus(params, scope, permissions, body.note);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: `Status tarif diubah menjadi ${data.status}`,
    data,
  });
}

export async function handleDeactivateRate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as RateParams;
  const scope = await scopeOf(request);
  const data = await deactivateRate(id, scope);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Tarif dinonaktifkan",
    data,
  });
}

export async function handleDeleteRate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as RateParams;
  const scope = await scopeOf(request);
  const result = await deleteRate(id, scope);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Tarif berhasil dihapus",
    data: result,
  });
}
