/**
 * faqs.service.ts — FAQ & Kategori FAQ portal Bapenda (PRD 02 §F).
 * Tanpa alur review: terbit/tarik lewat toggle, seperti halaman profil.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "~/config/database.js";
import { APP_CODES } from "~/common/constants/index.js";
import { BadRequestError, ConflictError, NotFoundError } from "~/common/errors/index.js";
import { slugify } from "~/common/utils/index.js";
import { sanitizeContent } from "~/common/utils/html.js";
import type {
  CreateFaqBody,
  CreateFaqCategoryBody,
  ListFaqCategoriesQuery,
  ListFaqsQuery,
  PublicListFaqsQuery,
  UpdateFaqBody,
  UpdateFaqCategoryBody,
} from "./faqs.schema.js";

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

/** Relasi aman untuk respons — penulis/pengubah hanya id + nama (tanpa PII). */
const FAQ_INCLUDE = {
  category: { select: { id: true, name: true, slug: true } },
  author: { select: { id: true, fullName: true } },
  updatedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.FaqInclude;

/** Publik tidak perlu tahu siapa penulis/pengubahnya. */
const PUBLIC_SELECT = {
  id: true,
  question: true,
  slug: true,
  answer: true,
  sortOrder: true,
  isPublished: true,
  viewCount: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.FaqSelect;

/** Slug unik per aplikasi; unique index ikut menghitung baris terhapus. */
async function uniqueSlug(
  taken: (slug: string) => Promise<boolean>,
  source: string,
  requested: string | undefined,
): Promise<string> {
  const base = slugify(requested || source);
  if (!base) throw new BadRequestError("Slug tidak dapat dibentuk");
  if (!(await taken(base))) return base;
  // Slug yang diketik sendiri harus persis — jangan diam-diam diubah.
  if (requested) throw new ConflictError(`Slug "${base}" sudah digunakan`);
  for (let i = 2; i < 100; i++) {
    const candidate = `${base}-${i}`;
    if (!(await taken(candidate))) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

const faqSlug = (applicationId: string, source: string, requested?: string, excludeId?: string) =>
  uniqueSlug(
    async (slug) => (await prisma.faq.count({ where: { applicationId, slug, ...(excludeId && { NOT: { id: excludeId } }) } })) > 0,
    source,
    requested,
  );

const categorySlug = (applicationId: string, source: string, requested?: string, excludeId?: string) =>
  uniqueSlug(
    async (slug) =>
      (await prisma.faqCategory.count({ where: { applicationId, slug, ...(excludeId && { NOT: { id: excludeId } }) } })) > 0,
    source,
    requested,
  );

async function assertCategory(applicationId: string, categoryId: string) {
  const found = await prisma.faqCategory.findFirst({
    where: { id: categoryId, applicationId, deletedAt: null },
    select: { id: true },
  });
  if (!found) throw new BadRequestError("Kategori FAQ tidak ditemukan");
}

async function findFaq(id: string) {
  const applicationId = await getAppId();
  const faq = await prisma.faq.findFirst({ where: { id, applicationId, deletedAt: null }, include: FAQ_INCLUDE });
  if (!faq) throw new NotFoundError("FAQ");
  return { faq, applicationId };
}

async function findCategory(id: string) {
  const applicationId = await getAppId();
  const category = await prisma.faqCategory.findFirst({ where: { id, applicationId, deletedAt: null } });
  if (!category) throw new NotFoundError("Kategori FAQ");
  return { category, applicationId };
}

// ─── Publik ───────────────────────────────────────────────────────────────────
/**
 * Semua FAQ terbit, tanpa paginasi (jumlahnya puluhan) — portal menampilkannya
 * per kategori. Urut kategori, lalu urutan FAQ di dalamnya.
 */
export async function listPublicFaqs(query: PublicListFaqsQuery) {
  const applicationId = await getAppId();
  return prisma.faq.findMany({
    where: {
      applicationId,
      isPublished: true,
      deletedAt: null,
      // FAQ di kategori nonaktif ikut tersembunyi.
      category: { isActive: true, deletedAt: null, ...(query.category && { slug: query.category }) },
      ...(query.search && {
        OR: [
          { question: { contains: query.search, mode: "insensitive" } },
          { answer: { contains: query.search, mode: "insensitive" } },
        ],
      }),
    },
    select: PUBLIC_SELECT,
    orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export async function listPublicFaqCategories() {
  const applicationId = await getAppId();
  return prisma.faqCategory.findMany({
    where: { applicationId, isActive: true, deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

/** Hitung pembaca (dari app lama). Hanya FAQ terbit di kategori aktif yang dihitung. */
export async function incrementFaqView(id: string) {
  const applicationId = await getAppId();
  const { count } = await prisma.faq.updateMany({
    where: { id, applicationId, isPublished: true, deletedAt: null, category: { isActive: true, deletedAt: null } },
    data: { viewCount: { increment: 1 } },
  });
  if (count === 0) throw new NotFoundError("FAQ");
  const { viewCount } = await prisma.faq.findUniqueOrThrow({ where: { id }, select: { viewCount: true } });
  return { id, viewCount };
}

// ─── CMS: FAQ ─────────────────────────────────────────────────────────────────
export async function listFaqs(query: ListFaqsQuery) {
  const applicationId = await getAppId();
  const { page, limit, search, categoryId, isPublished, sortBy, sortOrder } = query;
  const where: Prisma.FaqWhereInput = {
    applicationId,
    deletedAt: null,
    ...(categoryId && { categoryId }),
    ...(isPublished !== undefined && { isPublished }),
    ...(search && {
      OR: [
        { question: { contains: search, mode: "insensitive" } },
        { answer: { contains: search, mode: "insensitive" } },
      ],
    }),
  };
  const [totalItems, data] = await Promise.all([
    prisma.faq.count({ where }),
    prisma.faq.findMany({
      where,
      include: FAQ_INCLUDE,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ [sortBy]: sortOrder }, { createdAt: "asc" }],
    }),
  ]);
  return { data, meta: paginate(page, limit, totalItems) };
}

export async function getFaqById(id: string) {
  return (await findFaq(id)).faq;
}

/** FAQ baru selalu draft; tanpa `sortOrder` ditaruh di akhir kategorinya. */
export async function createFaq(userId: string, body: CreateFaqBody) {
  const applicationId = await getAppId();
  await assertCategory(applicationId, body.categoryId);
  const slug = await faqSlug(applicationId, body.question, body.slug);

  let sortOrder = body.sortOrder;
  if (sortOrder === undefined) {
    const last = await prisma.faq.aggregate({
      where: { applicationId, categoryId: body.categoryId, deletedAt: null },
      _max: { sortOrder: true },
    });
    sortOrder = (last._max.sortOrder ?? 0) + 1;
  }

  return prisma.faq.create({
    data: {
      applicationId,
      categoryId: body.categoryId,
      authorId: userId,
      question: body.question,
      slug,
      answer: sanitizeContent(body.answer),
      sortOrder,
      isPublished: false,
    },
    include: FAQ_INCLUDE,
  });
}

export async function updateFaq(userId: string, id: string, body: UpdateFaqBody) {
  const { faq, applicationId } = await findFaq(id);
  if (body.categoryId !== undefined) await assertCategory(applicationId, body.categoryId);

  const data: Prisma.FaqUncheckedUpdateInput = { updatedById: userId };
  if (body.question !== undefined) data.question = body.question;
  if (body.slug !== undefined) data.slug = await faqSlug(applicationId, body.question ?? faq.question, body.slug, id);
  if (body.answer !== undefined) data.answer = sanitizeContent(body.answer);
  if (body.categoryId !== undefined) data.categoryId = body.categoryId;
  if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;

  return prisma.faq.update({ where: { id }, data, include: FAQ_INCLUDE });
}

/** Terbit (publishedAt = sekarang) / tarik ke draft (publishedAt = null). */
export async function setFaqPublished(userId: string, id: string, isPublished: boolean) {
  const { faq } = await findFaq(id);
  if (faq.isPublished === isPublished) return faq;
  return prisma.faq.update({
    where: { id },
    data: { isPublished, publishedAt: isPublished ? new Date() : null, updatedById: userId },
    include: FAQ_INCLUDE,
  });
}

export async function deleteFaq(id: string) {
  await findFaq(id);
  await prisma.faq.update({ where: { id }, data: { deletedAt: new Date() } });
  return { id, deleted: true };
}

/**
 * Atur ulang urutan FAQ dalam satu kategori. `faqIds` wajib memuat SELURUH FAQ
 * kategori itu — daftar kurang/lebih/duplikat ditolak agar tidak ada FAQ yang
 * urutannya tertinggal karena klien memakai data basi.
 */
export async function reorderFaqs(categoryId: string, faqIds: string[]) {
  const applicationId = await getAppId();
  await assertCategory(applicationId, categoryId);
  const current = await prisma.faq.findMany({
    where: { applicationId, categoryId, deletedAt: null },
    select: { id: true },
  });
  const ids = new Set(current.map((f) => f.id));
  const unique = new Set(faqIds);
  if (unique.size !== faqIds.length) throw new BadRequestError("faqIds tidak boleh berisi duplikat");
  if (unique.size !== ids.size || faqIds.some((x) => !ids.has(x))) {
    throw new BadRequestError("faqIds harus memuat seluruh FAQ kategori ini, tanpa kurang atau lebih");
  }
  // Mulai dari 1 — konsisten dengan data lama.
  await prisma.$transaction(
    faqIds.map((faqId, i) => prisma.faq.update({ where: { id: faqId }, data: { sortOrder: i + 1 } })),
  );
  return prisma.faq.findMany({
    where: { applicationId, categoryId, deletedAt: null },
    include: FAQ_INCLUDE,
    orderBy: { sortOrder: "asc" },
  });
}

// ─── CMS: Kategori ────────────────────────────────────────────────────────────
export async function listFaqCategories(query: ListFaqCategoriesQuery) {
  const applicationId = await getAppId();
  return prisma.faqCategory.findMany({
    where: {
      applicationId,
      deletedAt: null,
      ...(query.isActive !== undefined && { isActive: query.isActive }),
      ...(query.search && { name: { contains: query.search, mode: "insensitive" } }),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function createFaqCategory(body: CreateFaqCategoryBody) {
  const applicationId = await getAppId();
  const slug = await categorySlug(applicationId, body.name, body.slug);
  return prisma.faqCategory.create({
    data: {
      applicationId,
      name: body.name,
      slug,
      description: body.description ?? null,
      sortOrder: body.sortOrder,
      isActive: body.isActive,
    },
  });
}

export async function updateFaqCategory(id: string, body: UpdateFaqCategoryBody) {
  const { category, applicationId } = await findCategory(id);
  const data: Prisma.FaqCategoryUncheckedUpdateInput = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.slug !== undefined) data.slug = await categorySlug(applicationId, body.name ?? category.name, body.slug, id);
  if (body.description !== undefined) data.description = body.description ?? null;
  if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;
  if (body.isActive !== undefined) data.isActive = body.isActive;
  return prisma.faqCategory.update({ where: { id }, data });
}

export async function setFaqCategoryActive(id: string, isActive: boolean) {
  await findCategory(id);
  return prisma.faqCategory.update({ where: { id }, data: { isActive } });
}

/** Kategori yang masih dipakai FAQ aktif tidak boleh dihapus. */
export async function deleteFaqCategory(id: string) {
  const { applicationId } = await findCategory(id);
  const used = await prisma.faq.count({ where: { applicationId, categoryId: id, deletedAt: null } });
  if (used > 0) throw new ConflictError(`Kategori masih dipakai ${used} FAQ — pindahkan atau hapus FAQ-nya dulu`);
  await prisma.faqCategory.update({ where: { id }, data: { deletedAt: new Date() } });
  return { id, deleted: true };
}
