import type { FastifyReply, FastifyRequest } from "fastify";
import { HttpStatus } from "~/common/errors/index.js";
import {
  getOrderTickets,
  getTicket,
  verifyTicket,
  useTicket,
  listTickets,
} from "./tickets.service.js";
import { accessibleOrganizationIds } from "../availability/availability.service.js";
import type {
  TicketParams,
  TicketOrderParams,
  TicketTokenParams,
  UseTicketBody,
  ListTicketsQuery,
} from "./tickets.schema.js";

async function scopeOf(request: FastifyRequest): Promise<string[] | null> {
  if (request.user.isSuperAdmin) return null;
  return accessibleOrganizationIds(request.user.sub, false);
}

export async function handleGetOrderTickets(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { orderId } = request.params as TicketOrderParams;
  const data = await getOrderTickets(orderId, request.user.sub);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK, code: "SUCCESS",
    message: "Tiket pesanan berhasil diambil", data,
  });
}

export async function handleGetTicket(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as TicketParams;
  const data = await getTicket(id, request.user.sub);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK, code: "SUCCESS",
    message: "Detail tiket berhasil diambil", data,
  });
}

/** Publik: petugas lokasi memeriksa tiket tanpa login. */
export async function handleVerifyTicket(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { token } = request.params as TicketTokenParams;
  const data = await verifyTicket(token);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK, code: "SUCCESS",
    message: "Tiket ditemukan", data,
  });
}

/** Petugas lokasi menandai tiket terpakai (sekali pakai). */
export async function handleUseTicket(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as TicketParams;
  const body = request.body as UseTicketBody;
  const data = await useTicket(id, request.user.sub, await scopeOf(request), body);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK, code: "SUCCESS",
    message: "Tiket ditandai terpakai", data,
  });
}

export async function handleListTickets(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = request.query as ListTicketsQuery;
  const result = await listTickets(await scopeOf(request), query);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK, code: "SUCCESS",
    message: "Daftar tiket berhasil diambil", data: result.data, meta: result.meta,
  });
}
