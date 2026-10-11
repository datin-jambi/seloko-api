import type { FastifyReply, FastifyRequest } from "fastify";
import { HttpStatus } from "~/common/errors/index.js";
import {
  listPublicBanners,
  listBanners,
  getBannerById,
  createBanner,
  updateBanner,
  setBannerActive,
  reorderBanners,
  deleteBanner,
} from "./banners.service.js";
import type {
  ListBannersQuery,
  PublicListBannersQuery,
  BannerParams,
  CreateBannerBody,
  UpdateBannerBody,
  SetBannerActiveBody,
  ReorderBannersBody,
} from "./banners.schema.js";

/** Endpoint Publik: Mengambil daftar banner aktif untuk portal */
export async function handleGetPublicBanners(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = request.query as PublicListBannersQuery;
  const data = await listPublicBanners(query.limit);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Daftar banner publik berhasil diambil",
    data,
  });
}

/** Endpoint CMS: Mengambil daftar seluruh banner dengan paginasi & filter */
export async function handleListBanners(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = request.query as ListBannersQuery;
  const result = await listBanners(query);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Daftar banner berhasil diambil",
    data: result.data,
    meta: result.meta,
  });
}

/** Endpoint CMS: Mengambil detail satu data banner berdasarkan ID */
export async function handleGetBannerById(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as BannerParams;
  const data = await getBannerById(id);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Detail banner berhasil diambil",
    data,
  });
}

/** Endpoint CMS: Menambahkan banner baru */
export async function handleCreateBanner(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const body = request.body as CreateBannerBody;
  const data = await createBanner(body);

  return reply.status(HttpStatus.CREATED).send({
    statusCode: HttpStatus.CREATED,
    code: "SUCCESS",
    message: "Banner baru berhasil dibuat",
    data,
  });
}

/** Endpoint CMS: Memperbarui data banner */
export async function handleUpdateBanner(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as BannerParams;
  const body = request.body as UpdateBannerBody;
  const data = await updateBanner(id, body);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Data banner berhasil diperbarui",
    data,
  });
}

/** Endpoint CMS: Toggle status aktif banner */
export async function handleSetBannerActive(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as BannerParams;
  const { isActive } = request.body as SetBannerActiveBody;
  const data = await setBannerActive(id, isActive);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: `Status banner berhasil diubah menjadi ${isActive ? "aktif" : "nonaktif"}`,
    data,
  });
}

/** Endpoint CMS: Mengatur urutan sortOrder banner secara massal */
export async function handleReorderBanners(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { items } = request.body as ReorderBannersBody;
  await reorderBanners(items);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Urutan banner berhasil diperbarui",
    data: items,
  });
}

/** Endpoint CMS: Menghapus banner (soft-delete) */
export async function handleDeleteBanner(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as BannerParams;
  const data = await deleteBanner(id);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Banner berhasil dihapus",
    data,
  });
}
