import type { FastifyReply, FastifyRequest } from "fastify";
import { HttpStatus } from "~/common/errors/index.js";
import { getPublicStats } from "./public-stats.service.js";
import type { PublicStatsQuery } from "./public-stats.schema.js";

/** Statistik publik — tanpa login, tanpa PII, hanya agregat. */
export async function handlePublicStats(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = request.query as PublicStatsQuery;
  const data = await getPublicStats(query.year);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK, code: "SUCCESS",
    message: "Ringkasan penerimaan publik", data,
  });
}
