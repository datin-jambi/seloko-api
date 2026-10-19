import type { FastifyReply, FastifyRequest } from "fastify";
import { HttpStatus } from "~/common/errors/index.js";
import {
  listCarts,
  getCart,
  getOrCreateCart,
  addItem,
  updateItem,
  removeItem,
  clearCart,
  deleteCart,
} from "./carts.service.js";
import type { CartParams, CartItemParams, AddCartItemBody, UpdateCartItemBody } from "./carts.schema.js";

/**
 * Keranjang selalu milik user yang login — tidak ada endpoint yang menerima
 * `userId` dari klien. Ini mencegah warga mengakses keranjang orang lain
 * dengan menebak ID.
 */
function currentUserId(request: FastifyRequest): string {
  return request.user.sub;
}

export async function handleListCarts(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const data = await listCarts(currentUserId(request));

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Daftar keranjang berhasil diambil",
    data,
  });
}

export async function handleGetCart(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as CartParams;
  const data = await getCart(id, currentUserId(request));

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Keranjang berhasil diambil",
    data,
  });
}

export async function handleGetOrCreateCart(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { code } = request.params as { code: string };
  const data = await getOrCreateCart(currentUserId(request), code);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Keranjang OPD siap",
    data,
  });
}

export async function handleAddItem(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as CartParams;
  const body = request.body as AddCartItemBody;
  const data = await addItem(id, currentUserId(request), body);

  return reply.status(HttpStatus.CREATED).send({
    statusCode: HttpStatus.CREATED,
    code: "SUCCESS",
    message: "Produk ditambahkan ke keranjang",
    data,
  });
}

export async function handleUpdateItem(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id, itemId } = request.params as CartParams & CartItemParams;
  const body = request.body as UpdateCartItemBody;
  const data = await updateItem(id, currentUserId(request), itemId, body);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Item keranjang diperbarui",
    data,
  });
}

export async function handleRemoveItem(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id, itemId } = request.params as CartParams & CartItemParams;
  const data = await removeItem(id, currentUserId(request), itemId);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Item dihapus dari keranjang",
    data,
  });
}

export async function handleClearCart(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as CartParams;
  const data = await clearCart(id, currentUserId(request));

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Keranjang dikosongkan",
    data,
  });
}

export async function handleDeleteCart(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as CartParams;
  const data = await deleteCart(id, currentUserId(request));

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Keranjang dihapus",
    data,
  });
}
