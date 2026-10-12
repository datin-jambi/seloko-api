import type { FastifyReply, FastifyRequest } from "fastify";
import { APP_CODES } from "~/common/constants/index.js";
import { HttpStatus } from "~/common/errors/index.js";
import * as article from "~/modules/shared/article/article.service.js";
import type { Actor, ArticleScope } from "~/modules/shared/article/article.service.js";
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
} from "~/modules/shared/article/article.schema.js";

/** Berita Bapenda = konten bersama jenis NEWS milik bapenda-profile. */
const NEWS: ArticleScope = {
  appCode: APP_CODES.BAPENDA_PROFILE,
  type: "NEWS",
  entity: "news",
  label: "Berita",
};

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

// ─── Publik ───────────────────────────────────────────────────────────────────
export async function handleListPublicNews(request: FastifyRequest, reply: FastifyReply) {
  const result = await article.listPublicArticles(NEWS, request.query as PublicListArticlesQuery);
  return send(reply, HttpStatus.OK, "Daftar berita berhasil diambil", result.data, result.meta);
}

export async function handleGetPublicNewsBySlug(request: FastifyRequest, reply: FastifyReply) {
  const { slug } = request.params as SlugParams;
  const data = await article.getPublicArticleBySlug(NEWS, slug);
  return send(reply, HttpStatus.OK, "Detail berita berhasil diambil", data);
}

export async function handleListPublicNewsCategories(_request: FastifyRequest, reply: FastifyReply) {
  const data = await article.listPublicCategories(NEWS);
  return send(reply, HttpStatus.OK, "Daftar kategori berita berhasil diambil", data);
}

// ─── CMS: Berita ──────────────────────────────────────────────────────────────
export async function handleListNews(request: FastifyRequest, reply: FastifyReply) {
  const result = await article.listArticles(NEWS, actorOf(request), request.query as ListArticlesQuery);
  return send(reply, HttpStatus.OK, "Daftar berita berhasil diambil", result.data, result.meta);
}

export async function handleGetNewsById(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as IdParams;
  const data = await article.getArticleById(NEWS, actorOf(request), id);
  return send(reply, HttpStatus.OK, "Detail berita berhasil diambil", data);
}

export async function handleCreateNews(request: FastifyRequest, reply: FastifyReply) {
  const data = await article.createArticle(NEWS, actorOf(request), request.body as CreateArticleBody);
  return send(reply, HttpStatus.CREATED, "Berita berhasil dibuat sebagai draft", data);
}

export async function handleUpdateNews(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as IdParams;
  const data = await article.updateArticle(NEWS, actorOf(request), id, request.body as UpdateArticleBody);
  return send(reply, HttpStatus.OK, "Berita berhasil diperbarui", data);
}

export async function handleChangeNewsStatus(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as IdParams;
  const { action, note } = request.body as ChangeStatusBody;
  const data = await article.changeArticleStatus(NEWS, actorOf(request), id, action, note);
  return send(reply, HttpStatus.OK, `Berita berhasil ${STATUS_MESSAGES[action]}`, data);
}

export async function handleDeleteNews(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as IdParams;
  const data = await article.deleteArticle(NEWS, actorOf(request), id);
  return send(reply, HttpStatus.OK, "Berita berhasil dihapus", data);
}

// ─── CMS: Kategori Berita ─────────────────────────────────────────────────────
export async function handleListNewsCategories(request: FastifyRequest, reply: FastifyReply) {
  const data = await article.listCategories(NEWS, request.query as ListCategoriesQuery);
  return send(reply, HttpStatus.OK, "Daftar kategori berita berhasil diambil", data);
}

export async function handleCreateNewsCategory(request: FastifyRequest, reply: FastifyReply) {
  const data = await article.createCategory(NEWS, request.body as CreateCategoryBody);
  return send(reply, HttpStatus.CREATED, "Kategori berita berhasil dibuat", data);
}

export async function handleUpdateNewsCategory(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as IdParams;
  const data = await article.updateCategory(NEWS, id, request.body as UpdateCategoryBody);
  return send(reply, HttpStatus.OK, "Kategori berita berhasil diperbarui", data);
}

export async function handleSetNewsCategoryActive(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as IdParams;
  const { isActive } = request.body as SetActiveBody;
  const data = await article.setCategoryActive(NEWS, id, isActive);
  return send(reply, HttpStatus.OK, `Kategori ${isActive ? "diaktifkan" : "dinonaktifkan"}`, data);
}

export async function handleDeleteNewsCategory(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as IdParams;
  const data = await article.deleteCategory(NEWS, id);
  return send(reply, HttpStatus.OK, "Kategori berita berhasil dihapus", data);
}
