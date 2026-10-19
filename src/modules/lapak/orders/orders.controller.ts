import type { FastifyReply, FastifyRequest } from "fastify";
import { HttpStatus } from "~/common/errors/index.js";
import {
  quoteCart,
  checkoutCart,
  getOrder,
  listMyOrders,
  listOrdersForCms,
} from "./orders.service.js";
import { accessibleOrganizationIds } from "../availability/availability.service.js";
import type {
  CartIdParams,
  OrderParams,
  CheckoutBody,
  ListOrdersQuery,
} from "./orders.schema.js";

function currentUserId(request: FastifyRequest): string {
  return request.user.sub;
}

/** Quote — hitung harga tanpa menyimpan apa pun. */
export async function handleQuote(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { cartId } = request.params as CartIdParams;
  const data = await quoteCart(cartId, currentUserId(request));

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Rincian harga berhasil dihitung",
    data,
  });
}

/** Checkout — buat pesanan, bekukan harga, konfirmasi reservasi. */
export async function handleCheckout(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { cartId } = request.params as CartIdParams;
  const body = request.body as CheckoutBody;
  const data = await checkoutCart(cartId, currentUserId(request), body);

  return reply.status(HttpStatus.CREATED).send({
    statusCode: HttpStatus.CREATED,
    code: "SUCCESS",
    message: "Pesanan berhasil dibuat",
    data,
  });
}

export async function handleGetOrder(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as OrderParams;
  const data = await getOrder(id, currentUserId(request));

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Detail pesanan berhasil diambil",
    data,
  });
}

export async function handleListMyOrders(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = request.query as ListOrdersQuery;
  const result = await listMyOrders(currentUserId(request), query);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Daftar pesanan berhasil diambil",
    data: result.data,
    meta: result.meta,
  });
}

export async function handleListOrdersCms(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = request.query as ListOrdersQuery;
  const scope = request.user.isSuperAdmin
    ? null
    : await accessibleOrganizationIds(request.user.sub, request.user.isSuperAdmin);
  const result = await listOrdersForCms(scope, query);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Daftar pesanan berhasil diambil",
    data: result.data,
    meta: result.meta,
  });
}
