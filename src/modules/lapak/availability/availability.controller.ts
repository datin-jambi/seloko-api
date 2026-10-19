import type { FastifyReply, FastifyRequest } from "fastify";
import { HttpStatus } from "~/common/errors/index.js";
import {
  accessibleOrganizationIds,
  listOperatingHours,
  replaceOperatingHours,
  listBlackoutDates,
  createBlackoutDate,
  deleteBlackoutDate,
  getAvailability,
} from "./availability.service.js";
import type {
  AvailabilityProductParams,
  BlackoutParams,
  ReplaceOperatingHoursBody,
  CreateBlackoutBody,
  CheckAvailabilityQuery,
} from "./availability.schema.js";

async function scopeOf(request: FastifyRequest): Promise<string[] | null> {
  if (request.user.isSuperAdmin) return null;
  return accessibleOrganizationIds(request.user.sub, false);
}

// ─── CMS: jam operasional ─────────────────────────────────────────────────────
export async function handleGetOperatingHours(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { productId } = request.params as AvailabilityProductParams;
  const data = await listOperatingHours(productId, await scopeOf(request));

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Jam operasional berhasil diambil",
    data,
  });
}

export async function handleReplaceOperatingHours(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { productId } = request.params as AvailabilityProductParams;
  const { hours } = request.body as ReplaceOperatingHoursBody;
  const data = await replaceOperatingHours(productId, hours, await scopeOf(request));

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Jam operasional berhasil disimpan",
    data,
  });
}

// ─── CMS: tanggal tutup ───────────────────────────────────────────────────────
export async function handleListBlackoutDates(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { productId } = request.params as AvailabilityProductParams;
  const data = await listBlackoutDates(productId, await scopeOf(request));

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Tanggal tutup berhasil diambil",
    data,
  });
}

export async function handleCreateBlackoutDate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { productId } = request.params as AvailabilityProductParams;
  const body = request.body as CreateBlackoutBody;
  const data = await createBlackoutDate(productId, body, await scopeOf(request));

  return reply.status(HttpStatus.CREATED).send({
    statusCode: HttpStatus.CREATED,
    code: "SUCCESS",
    message: "Tanggal tutup berhasil ditambahkan",
    data,
  });
}

export async function handleDeleteBlackoutDate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { productId, id } = request.params as BlackoutParams;
  const data = await deleteBlackoutDate(productId, id, await scopeOf(request));

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Tanggal tutup berhasil dihapus",
    data,
  });
}

// ─── Publik: cek ketersediaan ─────────────────────────────────────────────────
export async function handleCheckAvailability(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { productId } = request.params as AvailabilityProductParams;
  const { from, to } = request.query as CheckAvailabilityQuery;
  const data = await getAvailability(productId, from, to);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Ketersediaan produk berhasil diambil",
    data,
  });
}
