import type { FastifyReply, FastifyRequest } from "fastify";
import { HttpStatus, NotFoundError, BadRequestError } from "~/common/errors/index.js";
import { prisma } from "~/config/database.js";
import * as article from "~/modules/shared/article/article.service.js";
import type { Actor } from "~/modules/shared/article/article.service.js";
import type {
  ChangeStatusBody,
  CreateArticleBody,
  IdParams,
  ListArticlesQuery,
  PublicListArticlesQuery,
  SlugParams,
  UpdateArticleBody,
} from "~/modules/shared/article/article.schema.js";
import { accessibleOrganizationIds } from "../availability/availability.service.js";
import { NEWS_SCOPE, scopedTo, assertSameOrg } from "./news.scope.js";

/**
 * Berita OPD (LJ-4.1, PRD 04 §G).
 *
 * Memakai `shared/article` yang sama dengan Bapenda; yang berbeda hanya scope
 * (aplikasi Lapak + `organizationId`). Tidak ada duplikasi logika alur status,
 * slug, sanitasi HTML, atau penghapusan media.
 *
 * LINGKUP OPD SELALU DARI PENUGASAN USER, bukan dari parameter request.
 */

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
 * Tentukan OPD aktif untuk request CMS.
 *
 * `organization` (kode OPD) hanya boleh dipakai Bapenda/superadmin. Admin OPD
 * selalu memakai OPD-nya sendiri — kalau tidak, ia bisa menyunting berita OPD lain
 * hanya dengan mengubah parameter.
 */
async function resolveOrganization(request: FastifyRequest): Promise<string> {
  const query = request.query as { organization?: string };
  const scope = await accessibleOrganizationIds(
    request.user.sub,
    request.user.isSuperAdmin,
  );
  if (query.organization) {
    const org = await prisma.organization.findFirst({
      where: { code: query.organization, deletedAt: null },
      select: { id: true },
    });
    if (!org) throw new NotFoundError("Organisasi", query.organization);
    // Admin OPD tidak boleh memilih OPD lain.
    if (scope !== null && !scope.includes(org.id)) {
      throw new NotFoundError("Organisasi", query.organization);
    }
    return org.id;
  }

  if (scope === null) {
    // Bapenda tanpa parameter: pakai OPD pertama yang ada agar endpoint tetap
    // berfungsi; CMS Bapenda sebaiknya selalu mengirim `organization`.
    const first = await prisma.organization.findFirst({
      where: { deletedAt: null },
      select: { id: true },
      orderBy: { code: "asc" },
    });
    if (!first) throw new BadRequestError("Belum ada OPD terdaftar");
    return first.id;
  }

  const own = scope[0];
  if (!own) throw new BadRequestError("Akun belum ditugaskan ke OPD mana pun");
  return own;
}

// ─── Publik ───────────────────────────────────────────────────────────────────
/**
 * Daftar berita publik sebuah OPD.
 *
 * `:code` adalah kode OPD di URL agar tautan bisa dibagikan
 * (`/lapak/news/public/BPSDM`). Tidak butuh login.
 */
export async function handleListPublicNews(request: FastifyRequest, reply: FastifyReply) {
  const { code } = request.params as { code: string };
  const org = await prisma.organization.findFirst({
    where: { code, deletedAt: null },
    select: { id: true },
  });
  if (!org) throw new NotFoundError("Organisasi", code);

  const scope = scopedTo(NEWS_SCOPE, org.id);
  const result = await article.listPublicArticles(scope, request.query as PublicListArticlesQuery);
  return send(reply, HttpStatus.OK, "Daftar berita OPD berhasil diambil", result.data, result.meta);
}

export async function handleGetPublicNewsBySlug(request: FastifyRequest, reply: FastifyReply) {
  const { code, slug } = request.params as { code: string; slug: string };
  const org = await prisma.organization.findFirst({
    where: { code, deletedAt: null },
    select: { id: true },
  });
  if (!org) throw new NotFoundError("Organisasi", code);

  const found = await article.getPublicArticleBySlug(scopedTo(NEWS_SCOPE, org.id), slug);
  return send(reply, HttpStatus.OK, "Detail berita OPD berhasil diambil", found);
}

// ─── CMS ──────────────────────────────────────────────────────────────────────
export async function handleListNews(request: FastifyRequest, reply: FastifyReply) {
  const orgId = await resolveOrganization(request);
  const result = await article.listArticles(
    scopedTo(NEWS_SCOPE, orgId),
    actorOf(request),
    request.query as ListArticlesQuery,
  );
  return send(reply, HttpStatus.OK, "Daftar berita berhasil diambil", result.data, result.meta);
}

export async function handleGetNews(request: FastifyRequest, reply: FastifyReply) {
  const orgId = await resolveOrganization(request);
  const { id } = request.params as IdParams;
  const found = await article.getArticleById(scopedTo(NEWS_SCOPE, orgId), actorOf(request), id);
  return send(reply, HttpStatus.OK, "Detail berita berhasil diambil", found);
}

export async function handleCreateNews(request: FastifyRequest, reply: FastifyReply) {
  const orgId = await resolveOrganization(request);
  const created = await article.createArticle(
    scopedTo(NEWS_SCOPE, orgId),
    actorOf(request),
    request.body as CreateArticleBody,
  );
  return send(reply, HttpStatus.CREATED, "Berita berhasil dibuat", created);
}

export async function handleUpdateNews(request: FastifyRequest, reply: FastifyReply) {
  const orgId = await resolveOrganization(request);
  const { id } = request.params as IdParams;
  const updated = await article.updateArticle(
    scopedTo(NEWS_SCOPE, orgId),
    actorOf(request),
    id,
    request.body as UpdateArticleBody,
  );
  return send(reply, HttpStatus.OK, "Berita berhasil diperbarui", updated);
}

export async function handleChangeNewsStatus(request: FastifyRequest, reply: FastifyReply) {
  const orgId = await resolveOrganization(request);
  const { id } = request.params as IdParams;
  const body = request.body as ChangeStatusBody;
  const updated = await article.changeArticleStatus(
    scopedTo(NEWS_SCOPE, orgId),
    actorOf(request),
    id,
    body.action,
    body.note,
  );
  return send(reply, HttpStatus.OK, `Berita ${body.action} berhasil`, updated);
}

export async function handleDeleteNews(request: FastifyRequest, reply: FastifyReply) {
  const orgId = await resolveOrganization(request);
  const { id } = request.params as IdParams;
  const result = await article.deleteArticle(scopedTo(NEWS_SCOPE, orgId), actorOf(request), id);
  return send(reply, HttpStatus.OK, "Berita berhasil dihapus", result);
}

/** Dipakai untuk memastikan helper tersedia bagi modul galeri/banner kelak. */
export { assertSameOrg };
