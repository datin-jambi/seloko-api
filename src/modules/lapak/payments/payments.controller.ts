import type { FastifyReply, FastifyRequest } from "fastify";
import { HttpStatus } from "~/common/errors/index.js";
import {
  getOrderPayments,
  getPayment,
  submitProof,
  verifyPayment,
  rejectPayment,
  listPayments,
} from "./payments.service.js";
import { accessibleOrganizationIds } from "../availability/availability.service.js";
import type {
  PaymentParams,
  PaymentOrderParams,
  SubmitProofBody,
  VerifyPaymentBody,
  RejectPaymentBody,
  ListPaymentsQuery,
} from "./payments.schema.js";

async function scopeOf(request: FastifyRequest): Promise<string[] | null> {
  if (request.user.isSuperAdmin) return null;
  return accessibleOrganizationIds(request.user.sub, false);
}

/** Warga: pembayaran milik pesanannya sendiri. */
export async function handleGetOrderPayments(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { orderId } = request.params as PaymentOrderParams;
  const data = await getOrderPayments(orderId, request.user.sub);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK, code: "SUCCESS",
    message: "Pembayaran pesanan berhasil diambil", data,
  });
}

export async function handleGetPayment(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as PaymentParams;
  const data = await getPayment(id, request.user.sub);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK, code: "SUCCESS",
    message: "Detail pembayaran berhasil diambil", data,
  });
}

/** Warga mengunggah bukti transfer (URL + fileId dari ImageKit). */
export async function handleSubmitProof(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as PaymentParams;
  const body = request.body as SubmitProofBody;
  const data = await submitProof(id, request.user.sub, body);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK, code: "SUCCESS",
    message: "Bukti transfer diterima, menunggu konfirmasi OPD", data,
  });
}

// ─── CMS ──────────────────────────────────────────────────────────────────────
export async function handleListPayments(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = request.query as ListPaymentsQuery;
  const result = await listPayments(await scopeOf(request), query);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK, code: "SUCCESS",
    message: "Daftar pembayaran berhasil diambil", data: result.data, meta: result.meta,
  });
}

export async function handleVerifyPayment(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as PaymentParams;
  const body = request.body as VerifyPaymentBody;
  const data = await verifyPayment(id, request.user.sub, await scopeOf(request), body);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK, code: "SUCCESS",
    message: "Pembayaran dikonfirmasi lunas", data,
  });
}

export async function handleRejectPayment(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as PaymentParams;
  const body = request.body as RejectPaymentBody;
  const data = await rejectPayment(id, request.user.sub, await scopeOf(request), body);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK, code: "SUCCESS",
    message: "Bukti pembayaran ditolak", data,
  });
}
