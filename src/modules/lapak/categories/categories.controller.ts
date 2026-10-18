import type { FastifyReply, FastifyRequest } from "fastify";
import { HttpStatus } from "~/common/errors/index.js";
import {
  listCategories,
  getPublicCategories,
  getCategoryById,
  getPublicCategoryBySlug,
  createCategory,
  updateCategory,
  setCategoryActive,
  reorderCategories,
  deleteCategory,
} from "./categories.service.js";
import type {
  ListCategoriesQuery,
  PublicListCategoriesQuery,
  CategoryParams,
  CreateCategoryBody,
  UpdateCategoryBody,
  SetCategoryActiveBody,
  ReorderCategoriesBody,
} from "./categories.schema.js";

// Handler bertipe request polos lalu di-cast — pola yang sama dengan modul
// UPTD/Banner: generic Fastify + ZodTypeProvider menuntut RouteGeneric penuh,
// dan cast eksplisit lebih ringkas daripada menduplikasi tipe route di sini.

// ─── Publik ───────────────────────────────────────────────────────────────────
export async function handleGetPublicCategories(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = request.query as PublicListCategoriesQuery;
  const data = await getPublicCategories(query);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Daftar kategori berhasil diambil",
    data,
  });
}

export async function handleGetPublicCategoryBySlug(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { slug } = request.params as { slug: string };
  const data = await getPublicCategoryBySlug(slug);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Detail kategori berhasil diambil",
    data,
  });
}

// ─── CMS ──────────────────────────────────────────────────────────────────────
export async function handleListCategories(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = request.query as ListCategoriesQuery;
  const result = await listCategories(query);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Daftar kategori berhasil diambil",
    data: result.data,
    meta: result.meta,
  });
}

export async function handleGetCategoryById(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as CategoryParams;
  const data = await getCategoryById(id);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Detail kategori berhasil diambil",
    data,
  });
}

export async function handleCreateCategory(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const body = request.body as CreateCategoryBody;
  const data = await createCategory(body);

  return reply.status(HttpStatus.CREATED).send({
    statusCode: HttpStatus.CREATED,
    code: "SUCCESS",
    message: "Kategori berhasil dibuat",
    data,
  });
}

export async function handleUpdateCategory(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as CategoryParams;
  const body = request.body as UpdateCategoryBody;
  const data = await updateCategory(id, body);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Kategori berhasil diperbarui",
    data,
  });
}

export async function handleSetCategoryActive(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as CategoryParams;
  const body = request.body as SetCategoryActiveBody;
  const data = await setCategoryActive(id, body.isActive);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: body.isActive ? "Kategori diaktifkan" : "Kategori dinonaktifkan",
    data,
  });
}

export async function handleReorderCategories(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const body = request.body as ReorderCategoriesBody;
  const result = await reorderCategories(body.items);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Urutan kategori diperbarui",
    data: result,
  });
}

export async function handleDeleteCategory(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as CategoryParams;
  const result = await deleteCategory(id);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Kategori berhasil dihapus",
    data: result,
  });
}
