/**
 * article.service.ts — Logika konten bersama (tabel articles) untuk semua
 * jenis ArticleType (NEWS, ARTICLE, …). Tidak tahu domain mana pun: domain
 * memanggilnya dengan ArticleScope miliknya, mis. bapenda/news.
 */
import sanitizeHtml from "sanitize-html";
import type { ArticleType, ContentStatus, Prisma } from "@prisma/client";
import { prisma } from "~/config/database.js";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "~/common/errors/index.js";
import { slugify } from "~/common/utils/index.js";
import { ImageKitService } from "~/common/services/storage/imagekit.service.js";
import { resolveUserPermissions } from "~/common/guards/permission.guard.js";
import { publishAuditEvent } from "~/workers/producers/audit.producer.js";
import { ROUTING_KEYS } from "~/workers/queue-names/index.js";
import type {
  ArticleAction,
  CreateArticleBody,
  CreateCategoryBody,
  ListArticlesQuery,
  ListCategoriesQuery,
  PublicListArticlesQuery,
  UpdateArticleBody,
  UpdateCategoryBody,
} from "./article.schema.js";

// ─── Konteks ──────────────────────────────────────────────────────────────────
/** Jenis konten yang dilayani satu pemasangan route. */
export interface ArticleScope {
  /** Aplikasi pemilik konten, mis. "bapenda-profile". */
  appCode: string;
  type: ArticleType;
  /** Entity permission, mis. "news" → news:approve. */
  entity: string;
  /** Label manusia untuk pesan, mis. "Berita". */
  label: string;
}

/** Pelaku request CMS. */
export interface Actor {
  userId: string;
  isSuperAdmin: boolean;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}

// ─── Alur Status (murni, diuji di article.check.ts) ───────────────────────────
interface TransitionRule {
  from: ContentStatus[];
  to: ContentStatus;
  /** Aksi permission yang dibutuhkan; null = cukup pemilik atau pemegang update. */
  permission: "approve" | "reject" | "publish" | null;
}

export const TRANSITIONS: Record<ArticleAction, TransitionRule> = {
  submit: { from: ["DRAFT", "REJECTED"], to: "PENDING_REVIEW", permission: null },
  approve: { from: ["PENDING_REVIEW"], to: "APPROVED", permission: "approve" },
  reject: { from: ["PENDING_REVIEW"], to: "REJECTED", permission: "reject" },
  publish: { from: ["DRAFT", "APPROVED"], to: "PUBLISHED", permission: "publish" },
  unpublish: { from: ["PUBLISHED"], to: "DRAFT", permission: "publish" },
};

/** Status tujuan, atau null bila aksi tidak sah dari status sekarang. */
export function nextStatus(current: ContentStatus, action: ArticleAction): ContentStatus | null {
  const rule = TRANSITIONS[action];
  return rule.from.includes(current) ? rule.to : null;
}

/** Status yang masih boleh diubah isinya oleh penulis tanpa hak review. */
export const AUTHOR_EDITABLE: readonly ContentStatus[] = ["DRAFT", "REJECTED"];

// ─── Sanitasi HTML ────────────────────────────────────────────────────────────
// Konten dirender apa adanya di portal publik — tanpa ini editor (atau token
// curian) bisa menyisipkan <script>/onerror yang jalan di browser warga.
const HTML_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [...sanitizeHtml.defaults.allowedTags, "img"],
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    img: ["src", "alt", "title", "width", "height"],
    "*": ["class"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
};

export function sanitizeContent(html: string): string {
  return sanitizeHtml(html, HTML_OPTIONS);
}

// ─── Media ────────────────────────────────────────────────────────────────────
export const THUMBNAIL_RULES = { maxSizeBytes: 3 * 1024 * 1024, minWidth: 600 } as const;

/** Validasi berkas thumbnail di ImageKit — hanya dipanggil saat konten tayang. */
async function validateThumbnail(fileId: string | null | undefined): Promise<void> {
  if (!fileId?.trim()) return;

  const file = await ImageKitService.getFileDetails(fileId);
  if (!file) {
    throw new BadRequestError(`Berkas thumbnail (ID: '${fileId}') tidak ditemukan di ImageKit`);
  }
  if (file.size > THUMBNAIL_RULES.maxSizeBytes) {
    throw new BadRequestError(
      `Ukuran thumbnail terlalu besar (${(file.size / 1024 / 1024).toFixed(2)} MB). Maksimal 3 MB.`,
    );
  }
  if (file.width !== undefined && file.height !== undefined) {
    if (file.width < file.height) {
      throw new BadRequestError(
        `Thumbnail harus landscape (lebar >= tinggi). Terdeteksi ${file.width}x${file.height} px.`,
      );
    }
    if (file.width < THUMBNAIL_RULES.minWidth) {
      throw new BadRequestError(
        `Lebar thumbnail terlalu kecil (${file.width} px). Minimal ${THUMBNAIL_RULES.minWidth} px.`,
      );
    }
  }
}

function cleanupFile(fileId: string | null | undefined): void {
  if (!fileId) return;
  ImageKitService.deleteFile(fileId).catch((err) => {
    console.error(`[ArticleService] Gagal menghapus file lama ImageKit (${fileId}):`, err);
  });
}

// ─── Helper ───────────────────────────────────────────────────────────────────
async function getAppId(appCode: string): Promise<string> {
  const app = await prisma.application.findUniqueOrThrow({
    where: { code: appCode },
    select: { id: true },
  });
  return app.id;
}

function paginate(page: number, limit: number, totalItems: number) {
  const totalPages = Math.ceil(totalItems / limit) || 1;
  return {
    page,
    limit,
    totalItems,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

/** Field relasi aman untuk respons — penulis hanya id + nama (tanpa PII). */
const ARTICLE_INCLUDE = {
  category: { select: { id: true, name: true, slug: true } },
  author: { select: { id: true, fullName: true } },
} satisfies Prisma.ArticleInclude;

/** Daftar publik tidak membawa isi penuh — cukup untuk kartu berita. */
const PUBLIC_LIST_SELECT = {
  id: true,
  title: true,
  slug: true,
  excerpt: true,
  thumbnailUrl: true,
  status: true,
  publishedAt: true,
  viewCount: true,
  createdAt: true,
  updatedAt: true,
  ...ARTICLE_INCLUDE,
} satisfies Prisma.ArticleSelect;

interface ActorAccess {
  can: (action: string) => boolean;
  /** Tanpa hak approve, pengguna hanya melihat & mengubah konten miliknya. */
  ownOnly: boolean;
}

async function resolveAccess(scope: ArticleScope, actor: Actor): Promise<ActorAccess> {
  if (actor.isSuperAdmin) return { can: () => true, ownOnly: false };
  const perms = new Set(await resolveUserPermissions(actor.userId, scope.appCode));
  const can = (action: string) => perms.has(`${scope.entity}:${action}`);
  return { can, ownOnly: !can("approve") };
}

/** Slug unik per (aplikasi, jenis). Unique index ikut menghitung baris terhapus. */
async function resolveArticleSlug(
  applicationId: string,
  type: ArticleType,
  title: string,
  requested: string | undefined,
  excludeId?: string,
): Promise<string> {
  const base = slugify(requested || title);
  if (!base) throw new BadRequestError("Slug tidak dapat dibentuk dari judul");

  const taken = async (slug: string) =>
    (await prisma.article.count({
      where: { applicationId, type, slug, ...(excludeId && { NOT: { id: excludeId } }) },
    })) > 0;

  if (!(await taken(base))) return base;
  // Slug yang diketik sendiri harus persis — jangan diam-diam diubah.
  if (requested) throw new ConflictError(`Slug "${base}" sudah digunakan`);

  for (let i = 2; i < 100; i++) {
    const candidate = `${base}-${i}`;
    if (!(await taken(candidate))) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

async function assertCategory(applicationId: string, type: ArticleType, categoryId: string) {
  const category = await prisma.articleCategory.findFirst({
    where: { id: categoryId, applicationId, type, deletedAt: null },
    select: { id: true },
  });
  if (!category) throw new BadRequestError("Kategori tidak ditemukan untuk jenis konten ini");
}

// ─── Publik ───────────────────────────────────────────────────────────────────
export async function listPublicArticles(scope: ArticleScope, query: PublicListArticlesQuery) {
  const applicationId = await getAppId(scope.appCode);
  const { page, limit, search, category } = query;

  const where: Prisma.ArticleWhereInput = {
    applicationId,
    type: scope.type,
    status: "PUBLISHED",
    deletedAt: null,
    category: { isActive: true, deletedAt: null, ...(category && { slug: category }) },
    ...(search && {
      OR: [
        { title: { contains: search, mode: "insensitive" } },
        { excerpt: { contains: search, mode: "insensitive" } },
      ],
    }),
  };

  const [totalItems, data] = await Promise.all([
    prisma.article.count({ where }),
    prisma.article.findMany({
      where,
      select: PUBLIC_LIST_SELECT,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  return { data, meta: paginate(page, limit, totalItems) };
}

/** Detail publik + hitung pembaca. */
export async function getPublicArticleBySlug(scope: ArticleScope, slug: string) {
  const applicationId = await getAppId(scope.appCode);
  const found = await prisma.article.findFirst({
    where: { applicationId, type: scope.type, slug, status: "PUBLISHED", deletedAt: null },
    select: { id: true },
  });
  if (!found) throw new NotFoundError(scope.label);

  return prisma.article.update({
    where: { id: found.id },
    data: { viewCount: { increment: 1 } },
    include: ARTICLE_INCLUDE,
  });
}

export async function listPublicCategories(scope: ArticleScope) {
  const applicationId = await getAppId(scope.appCode);
  return prisma.articleCategory.findMany({
    where: { applicationId, type: scope.type, isActive: true, deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

// ─── CMS: Artikel ─────────────────────────────────────────────────────────────
export async function listArticles(scope: ArticleScope, actor: Actor, query: ListArticlesQuery) {
  const applicationId = await getAppId(scope.appCode);
  const access = await resolveAccess(scope, actor);
  const { page, limit, search, status, categoryId, sortBy, sortOrder } = query;

  const where: Prisma.ArticleWhereInput = {
    applicationId,
    type: scope.type,
    deletedAt: null,
    ...(access.ownOnly && { authorId: actor.userId }),
    ...(status && { status }),
    ...(categoryId && { categoryId }),
    ...(search && {
      OR: [
        { title: { contains: search, mode: "insensitive" } },
        { excerpt: { contains: search, mode: "insensitive" } },
      ],
    }),
  };

  const [totalItems, data] = await Promise.all([
    prisma.article.count({ where }),
    prisma.article.findMany({
      where,
      select: PUBLIC_LIST_SELECT,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
    }),
  ]);

  return { data, meta: paginate(page, limit, totalItems) };
}

/** Ambil konten milik scope; NotFound juga untuk konten orang lain bila ownOnly. */
async function findOwnedArticle(scope: ArticleScope, actor: Actor, id: string) {
  const applicationId = await getAppId(scope.appCode);
  const access = await resolveAccess(scope, actor);
  const article = await prisma.article.findFirst({
    where: {
      id,
      applicationId,
      type: scope.type,
      deletedAt: null,
      ...(access.ownOnly && { authorId: actor.userId }),
    },
    include: ARTICLE_INCLUDE,
  });
  if (!article) throw new NotFoundError(scope.label);
  return { article, access, applicationId };
}

export async function getArticleById(scope: ArticleScope, actor: Actor, id: string) {
  return (await findOwnedArticle(scope, actor, id)).article;
}

export async function createArticle(scope: ArticleScope, actor: Actor, body: CreateArticleBody) {
  const applicationId = await getAppId(scope.appCode);
  await assertCategory(applicationId, scope.type, body.categoryId);
  const slug = await resolveArticleSlug(applicationId, scope.type, body.title, body.slug);

  return prisma.article.create({
    data: {
      applicationId,
      type: scope.type,
      categoryId: body.categoryId,
      authorId: actor.userId,
      title: body.title,
      slug,
      excerpt: body.excerpt ?? null,
      content: sanitizeContent(body.content),
      thumbnailUrl: body.thumbnailUrl ?? null,
      thumbnailFileId: body.thumbnailFileId ?? null,
      seoTitle: body.seoTitle ?? null,
      seoDescription: body.seoDescription ?? null,
      status: "DRAFT",
    },
    include: ARTICLE_INCLUDE,
  });
}

export async function updateArticle(
  scope: ArticleScope,
  actor: Actor,
  id: string,
  body: UpdateArticleBody,
) {
  const { article, access, applicationId } = await findOwnedArticle(scope, actor, id);

  // Konten yang sudah masuk review/terbit tidak boleh diubah diam-diam oleh
  // penulis — perubahan itu akan tayang tanpa diperiksa ulang.
  if (access.ownOnly && !AUTHOR_EDITABLE.includes(article.status)) {
    throw new ForbiddenError(
      `${scope.label} berstatus ${article.status} tidak dapat diubah. Hanya DRAFT atau REJECTED.`,
    );
  }

  if (body.categoryId !== undefined) await assertCategory(applicationId, scope.type, body.categoryId);

  const newFileId = body.thumbnailFileId !== undefined ? body.thumbnailFileId : article.thumbnailFileId;
  if (article.status === "PUBLISHED" && body.thumbnailFileId !== undefined) {
    await validateThumbnail(newFileId);
  }

  const data: Prisma.ArticleUncheckedUpdateInput = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.slug !== undefined) {
    data.slug = await resolveArticleSlug(applicationId, scope.type, body.title ?? article.title, body.slug, id);
  }
  if (body.categoryId !== undefined) data.categoryId = body.categoryId;
  if (body.excerpt !== undefined) data.excerpt = body.excerpt ?? null;
  if (body.content !== undefined) data.content = sanitizeContent(body.content);
  if (body.thumbnailUrl !== undefined) data.thumbnailUrl = body.thumbnailUrl ?? null;
  if (body.thumbnailFileId !== undefined) data.thumbnailFileId = body.thumbnailFileId ?? null;
  if (body.seoTitle !== undefined) data.seoTitle = body.seoTitle ?? null;
  if (body.seoDescription !== undefined) data.seoDescription = body.seoDescription ?? null;

  const updated = await prisma.article.update({ where: { id }, data, include: ARTICLE_INCLUDE });

  // Hapus file lama SETELAH DB tersimpan — bila update gagal, file tetap ada.
  if (article.thumbnailFileId && article.thumbnailFileId !== newFileId) {
    cleanupFile(article.thumbnailFileId);
  }
  return updated;
}

export async function changeArticleStatus(
  scope: ArticleScope,
  actor: Actor,
  id: string,
  action: ArticleAction,
  note?: string,
) {
  const { article, access } = await findOwnedArticle(scope, actor, id);
  const rule = TRANSITIONS[action];

  if (rule.permission ? !access.can(rule.permission) : !(access.can("update") || access.can("approve"))) {
    throw new ForbiddenError(`Tidak memiliki izin "${scope.entity}:${rule.permission ?? "update"}"`);
  }

  const to = nextStatus(article.status, action);
  if (!to) {
    throw new BadRequestError(
      `Aksi "${action}" tidak dapat dilakukan pada ${scope.label} berstatus ${article.status}`,
    );
  }

  if (to === "PUBLISHED") await validateThumbnail(article.thumbnailFileId);

  const updated = await prisma.article.update({
    where: { id },
    data: {
      status: to,
      // publish → isi tanggal terbit; unpublish → kosongkan. Lainnya biarkan.
      ...(to === "PUBLISHED" && { publishedAt: new Date() }),
      ...(action === "unpublish" && { publishedAt: null }),
    },
    include: ARTICLE_INCLUDE,
  });

  void publishAuditEvent(ROUTING_KEYS.AUDIT_CONTENT_STATUS, {
    action: `${scope.entity}.${action}`,
    appCode: scope.appCode,
    userId: actor.userId,
    entityType: scope.entity,
    entityId: id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { from: article.status, to, ...(note && { note }) },
  });

  return updated;
}

export async function deleteArticle(scope: ArticleScope, actor: Actor, id: string) {
  const { article } = await findOwnedArticle(scope, actor, id);
  await prisma.article.update({ where: { id }, data: { deletedAt: new Date() } });
  // ponytail: file thumbnail dibiarkan saat soft-delete agar restore tetap utuh;
  // bersihkan lewat job purge bila nanti ada hard-delete.
  return { id: article.id, deleted: true };
}

// ─── CMS: Kategori ────────────────────────────────────────────────────────────
export async function listCategories(scope: ArticleScope, query: ListCategoriesQuery) {
  const applicationId = await getAppId(scope.appCode);
  return prisma.articleCategory.findMany({
    where: {
      applicationId,
      type: scope.type,
      deletedAt: null,
      ...(query.isActive !== undefined && { isActive: query.isActive }),
      ...(query.search && { name: { contains: query.search, mode: "insensitive" } }),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

async function findCategory(scope: ArticleScope, id: string) {
  const applicationId = await getAppId(scope.appCode);
  const category = await prisma.articleCategory.findFirst({
    where: { id, applicationId, type: scope.type, deletedAt: null },
  });
  if (!category) throw new NotFoundError(`Kategori ${scope.label}`);
  return { category, applicationId };
}

async function resolveCategorySlug(
  applicationId: string,
  type: ArticleType,
  name: string,
  requested: string | undefined,
  excludeId?: string,
): Promise<string> {
  const slug = slugify(requested || name);
  if (!slug) throw new BadRequestError("Slug kategori tidak dapat dibentuk dari nama");
  const exists = await prisma.articleCategory.count({
    where: { applicationId, type, slug, ...(excludeId && { NOT: { id: excludeId } }) },
  });
  if (exists) throw new ConflictError(`Slug kategori "${slug}" sudah digunakan`);
  return slug;
}

export async function createCategory(scope: ArticleScope, body: CreateCategoryBody) {
  const applicationId = await getAppId(scope.appCode);
  const slug = await resolveCategorySlug(applicationId, scope.type, body.name, body.slug);
  return prisma.articleCategory.create({
    data: {
      applicationId,
      type: scope.type,
      name: body.name,
      slug,
      description: body.description ?? null,
      sortOrder: body.sortOrder,
      isActive: body.isActive,
    },
  });
}

export async function updateCategory(scope: ArticleScope, id: string, body: UpdateCategoryBody) {
  const { category, applicationId } = await findCategory(scope, id);
  const data: Prisma.ArticleCategoryUpdateInput = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.slug !== undefined) {
    data.slug = await resolveCategorySlug(applicationId, scope.type, body.name ?? category.name, body.slug, id);
  }
  if (body.description !== undefined) data.description = body.description ?? null;
  if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;
  if (body.isActive !== undefined) data.isActive = body.isActive;
  return prisma.articleCategory.update({ where: { id }, data });
}

export async function setCategoryActive(scope: ArticleScope, id: string, isActive: boolean) {
  await findCategory(scope, id);
  return prisma.articleCategory.update({ where: { id }, data: { isActive } });
}

export async function deleteCategory(scope: ArticleScope, id: string) {
  const { category } = await findCategory(scope, id);
  const used = await prisma.article.count({ where: { categoryId: id, deletedAt: null } });
  if (used > 0) {
    throw new ConflictError(
      `Kategori masih dipakai ${used} ${scope.label.toLowerCase()}. Pindahkan dulu sebelum menghapus.`,
    );
  }
  await prisma.articleCategory.update({ where: { id }, data: { deletedAt: new Date() } });
  return { id: category.id, deleted: true };
}
