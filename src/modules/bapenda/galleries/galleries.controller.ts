import type { FastifyReply, FastifyRequest } from "fastify";
import { HttpStatus } from "~/common/errors/index.js";
import type { Actor } from "~/modules/shared/article/article.service.js";
import * as gallery from "./galleries.service.js";
import type {
  AddGalleryItemsBody,
  CreateGalleryBody,
  GalleryIdParams,
  GalleryItemParams,
  GallerySlugParams,
  GalleryStatusBody,
  ListGalleriesQuery,
  PublicListGalleriesQuery,
  ReorderGalleryItemsBody,
  UpdateGalleryBody,
} from "./galleries.schema.js";

const STATUS_MESSAGES: Record<GalleryStatusBody["action"], string> = {
  submit: "diajukan untuk review",
  approve: "disetujui",
  reject: "ditolak",
  publish: "diterbitkan",
  unpublish: "ditarik dari publikasi",
};

function actorOf(request: FastifyRequest): Actor {
  return {
    userId: request.user.sub,
    isSuperAdmin: request.user.isSuperAdmin,
    ipAddress: request.ip,
    userAgent: request.headers["user-agent"],
  };
}

function send(reply: FastifyReply, statusCode: number, message: string, data: unknown, meta?: unknown) {
  return reply.status(statusCode).send({
    statusCode,
    code: "SUCCESS",
    message,
    data,
    ...(meta !== undefined && { meta }),
  });
}

// ─── Publik ───────────────────────────────────────────────────────────────────
export async function handleListPublicGalleries(request: FastifyRequest, reply: FastifyReply) {
  const result = await gallery.listPublicGalleries(request.query as PublicListGalleriesQuery);
  return send(reply, HttpStatus.OK, "Daftar galeri berhasil diambil", result.data, result.meta);
}

export async function handleGetPublicGalleryBySlug(request: FastifyRequest, reply: FastifyReply) {
  const { slug } = request.params as GallerySlugParams;
  return send(reply, HttpStatus.OK, "Detail galeri berhasil diambil", await gallery.getPublicGalleryBySlug(slug));
}

// ─── CMS: Galeri ──────────────────────────────────────────────────────────────
export async function handleListGalleries(request: FastifyRequest, reply: FastifyReply) {
  const result = await gallery.listGalleries(actorOf(request), request.query as ListGalleriesQuery);
  return send(reply, HttpStatus.OK, "Daftar galeri berhasil diambil", result.data, result.meta);
}

export async function handleGetGalleryById(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as GalleryIdParams;
  return send(reply, HttpStatus.OK, "Detail galeri berhasil diambil", await gallery.getGalleryById(actorOf(request), id));
}

export async function handleCreateGallery(request: FastifyRequest, reply: FastifyReply) {
  const data = await gallery.createGallery(actorOf(request), request.body as CreateGalleryBody);
  return send(reply, HttpStatus.CREATED, "Galeri berhasil dibuat sebagai draft", data);
}

export async function handleUpdateGallery(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as GalleryIdParams;
  const data = await gallery.updateGallery(actorOf(request), id, request.body as UpdateGalleryBody);
  return send(reply, HttpStatus.OK, "Galeri berhasil diperbarui", data);
}

export async function handleChangeGalleryStatus(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as GalleryIdParams;
  const { action, note } = request.body as GalleryStatusBody;
  const data = await gallery.changeGalleryStatus(actorOf(request), id, action, note);
  return send(reply, HttpStatus.OK, `Galeri berhasil ${STATUS_MESSAGES[action]}`, data);
}

export async function handleDeleteGallery(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as GalleryIdParams;
  return send(reply, HttpStatus.OK, "Galeri berhasil dihapus", await gallery.deleteGallery(actorOf(request), id));
}

// ─── CMS: Item ────────────────────────────────────────────────────────────────
export async function handleAddGalleryItems(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as GalleryIdParams;
  const data = await gallery.addGalleryItems(actorOf(request), id, request.body as AddGalleryItemsBody);
  return send(reply, HttpStatus.CREATED, "Item galeri berhasil ditambahkan", data);
}

export async function handleDeleteGalleryItem(request: FastifyRequest, reply: FastifyReply) {
  const { id, itemId } = request.params as GalleryItemParams;
  return send(reply, HttpStatus.OK, "Item galeri berhasil dihapus", await gallery.deleteGalleryItem(actorOf(request), id, itemId));
}

export async function handleReorderGalleryItems(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as GalleryIdParams;
  const { itemIds } = request.body as ReorderGalleryItemsBody;
  return send(reply, HttpStatus.OK, "Urutan item galeri berhasil diperbarui", await gallery.reorderGalleryItems(actorOf(request), id, itemIds));
}
