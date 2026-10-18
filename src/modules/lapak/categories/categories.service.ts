import { prisma } from "~/config/database.js";
import { NotFoundError, ConflictError, BadRequestError } from "~/common/errors/index.js";
import { APP_CODES } from "~/common/constants/index.js";
import { slugify } from "~/common/utils/index.js";
import type { Prisma } from "@prisma/client";
import type {
  ListCategoriesQuery,
  PublicListCategoriesQuery,
  CreateCategoryBody,
  UpdateCategoryBody,
  LapakCategoryDto,
} from "./categories.schema.js";

/** ID aplikasi pemilik katalog — kategori adalah master Lapak Web. */
async function getLapakAppId(): Promise<string> {
  const app = await prisma.application.findUniqueOrThrow({
    where: { code: APP_CODES.LAPAK_JAMBI_WEB },
    select: { id: true },
  });
  return app.id;
}

/** Prisma row → DTO (Date → ISO). */
function toDto(row: {
  id: string;
  applicationId: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  defaultPricingUnit: string | null;
  defaultAvailabilityType: string | null;
  defaultFulfillmentType: string | null;
  createdAt: Date;
  updatedAt: Date;
}): LapakCategoryDto {
  return {
    id: row.id,
    applicationId: row.applicationId,
    name: row.name,
    slug: row.slug,
    description: row.description,
    icon: row.icon,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    defaultPricingUnit: row.defaultPricingUnit as LapakCategoryDto["defaultPricingUnit"],
    defaultAvailabilityType: row.defaultAvailabilityType as LapakCategoryDto["defaultAvailabilityType"],
    defaultFulfillmentType: row.defaultFulfillmentType as LapakCategoryDto["defaultFulfillmentType"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Konflik slug unik per aplikasi (P2002) diterjemahkan jadi 409 yang ramah. */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}

// ─── Queries ──────────────────────────────────────────────────────────────────
export async function listCategories(query: ListCategoriesQuery) {
  const { page, limit, search, isActive, sortBy, sortOrder } = query;
  const applicationId = await getLapakAppId();
  const skip = (page - 1) * limit;

  const where: Prisma.LapakCategoryWhereInput = {
    applicationId,
    deletedAt: null,
    ...(isActive !== undefined && { isActive }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { slug: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ],
    }),
  };

  const [totalItems, rows] = await Promise.all([
    prisma.lapakCategory.count({ where }),
    prisma.lapakCategory.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ [sortBy]: sortOrder }, { name: "asc" }],
    }),
  ]);

  const totalPages = Math.ceil(totalItems / limit) || 1;

  return {
    data: rows.map(toDto),
    meta: { page, limit, totalItems, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 },
  };
}

export async function getPublicCategories(query: PublicListCategoriesQuery) {
  const applicationId = await getLapakAppId();
  const rows = await prisma.lapakCategory.findMany({
    where: {
      applicationId,
      deletedAt: null,
      isActive: true,
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: "insensitive" } },
          { description: { contains: query.search, mode: "insensitive" } },
        ],
      }),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true, name: true, slug: true, description: true, icon: true,
    },
  });
  return rows;
}

export async function getCategoryById(id: string) {
  const applicationId = await getLapakAppId();
  const row = await prisma.lapakCategory.findFirst({
    where: { id, applicationId, deletedAt: null },
  });
  if (!row) throw new NotFoundError("Kategori", id);
  return toDto(row);
}

export async function getPublicCategoryBySlug(slug: string) {
  const applicationId = await getLapakAppId();
  const row = await prisma.lapakCategory.findFirst({
    where: { slug, applicationId, deletedAt: null, isActive: true },
    select: { id: true, name: true, slug: true, description: true, icon: true },
  });
  if (!row) throw new NotFoundError(`Kategori dengan slug '${slug}'`);
  return row;
}

// ─── Mutations ────────────────────────────────────────────────────────────────
export async function createCategory(data: CreateCategoryBody) {
  const applicationId = await getLapakAppId();
  const slug = data.slug ?? slugify(data.name);
  if (!slug) {
    throw new BadRequestError("Slug tidak dapat dibentuk dari nama kategori — isi manual");
  }

  // Slug adalah URL publik: bentrok AKTIF ditolak, TIDAK diberi akhiran
  // otomatis, agar tautan tidak berubah diam-diam (keputusan sama dengan
  // modul pages). Slug milik baris soft-delete boleh dihidupkan kembali —
  // sejalan dengan perilaku seeder dan upsert UPTD.
  const existing = await prisma.lapakCategory.findFirst({
    where: { applicationId, slug },
    select: { id: true, deletedAt: true },
  });

  const payload = {
    name: data.name,
    slug,
    description: data.description ?? null,
    icon: data.icon ?? null,
    sortOrder: data.sortOrder,
    isActive: data.isActive,
    defaultPricingUnit: data.defaultPricingUnit ?? null,
    defaultAvailabilityType: data.defaultAvailabilityType ?? null,
    defaultFulfillmentType: data.defaultFulfillmentType ?? null,
  };

  if (existing) {
    if (existing.deletedAt) {
      const row = await prisma.lapakCategory.update({
        where: { id: existing.id },
        data: { ...payload, deletedAt: null, updatedAt: new Date() },
      });
      return toDto(row);
    }
    throw new ConflictError(`Slug '${slug}' sudah digunakan kategori lain`);
  }

  try {
    const row = await prisma.lapakCategory.create({
      data: { applicationId, ...payload },
    });
    return toDto(row);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ConflictError(`Slug '${slug}' sudah digunakan kategori lain`);
    }
    throw err;
  }
}

export async function updateCategory(id: string, data: UpdateCategoryBody) {
  const applicationId = await getLapakAppId();
  const existing = await prisma.lapakCategory.findFirst({
    where: { id, applicationId, deletedAt: null },
    select: { id: true, slug: true },
  });
  if (!existing) throw new NotFoundError("Kategori", id);

  if (data.slug && data.slug !== existing.slug) {
    const conflict = await prisma.lapakCategory.findFirst({
      where: { applicationId, slug: data.slug, id: { not: id }, deletedAt: null },
      select: { id: true },
    });
    if (conflict) {
      throw new ConflictError(`Slug '${data.slug}' sudah digunakan kategori lain`);
    }
  }

  const updatePayload: Prisma.LapakCategoryUpdateInput = {};
  if (data.name !== undefined) updatePayload.name = data.name;
  if (data.slug !== undefined) updatePayload.slug = data.slug;
  if (data.description !== undefined) updatePayload.description = data.description ?? null;
  if (data.icon !== undefined) updatePayload.icon = data.icon ?? null;
  if (data.sortOrder !== undefined) updatePayload.sortOrder = data.sortOrder;
  if (data.isActive !== undefined) updatePayload.isActive = data.isActive;
  if (data.defaultPricingUnit !== undefined) updatePayload.defaultPricingUnit = data.defaultPricingUnit ?? null;
  if (data.defaultAvailabilityType !== undefined) updatePayload.defaultAvailabilityType = data.defaultAvailabilityType ?? null;
  if (data.defaultFulfillmentType !== undefined) updatePayload.defaultFulfillmentType = data.defaultFulfillmentType ?? null;

  try {
    const row = await prisma.lapakCategory.update({ where: { id }, data: updatePayload });
    return toDto(row);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ConflictError(`Slug sudah digunakan kategori lain`);
    }
    throw err;
  }
}

export async function setCategoryActive(id: string, isActive: boolean) {
  const applicationId = await getLapakAppId();
  const existing = await prisma.lapakCategory.findFirst({
    where: { id, applicationId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError("Kategori", id);

  const row = await prisma.lapakCategory.update({ where: { id }, data: { isActive } });
  return toDto(row);
}

export async function reorderCategories(items: { id: string; sortOrder: number }[]) {
  const applicationId = await getLapakAppId();
  const ids = items.map((item) => item.id);
  // Semua id harus milik aplikasi ini — mencegah perubahan lintas tenant lewat
  // payload yang direkayasa.
  const owned = await prisma.lapakCategory.findMany({
    where: { id: { in: ids }, applicationId, deletedAt: null },
    select: { id: true },
  });
  if (owned.length !== new Set(ids).size) {
    throw new BadRequestError("Ada kategori yang tidak ditemukan atau bukan milik aplikasi ini");
  }

  await prisma.$transaction(
    items.map((item) =>
      prisma.lapakCategory.update({
        where: { id: item.id },
        data: { sortOrder: item.sortOrder },
      }),
    ),
  );
  return { updated: items.length };
}

export async function deleteCategory(id: string) {
  const applicationId = await getLapakAppId();
  const existing = await prisma.lapakCategory.findFirst({
    where: { id, applicationId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError("Kategori", id);

  // TODO(LJ-1.2): tolak bila masih dipakai produk
  // (`prisma.lapakProduct.count({ where: { categoryId: id } })` > 0 → 409).
  // Model LapakProduct baru lahir di LJ-1.2, jadi penjaga itu ditambah di sana.

  await prisma.lapakCategory.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  });
  return { id, deleted: true };
}
