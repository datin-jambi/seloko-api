import type { FastifyReply, FastifyRequest } from "fastify";
import { HttpStatus } from "~/common/errors/index.js";
import {
  listProducts,
  getProductById,
  createProduct,
  updateProduct,
  patchProductStatus,
  deleteProduct,
  getPublicProducts,
  getPublicProductBySlug,
  accessibleOrganizationIds,
} from "./products.service.js";
import type {
  ListProductsQuery,
  PublicListProductsQuery,
  ProductParams,
  ProductActionParams,
  CreateProductBody,
  UpdateProductBody,
} from "./products.schema.js";
import { resolveUserPermissions } from "~/common/guards/permission.guard.js";
import { APP_CODES } from "~/common/constants/index.js";

/** Ambil lingkup OPD dari user terautentikasi (null = semua OPD/Bapenda). */
async function scopeOf(request: FastifyRequest): Promise<string[] | null> {
  return accessibleOrganizationIds(request.user.sub, request.user.isSuperAdmin);
}

/** Izin produk user pada aplikasi Lapak — dipakai mesin transisi status. */
async function productPermissions(request: FastifyRequest): Promise<string[]> {
  return resolveUserPermissions(request.user.sub, APP_CODES.LAPAK_JAMBI_WEB);
}

// ─── Publik ───────────────────────────────────────────────────────────────────
export async function handleGetPublicProducts(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = request.query as PublicListProductsQuery;
  const result = await getPublicProducts(query);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Daftar produk berhasil diambil",
    data: result.data,
    meta: result.meta,
  });
}

export async function handleGetPublicProductBySlug(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { slug } = request.params as { slug: string };
  const data = await getPublicProductBySlug(slug);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Detail produk berhasil diambil",
    data,
  });
}

// ─── CMS ──────────────────────────────────────────────────────────────────────
export async function handleListProducts(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = request.query as ListProductsQuery;
  const scope = await scopeOf(request);
  const result = await listProducts(query, scope);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Daftar produk berhasil diambil",
    data: result.data,
    meta: result.meta,
  });
}

export async function handleGetProductById(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as ProductParams;
  const scope = await scopeOf(request);
  const data = await getProductById(id, scope);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Detail produk berhasil diambil",
    data,
  });
}

export async function handleCreateProduct(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const body = request.body as CreateProductBody;
  const scope = await scopeOf(request);
  const data = await createProduct(body, scope);

  return reply.status(HttpStatus.CREATED).send({
    statusCode: HttpStatus.CREATED,
    code: "SUCCESS",
    message: "Produk berhasil dibuat",
    data,
  });
}

export async function handleUpdateProduct(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as ProductParams;
  const body = request.body as UpdateProductBody;
  const scope = await scopeOf(request);
  const data = await updateProduct(id, body, scope);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Produk berhasil diperbarui",
    data,
  });
}

export async function handlePatchProductStatus(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const params = request.params as ProductActionParams;
  const scope = await scopeOf(request);
  const permissions = await productPermissions(request);
  const data = await patchProductStatus(params, scope, permissions);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: `Status produk diubah menjadi ${data.status}`,
    data,
  });
}

export async function handleDeleteProduct(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as ProductParams;
  const scope = await scopeOf(request);
  const result = await deleteProduct(id, scope);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Produk berhasil dihapus",
    data: result,
  });
}
