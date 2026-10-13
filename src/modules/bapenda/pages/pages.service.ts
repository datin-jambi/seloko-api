import type { Prisma } from "@prisma/client";
import { prisma } from "~/config/database.js";
import { BadRequestError, ConflictError, NotFoundError } from "~/common/errors/index.js";
import { APP_CODES } from "~/common/constants/index.js";
import { slugify } from "~/common/utils/index.js";
import { sanitizeContent } from "~/common/utils/html.js";
import type { CreatePageBody, ListPagesQuery, UpdatePageBody } from "./pages.schema.js";

/** Resolusi ID aplikasi target (bapenda-profile) */
async function getBapendaAppId(): Promise<string> {
  const app = await prisma.application.findUniqueOrThrow({
    where: { code: APP_CODES.BAPENDA_PROFILE },
    select: { id: true },
  });
  return app.id;
}

/** Slug unik per aplikasi. Unique index ikut menghitung baris terhapus. */
async function resolveSlug(
  applicationId: string,
  title: string,
  requested: string | undefined,
  excludeId?: string,
): Promise<string> {
  const slug = slugify(requested || title);
  if (!slug) throw new BadRequestError("Slug tidak dapat dibentuk dari judul");
  const taken = await prisma.page.count({
    where: { applicationId, slug, ...(excludeId && { NOT: { id: excludeId } }) },
  });
  // Slug halaman dipakai sebagai URL tetap (/profil/<slug>) — jangan diberi
  // akhiran otomatis; bentrok harus diputuskan editor.
  if (taken) throw new ConflictError(`Slug halaman "${slug}" sudah digunakan`);
  return slug;
}

/** Daftar halaman terbit untuk navigasi menu profil portal (tanpa isi). */
export async function listPublicPages() {
  const applicationId = await getBapendaAppId();
  return prisma.page.findMany({
    where: { applicationId, isPublished: true, deletedAt: null },
    select: {
      id: true,
      title: true,
      slug: true,
      seoTitle: true,
      seoDescription: true,
      isPublished: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
}

/** Detail halaman terbit berdasarkan slug. */
export async function getPublicPageBySlug(slug: string) {
  const applicationId = await getBapendaAppId();
  const page = await prisma.page.findFirst({
    where: { applicationId, slug, isPublished: true, deletedAt: null },
  });
  if (!page) throw new NotFoundError("Halaman");
  return page;
}

/** Daftar seluruh halaman untuk CMS dengan pagination & filter. */
export async function listPages(query: ListPagesQuery) {
  const { page, limit, search, isPublished, sortBy, sortOrder } = query;
  const applicationId = await getBapendaAppId();

  const where: Prisma.PageWhereInput = {
    applicationId,
    deletedAt: null,
    ...(isPublished !== undefined && { isPublished }),
    ...(search && {
      OR: [
        { title: { contains: search, mode: "insensitive" } },
        { slug: { contains: search, mode: "insensitive" } },
      ],
    }),
  };

  const [totalItems, data] = await Promise.all([
    prisma.page.count({ where }),
    prisma.page.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
    }),
  ]);

  const totalPages = Math.ceil(totalItems / limit) || 1;
  return {
    data,
    meta: {
      page,
      limit,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

export async function getPageById(id: string) {
  const applicationId = await getBapendaAppId();
  const page = await prisma.page.findFirst({ where: { id, applicationId, deletedAt: null } });
  if (!page) throw new NotFoundError("Halaman");
  return page;
}

/** Halaman baru selalu draft — terbit lewat PATCH /:id/publish. */
export async function createPage(body: CreatePageBody) {
  const applicationId = await getBapendaAppId();
  const slug = await resolveSlug(applicationId, body.title, body.slug);

  return prisma.page.create({
    data: {
      applicationId,
      title: body.title,
      slug,
      content: sanitizeContent(body.content),
      seoTitle: body.seoTitle ?? null,
      seoDescription: body.seoDescription ?? null,
      isPublished: false,
    },
  });
}

export async function updatePage(id: string, body: UpdatePageBody) {
  const existing = await getPageById(id);
  const data: Prisma.PageUpdateInput = {};

  if (body.title !== undefined) data.title = body.title;
  if (body.slug !== undefined) {
    data.slug = await resolveSlug(existing.applicationId, body.title ?? existing.title, body.slug, id);
  }
  if (body.content !== undefined) data.content = sanitizeContent(body.content);
  if (body.seoTitle !== undefined) data.seoTitle = body.seoTitle ?? null;
  if (body.seoDescription !== undefined) data.seoDescription = body.seoDescription ?? null;

  return prisma.page.update({ where: { id }, data });
}

/** Terbit (publishedAt = sekarang) / tarik ke draft (publishedAt = null). */
export async function setPagePublished(id: string, isPublished: boolean) {
  await getPageById(id);
  return prisma.page.update({
    where: { id },
    data: { isPublished, publishedAt: isPublished ? new Date() : null },
  });
}

export async function deletePage(id: string) {
  const existing = await getPageById(id);
  await prisma.page.update({ where: { id }, data: { deletedAt: new Date() } });
  return { id: existing.id, deleted: true };
}
