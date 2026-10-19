import type { FastifyReply, FastifyRequest } from "fastify";
import { HttpStatus } from "~/common/errors/index.js";
import { getDashboard, listTargets, upsertTarget, deleteTarget } from "./dashboard.service.js";
import { accessibleOrganizationIds } from "../availability/availability.service.js";
import type { DashboardQuery, TargetQuery, TargetUpsertBody, TargetParams } from "./dashboard.schema.js";

async function scopeOf(request: FastifyRequest): Promise<string[] | null> {
  if (request.user.isSuperAdmin) return null;
  return accessibleOrganizationIds(request.user.sub, request.user.isSuperAdmin);
}

export async function handleDashboard(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = request.query as DashboardQuery;
  const data = await getDashboard(await scopeOf(request), query);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK, code: "SUCCESS",
    message: "Ringkasan penerimaan berhasil diambil", data,
  });
}

export async function handleListTargets(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = request.query as TargetQuery;
  const data = await listTargets(query.year);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK, code: "SUCCESS",
    message: "Daftar target berhasil diambil", data,
  });
}

export async function handleUpsertTarget(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const body = request.body as TargetUpsertBody;
  const data = await upsertTarget(body);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK, code: "SUCCESS",
    message: "Target penerimaan disimpan", data,
  });
}

export async function handleDeleteTarget(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as TargetParams;
  const data = await deleteTarget(id);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK, code: "SUCCESS",
    message: "Target penerimaan dihapus", data,
  });
}
