import type { FastifyReply, FastifyRequest } from "fastify";
import { HttpStatus } from "~/common/errors/index.js";
import { runExpiry, getExpiryStatus, listRuns, getRun, purgeOldRuns } from "./expiry.service.js";
import type { RunExpiryBody, ListRunsQuery } from "./expiry.schema.js";

export async function handleRunExpiry(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const body = request.body as RunExpiryBody;
  const data = await runExpiry(request.user.sub, body.force);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK, code: "SUCCESS",
    message: "Worker kedaluwarsa selesai dijalankan", data,
  });
}

export async function handleStatus(
  _request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const data = await getExpiryStatus();

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK, code: "SUCCESS",
    message: "Status kedaluwarsa", data,
  });
}

export async function handleListRuns(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = request.query as ListRunsQuery;
  const result = await listRuns(query);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK, code: "SUCCESS",
    message: "Riwayat run worker", data: result.data, meta: result.meta,
  });
}

export async function handleGetRun(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const data = await getRun(id);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK, code: "SUCCESS",
    message: "Detail run worker", data,
  });
}

export async function handlePurgeRuns(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = request.query as { olderThanDays?: number };
  const data = await purgeOldRuns(query.olderThanDays ?? 30);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK, code: "SUCCESS",
    message: "Riwayat run lama dibersihkan", data,
  });
}
