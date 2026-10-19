import type { FastifyReply, FastifyRequest } from "fastify";
import { HttpStatus } from "~/common/errors/index.js";
import * as regulation from "./regulations.service.js";
import type {
  CreateRegulationBody,
  ListRegulationsQuery,
  PublicListRegulationsQuery,
  RegulationIdParams,
  RegulationSlugParams,
  RegulationStatusBody,
  UpdateRegulationBody,
} from "./regulations.schema.js";

function send(reply: FastifyReply, statusCode: number, message: string, data: unknown, meta?: unknown) {
  return reply.status(statusCode).send({
    statusCode, code: "SUCCESS", message, data,
    ...(meta !== undefined && { meta }),
  });
}

// ─── Publik ───────────────────────────────────────────────────────────────────
export async function handleListPublicRegulations(request: FastifyRequest, reply: FastifyReply) {
  const result = await regulation.listPublicRegulations(request.query as PublicListRegulationsQuery);
  return send(reply, HttpStatus.OK, "Daftar regulasi berhasil diambil", result.data, result.meta);
}

export async function handleGetPublicRegulationBySlug(request: FastifyRequest, reply: FastifyReply) {
  const { slug } = request.params as RegulationSlugParams;
  return send(reply, HttpStatus.OK, "Detail regulasi berhasil diambil", await regulation.getPublicRegulationBySlug(slug));
}

// ─── CMS ──────────────────────────────────────────────────────────────────────
export async function handleListRegulations(request: FastifyRequest, reply: FastifyReply) {
  const result = await regulation.listRegulations(request.query as ListRegulationsQuery);
  return send(reply, HttpStatus.OK, "Daftar regulasi berhasil diambil", result.data, result.meta);
}

export async function handleGetRegulationById(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as RegulationIdParams;
  return send(reply, HttpStatus.OK, "Detail regulasi berhasil diambil", await regulation.getRegulationById(id));
}

export async function handleCreateRegulation(request: FastifyRequest, reply: FastifyReply) {
  const data = await regulation.createRegulation(request.body as CreateRegulationBody);
  return send(reply, HttpStatus.CREATED, "Regulasi berhasil dibuat sebagai draft", data);
}

export async function handleUpdateRegulation(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as RegulationIdParams;
  const data = await regulation.updateRegulation(id, request.body as UpdateRegulationBody);
  return send(reply, HttpStatus.OK, "Regulasi berhasil diperbarui", data);
}

export async function handleSetRegulationStatus(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as RegulationIdParams;
  const { status } = request.body as RegulationStatusBody;
  const data = await regulation.setRegulationStatus(id, status);
  return send(reply, HttpStatus.OK, status === "PUBLISHED" ? "Regulasi berhasil diterbitkan" : "Regulasi ditarik ke draft", data);
}

export async function handleDeleteRegulation(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as RegulationIdParams;
  return send(reply, HttpStatus.OK, "Regulasi berhasil dihapus", await regulation.deleteRegulation(id));
}
