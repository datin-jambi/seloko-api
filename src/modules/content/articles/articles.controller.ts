import type { FastifyReply, FastifyRequest } from "fastify";
import { HttpStatus } from "~/common/errors/index.js";
import * as service from "./articles.service.js";
import type { Actor, ContentScope } from "./articles.service.js";
import type {
  ChangeStatusBody,
  CreateArticleBody,
  CreateCategoryBody,
  IdParams,
  ListArticlesQuery,
  ListCategoriesQuery,
  PublicListArticlesQuery,
  SetActiveBody,
  SlugParams,
  UpdateArticleBody,
  UpdateCategoryBody,
} from "./articles.schema.js";

const STATUS_MESSAGES: Record<ChangeStatusBody["action"], string> = {
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

/**
 * Handler terikat satu ContentScope. Dibuat per pemasangan route sehingga
 * berita dan artikel memakai kode yang sama dengan jenis & permission berbeda.
 */
export function createArticleHandlers(scope: ContentScope) {
  const label = scope.label;

  return {
    // ── Publik ────────────────────────────────────────────────────────────
    async listPublic(request: FastifyRequest, reply: FastifyReply) {
      const result = await service.listPublicArticles(scope, request.query as PublicListArticlesQuery);
      return send(reply, HttpStatus.OK, `Daftar ${label.toLowerCase()} berhasil diambil`, result.data, result.meta);
    },

    async getPublicBySlug(request: FastifyRequest, reply: FastifyReply) {
      const { slug } = request.params as SlugParams;
      const data = await service.getPublicArticleBySlug(scope, slug);
      return send(reply, HttpStatus.OK, `Detail ${label.toLowerCase()} berhasil diambil`, data);
    },

    async listPublicCategories(_request: FastifyRequest, reply: FastifyReply) {
      const data = await service.listPublicCategories(scope);
      return send(reply, HttpStatus.OK, `Daftar kategori ${label.toLowerCase()} berhasil diambil`, data);
    },

    // ── CMS: Konten ───────────────────────────────────────────────────────
    async list(request: FastifyRequest, reply: FastifyReply) {
      const result = await service.listArticles(scope, actorOf(request), request.query as ListArticlesQuery);
      return send(reply, HttpStatus.OK, `Daftar ${label.toLowerCase()} berhasil diambil`, result.data, result.meta);
    },

    async getById(request: FastifyRequest, reply: FastifyReply) {
      const { id } = request.params as IdParams;
      const data = await service.getArticleById(scope, actorOf(request), id);
      return send(reply, HttpStatus.OK, `Detail ${label.toLowerCase()} berhasil diambil`, data);
    },

    async create(request: FastifyRequest, reply: FastifyReply) {
      const data = await service.createArticle(scope, actorOf(request), request.body as CreateArticleBody);
      return send(reply, HttpStatus.CREATED, `${label} berhasil dibuat sebagai draft`, data);
    },

    async update(request: FastifyRequest, reply: FastifyReply) {
      const { id } = request.params as IdParams;
      const data = await service.updateArticle(scope, actorOf(request), id, request.body as UpdateArticleBody);
      return send(reply, HttpStatus.OK, `${label} berhasil diperbarui`, data);
    },

    async changeStatus(request: FastifyRequest, reply: FastifyReply) {
      const { id } = request.params as IdParams;
      const { action, note } = request.body as ChangeStatusBody;
      const data = await service.changeArticleStatus(scope, actorOf(request), id, action, note);
      return send(reply, HttpStatus.OK, `${label} berhasil ${STATUS_MESSAGES[action]}`, data);
    },

    async remove(request: FastifyRequest, reply: FastifyReply) {
      const { id } = request.params as IdParams;
      const data = await service.deleteArticle(scope, actorOf(request), id);
      return send(reply, HttpStatus.OK, `${label} berhasil dihapus`, data);
    },

    // ── CMS: Kategori ─────────────────────────────────────────────────────
    async listCategories(request: FastifyRequest, reply: FastifyReply) {
      const data = await service.listCategories(scope, request.query as ListCategoriesQuery);
      return send(reply, HttpStatus.OK, `Daftar kategori ${label.toLowerCase()} berhasil diambil`, data);
    },

    async createCategory(request: FastifyRequest, reply: FastifyReply) {
      const data = await service.createCategory(scope, request.body as CreateCategoryBody);
      return send(reply, HttpStatus.CREATED, `Kategori ${label.toLowerCase()} berhasil dibuat`, data);
    },

    async updateCategory(request: FastifyRequest, reply: FastifyReply) {
      const { id } = request.params as IdParams;
      const data = await service.updateCategory(scope, id, request.body as UpdateCategoryBody);
      return send(reply, HttpStatus.OK, `Kategori ${label.toLowerCase()} berhasil diperbarui`, data);
    },

    async setCategoryActive(request: FastifyRequest, reply: FastifyReply) {
      const { id } = request.params as IdParams;
      const { isActive } = request.body as SetActiveBody;
      const data = await service.setCategoryActive(scope, id, isActive);
      return send(reply, HttpStatus.OK, `Kategori ${isActive ? "diaktifkan" : "dinonaktifkan"}`, data);
    },

    async removeCategory(request: FastifyRequest, reply: FastifyReply) {
      const { id } = request.params as IdParams;
      const data = await service.deleteCategory(scope, id);
      return send(reply, HttpStatus.OK, `Kategori ${label.toLowerCase()} berhasil dihapus`, data);
    },
  };
}
