import type { FastifyReply, FastifyRequest } from "fastify";
import { HttpStatus } from "~/common/errors/index.js";
import {
  createReservation,
  releaseReservation,
  listReservations,
  getSlotAvailability,
} from "./reservations.service.js";
import type {
  ReservationProductParams,
  ReservationParams,
  CreateReservationBody,
  ListReservationsQuery,
  SlotAvailabilityQuery,
} from "./reservations.schema.js";

export async function handleCreateReservation(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { productId } = request.params as ReservationProductParams;
  const body = request.body as CreateReservationBody;
  const data = await createReservation(productId, body);

  return reply.status(HttpStatus.CREATED).send({
    statusCode: HttpStatus.CREATED,
    code: "SUCCESS",
    message: "Slot berhasil dipegang sementara (HOLD)",
    data,
  });
}

export async function handleReleaseReservation(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as ReservationParams;
  const data = await releaseReservation(id);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Reservasi dilepas",
    data,
  });
}

export async function handleListReservations(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { productId } = request.params as ReservationProductParams;
  const query = request.query as ListReservationsQuery;
  const result = await listReservations(productId, query);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Daftar reservasi berhasil diambil",
    data: result.data,
    meta: result.meta,
  });
}

export async function handleGetSlotAvailability(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { productId } = request.params as ReservationProductParams;
  const { from, to } = request.query as SlotAvailabilityQuery;
  const data = await getSlotAvailability(productId, from, to);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Ketersediaan slot berhasil diambil",
    data,
  });
}
