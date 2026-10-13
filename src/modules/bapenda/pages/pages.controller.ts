import type { FastifyReply, FastifyRequest } from "fastify";
import { HttpStatus } from "~/common/errors/index.js";
import {
  listPublicPages,
  getPublicPageBySlug,
  listPages,
  getPageById,
  createPage,
  updatePage,
  setPagePublished,
  deletePage,
} from "./pages.service.js";
import type {
  ListPagesQuery,
  PageParams,
  PageSlugParams,
  CreatePageBody,
  UpdatePageBody,
  SetPagePublishedBody,
} from "./pages.schema.js";

function send(reply: FastifyReply, statusCode: number, message: string, data: unknown, meta?: unknown) {
  return reply.status(statusCode).send({
    statusCode,
    code: "SUCCESS",
    message,
    data,
    ...(meta !== undefined && { meta }),
  });
}

/** Endpoint Publik: Daftar halaman terbit (navigasi menu profil) */
export async function handleListPublicPages(_request: FastifyRequest, reply: FastifyReply) {
  const data = await listPublicPages();
  return send(reply, HttpStatus.OK, "Daftar halaman berhasil diambil", data);
}

/** Endpoint Publik: Detail halaman terbit berdasarkan slug */
export async function handleGetPublicPage(request: FastifyRequest, reply: FastifyReply) {
  const { slug } = request.params as PageSlugParams;
  const data = await getPublicPageBySlug(slug);
  return send(reply, HttpStatus.OK, "Detail halaman berhasil diambil", data);
}

/** Endpoint CMS: Daftar halaman dengan paginasi & filter */
export async function handleListPages(request: FastifyRequest, reply: FastifyReply) {
  const result = await listPages(request.query as ListPagesQuery);
  return send(reply, HttpStatus.OK, "Daftar halaman berhasil diambil", result.data, result.meta);
}

/** Endpoint CMS: Detail halaman */
export async function handleGetPageById(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as PageParams;
  const data = await getPageById(id);
  return send(reply, HttpStatus.OK, "Detail halaman berhasil diambil", data);
}

/** Endpoint CMS: Tambah halaman (draft) */
export async function handleCreatePage(request: FastifyRequest, reply: FastifyReply) {
  const data = await createPage(request.body as CreatePageBody);
  return send(reply, HttpStatus.CREATED, "Halaman berhasil dibuat sebagai draft", data);
}

/** Endpoint CMS: Ubah halaman */
export async function handleUpdatePage(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as PageParams;
  const data = await updatePage(id, request.body as UpdatePageBody);
  return send(reply, HttpStatus.OK, "Halaman berhasil diperbarui", data);
}

/** Endpoint CMS: Terbit / tarik halaman */
export async function handleSetPagePublished(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as PageParams;
  const { isPublished } = request.body as SetPagePublishedBody;
  const data = await setPagePublished(id, isPublished);
  return send(reply, HttpStatus.OK, `Halaman berhasil ${isPublished ? "diterbitkan" : "ditarik ke draft"}`, data);
}

/** Endpoint CMS: Hapus (soft-delete) halaman */
export async function handleDeletePage(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as PageParams;
  const data = await deletePage(id);
  return send(reply, HttpStatus.OK, "Halaman berhasil dihapus", data);
}
