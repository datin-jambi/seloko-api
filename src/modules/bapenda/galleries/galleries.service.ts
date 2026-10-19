/**
 * galleries.service.ts — Galeri portal Bapenda (PRD 02 §E).
 *
 * Alur status & validasi gambar dipakai ulang dari `shared/article` (TRANSITIONS,
 * nextStatus, validateThumbnail, cleanupFile) — satu sumber aturan untuk berita
 * dan galeri, sesuai PRD 02 §4.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "~/config/database.js";
import { APP_CODES } from "~/common/constants/index.js";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "~/common/errors/index.js";
import { slugify } from "~/common/utils/index.js";
import { resolveUserPermissions } from "~/common/guards/permission.guard.js";
import { publishAuditEvent } from "~/workers/producers/audit.producer.js";
import { ROUTING_KEYS } from "~/workers/queue-names/index.js";
import {
  AUTHOR_EDITABLE,
  TRANSITIONS,
  cleanupFile,
  nextStatus,
  validateThumbnail,
  type Actor,
} from "~/modules/shared/article/article.service.js";
import type { ArticleAction } from "~/modules/shared/article/article.schema.js";
import type {
  AddGalleryItemsBody,
  CreateGalleryBody,
  GalleryItemInput,
  ListGalleriesQuery,
  PublicListGalleriesQuery,
  UpdateGalleryBody,
} from "./galleries.schema.js";

const ENTITY = "gallery";
const LABEL = "Galeri";

// ─── Helper ───────────────────────────────────────────────────────────────────
async function getAppId(): Promise<string> {
  const app = await prisma.application.findUniqueOrThrow({
    where: { code: APP_CODES.BAPENDA_PROFILE },
    select: { id: true },
  });
  return app.id;
}

function paginate(page: number, limit: number, totalItems: number) {
  const totalPages = Math.ceil(totalItems / limit) || 1;
  return { page, limit, totalItems, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 };
}

const ITEMS_INCLUDE = {
  where: { deletedAt: null },
  orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  select: { id: true, mediaType: true, fileUrl: true, fileId: true, title: true, description: true, sortOrder: true, createdAt: true },
} satisfies Prisma.Gallery$itemsArgs;

/** Penulis hanya id + nama — tanpa email/NIP. */
const DETAIL_INCLUDE = {
  author: { select: { id: true, fullName: true } },
  items: ITEMS_INCLUDE,
} satisfies Prisma.GalleryInclude;

const LIST_INCLUDE = {
  author: { select: { id: true, fullName: true } },
  _count: { select: { items: { where: { deletedAt: null } } } },
} satisfies Prisma.GalleryInclude;

type ListRow = Prisma.GalleryGetPayload<{ include: typeof LIST_INCLUDE }>;
const toListItem = ({ _count, ...g }: ListRow) => ({ ...g, itemCount: _count.items });

/** Galeri Bapenda saja — baris milik OPD (Lapak) tidak pernah tersentuh di sini. */
function baseWhere(applicationId: string): Prisma.GalleryWhereInput {
  return { applicationId, organizationId: null, deletedAt: null };
}

interface Access {
  can: (action: string) => boolean;
  ownOnly: boolean;
}

async function resolveAccess(actor: Actor): Promise<Access> {
  if (actor.isSuperAdmin) return { can: () => true, ownOnly: false };
  const perms = new Set(await resolveUserPermissions(actor.userId, APP_CODES.BAPENDA_PROFILE));
  const can = (action: string) => perms.has(`${ENTITY}:${action}`);
  return { can, ownOnly: !can("approve") };
}

/** Slug unik per aplikasi; unique index ikut menghitung baris terhapus. */
async function resolveSlug(applicationId: string, title: string, requested?: string, excludeId?: string) {
  const base = slugify(requested || title);
  if (!base) throw new BadRequestError("Slug tidak dapat dibentuk dari judul");
  const taken = async (slug: string) =>
    (await prisma.gallery.count({
      where: { applicationId, slug, ...(excludeId && { NOT: { id: excludeId } }) },
    })) > 0;

  if (!(await taken(base))) return base;
  if (requested) throw new ConflictError(`Slug "${base}" sudah digunakan`);
  for (let i = 2; i < 100; i++) {
    const candidate = `${base}-${i}`;
    if (!(await taken(candidate))) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

async function findOwned(actor: Actor, id: string) {
  const applicationId = await getAppId();
  const access = await resolveAccess(actor);
  const gallery = await prisma.gallery.findFirst({
    where: { id, ...baseWhere(applicationId), ...(access.ownOnly && { authorId: actor.userId }) },
    include: DETAIL_INCLUDE,
  });
  if (!gallery) throw new NotFoundError(LABEL);
  return { gallery, access, applicationId };
}

/** Galeri yang sedang direview/tayang tidak boleh diubah diam-diam oleh penulis. */
function assertEditable(status: string, access: Access) {
  if (access.ownOnly && !AUTHOR_EDITABLE.includes(status as never)) {
    throw new ForbiddenError(`${LABEL} berstatus ${status} tidak dapat diubah. Hanya DRAFT atau REJECTED.`);
  }
}

const itemData = (item: GalleryItemInput, sortOrder: number) => ({
  mediaType: item.mediaType,
  fileUrl: item.fileUrl,
  fileId: item.fileId ?? null,
  title: item.title ?? null,
  description: item.description ?? null,
  sortOrder,
});

// ─── Publik ───────────────────────────────────────────────────────────────────
export async function listPublicGalleries(query: PublicListGalleriesQuery) {
  const applicationId = await getAppId();
  const { page, limit, search } = query;
  const where: Prisma.GalleryWhereInput = {
    ...baseWhere(applicationId),
    status: "PUBLISHED",
    ...(search && { title: { contains: search, mode: "insensitive" } }),
  };
  const [totalItems, rows] = await Promise.all([
    prisma.gallery.count({ where }),
    prisma.gallery.findMany({
      where,
      include: LIST_INCLUDE,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    }),
  ]);
  return { data: rows.map(toListItem), meta: paginate(page, limit, totalItems) };
}

export async function getPublicGalleryBySlug(slug: string) {
  const applicationId = await getAppId();
  const gallery = await prisma.gallery.findFirst({
    where: { ...baseWhere(applicationId), slug, status: "PUBLISHED" },
    include: DETAIL_INCLUDE,
  });
  if (!gallery) throw new NotFoundError(LABEL);
  return gallery;
}

// ─── CMS: Galeri ──────────────────────────────────────────────────────────────
export async function listGalleries(actor: Actor, query: ListGalleriesQuery) {
  const applicationId = await getAppId();
  const access = await resolveAccess(actor);
  const { page, limit, search, status, sortBy, sortOrder } = query;
  const where: Prisma.GalleryWhereInput = {
    ...baseWhere(applicationId),
    ...(access.ownOnly && { authorId: actor.userId }),
    ...(status && { status }),
    ...(search && { title: { contains: search, mode: "insensitive" } }),
  };
  const [totalItems, rows] = await Promise.all([
    prisma.gallery.count({ where }),
    prisma.gallery.findMany({
      where,
      include: LIST_INCLUDE,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
    }),
  ]);
  return { data: rows.map(toListItem), meta: paginate(page, limit, totalItems) };
}

export async function getGalleryById(actor: Actor, id: string) {
  return (await findOwned(actor, id)).gallery;
}

export async function createGallery(actor: Actor, body: CreateGalleryBody) {
  const applicationId = await getAppId();
  const slug = await resolveSlug(applicationId, body.title, body.slug);
  return prisma.gallery.create({
    data: {
      applicationId,
      authorId: actor.userId,
      title: body.title,
      slug,
      description: body.description ?? null,
      coverImageUrl: body.coverImageUrl ?? null,
      coverImageFileId: body.coverImageFileId ?? null,
      status: "DRAFT",
      ...(body.items?.length && {
        items: { create: body.items.map((item, i) => itemData(item, i)) },
      }),
    },
    include: DETAIL_INCLUDE,
  });
}

export async function updateGallery(actor: Actor, id: string, body: UpdateGalleryBody) {
  const { gallery, access, applicationId } = await findOwned(actor, id);
  assertEditable(gallery.status, access);

  const newCoverId = body.coverImageFileId !== undefined ? body.coverImageFileId : gallery.coverImageFileId;
  if (gallery.status === "PUBLISHED" && body.coverImageFileId !== undefined) {
    await validateThumbnail(newCoverId);
  }

  const data: Prisma.GalleryUncheckedUpdateInput = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.slug !== undefined) data.slug = await resolveSlug(applicationId, body.title ?? gallery.title, body.slug, id);
  if (body.description !== undefined) data.description = body.description ?? null;
  if (body.coverImageUrl !== undefined) data.coverImageUrl = body.coverImageUrl ?? null;
  if (body.coverImageFileId !== undefined) data.coverImageFileId = body.coverImageFileId ?? null;

  const updated = await prisma.gallery.update({ where: { id }, data, include: DETAIL_INCLUDE });
  // Hapus sampul lama SETELAH DB tersimpan — bila update gagal, file tetap ada.
  if (gallery.coverImageFileId && gallery.coverImageFileId !== newCoverId) cleanupFile(gallery.coverImageFileId);
  return updated;
}

export async function changeGalleryStatus(actor: Actor, id: string, action: ArticleAction, note?: string) {
  const { gallery, access } = await findOwned(actor, id);
  const rule = TRANSITIONS[action];

  if (rule.permission ? !access.can(rule.permission) : !(access.can("update") || access.can("approve"))) {
    throw new ForbiddenError(`Tidak memiliki izin "${ENTITY}:${rule.permission ?? "update"}"`);
  }

  const to = nextStatus(gallery.status, action);
  if (!to) throw new BadRequestError(`Aksi "${action}" tidak dapat dilakukan pada ${LABEL} berstatus ${gallery.status}`);

  if (to === "PUBLISHED") {
    // Galeri tanpa foto tidak layak tayang — halaman publiknya akan kosong.
    if (gallery.items.length === 0) throw new BadRequestError(`${LABEL} belum memiliki item; tambahkan minimal satu sebelum terbit`);
    await validateThumbnail(gallery.coverImageFileId);
  }

  const updated = await prisma.gallery.update({
    where: { id },
    data: {
      status: to,
      ...(to === "PUBLISHED" && { publishedAt: new Date() }),
      ...(action === "unpublish" && { publishedAt: null }),
    },
    include: DETAIL_INCLUDE,
  });

  void publishAuditEvent(ROUTING_KEYS.AUDIT_CONTENT_STATUS, {
    action: `${ENTITY}.${action}`,
    appCode: APP_CODES.BAPENDA_PROFILE,
    userId: actor.userId,
    entityType: ENTITY,
    entityId: id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { from: gallery.status, to, ...(note && { note }) },
  });

  return updated;
}

/**
 * Hapus galeri: soft-delete + bersihkan seluruh berkas ImageKit (PRD 02 §E).
 * Berkas dibersihkan SETELAH DB tersimpan dan secara asinkron.
 */
export async function deleteGallery(actor: Actor, id: string) {
  const { gallery } = await findOwned(actor, id);
  const now = new Date();
  await prisma.$transaction([
    prisma.galleryItem.updateMany({ where: { galleryId: id, deletedAt: null }, data: { deletedAt: now } }),
    prisma.gallery.update({ where: { id }, data: { deletedAt: now } }),
  ]);
  cleanupFile(gallery.coverImageFileId);
  for (const item of gallery.items) cleanupFile(item.fileId);
  return { id, deleted: true };
}

// ─── CMS: Item ────────────────────────────────────────────────────────────────
export async function addGalleryItems(actor: Actor, id: string, body: AddGalleryItemsBody) {
  const { gallery, access } = await findOwned(actor, id);
  assertEditable(gallery.status, access);
  const start = gallery.items.reduce((max, i) => Math.max(max, i.sortOrder + 1), 0);
  await prisma.galleryItem.createMany({
    data: body.items.map((item, i) => ({ galleryId: id, ...itemData(item, start + i) })),
  });
  return prisma.galleryItem.findMany({ where: { galleryId: id, ...ITEMS_INCLUDE.where }, orderBy: ITEMS_INCLUDE.orderBy, select: ITEMS_INCLUDE.select });
}

export async function deleteGalleryItem(actor: Actor, id: string, itemId: string) {
  const { gallery, access } = await findOwned(actor, id);
  assertEditable(gallery.status, access);
  const item = gallery.items.find((i) => i.id === itemId);
  if (!item) throw new NotFoundError("Item galeri");
  // Galeri tayang tidak boleh dikosongkan — halaman publiknya akan hampa.
  if (gallery.status === "PUBLISHED" && gallery.items.length === 1) {
    throw new BadRequestError("Item terakhir galeri yang terbit tidak dapat dihapus; tarik dulu dari publikasi");
  }
  await prisma.galleryItem.update({ where: { id: itemId }, data: { deletedAt: new Date() } });
  cleanupFile(item.fileId);
  return { id: itemId, deleted: true };
}

/** Atur ulang urutan: `itemIds` wajib memuat SELURUH item aktif, tanpa kurang/lebih. */
export async function reorderGalleryItems(actor: Actor, id: string, itemIds: string[]) {
  const { gallery, access } = await findOwned(actor, id);
  assertEditable(gallery.status, access);

  const current = new Set(gallery.items.map((i) => i.id));
  const unique = new Set(itemIds);
  if (unique.size !== itemIds.length) throw new BadRequestError("itemIds tidak boleh berisi duplikat");
  if (unique.size !== current.size || itemIds.some((x) => !current.has(x))) {
    throw new BadRequestError("itemIds harus memuat seluruh item galeri ini, tanpa kurang atau lebih");
  }

  await prisma.$transaction(
    itemIds.map((itemId, sortOrder) => prisma.galleryItem.update({ where: { id: itemId }, data: { sortOrder } })),
  );
  return prisma.galleryItem.findMany({ where: { galleryId: id, ...ITEMS_INCLUDE.where }, orderBy: ITEMS_INCLUDE.orderBy, select: ITEMS_INCLUDE.select });
}
