import { z } from "zod";
import { prisma } from "~/config/database.js";
import { NotFoundError, ConflictError, BadRequestError, ForbiddenError } from "~/common/errors/index.js";
import { APP_CODES } from "~/common/constants/index.js";
import { slugify } from "~/common/utils/index.js";
import type { Prisma, ContentStatus } from "@prisma/client";
import type {
  ListProductsQuery,
  PublicListProductsQuery,
  CreateProductBody,
  UpdateProductBody,
  ProductActionParams,
  ProductDto,
  RateInputSchema,
  AddonInputSchema,
  RequirementInputSchema,
  FacilityInputSchema,
  ImageInputSchema,
} from "./products.schema.js";

// ─── Konteks aplikasi & lingkup OPD ───────────────────────────────────────────
async function getLapakAppId(): Promise<string> {
  const app = await prisma.application.findUniqueOrThrow({
    where: { code: APP_CODES.LAPAK_JAMBI_WEB },
    select: { id: true },
  });
  return app.id;
}

/**
 * Lingkup OPD yang boleh dijangkau user pada aplikasi Lapak.
 * - Superadmin / tanpa baris lingkup → null = SEMUA OPD (level Bapenda).
 * - Ada baris lingkup → hanya OPD itu (union beberapa penugasan).
 */
export async function accessibleOrganizationIds(
  userId: string,
  isSuperAdmin: boolean,
): Promise<string[] | null> {
  if (isSuperAdmin) return null;
  const scopes = await prisma.userAppRoleOrganization.findMany({
    where: {
      userAppRole: {
        userId,
        application: { code: APP_CODES.LAPAK_JAMBI_WEB },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    },
    select: { organizationId: true },
  });
  // Tanpa baris lingkup = penugasan level Bapenda (semua OPD).
  return scopes.length === 0 ? null : [...new Set(scopes.map((s) => s.organizationId))];
}

/** Buang baris di luar lingkup; throw 403 bila produk spesifik tak boleh disentuh. */
function assertInScope(
  organizationId: string,
  scope: string[] | null,
): void {
  if (scope !== null && !scope.includes(organizationId)) {
    throw new ForbiddenError("Produk ini di luar lingkup OPD Anda");
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const PRODUCT_INCLUDE = {
  organization: { select: { id: true, code: true, name: true } },
  category: { select: { id: true, name: true, slug: true } },
  rates: { where: { deletedAt: null }, orderBy: [{ status: "asc" as const }, { price: "asc" as const }] },
  addons: { where: { deletedAt: null }, orderBy: { name: "asc" } },
  requirements: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" } },
  facilities: { where: { deletedAt: null }, orderBy: { name: "asc" } },
  images: { where: { deletedAt: null }, orderBy: [{ isPrimary: "desc" as const }, { sortOrder: "asc" }] },
} satisfies Prisma.LapakProductInclude;

type ProductRow = Prisma.LapakProductGetPayload<{ include: typeof PRODUCT_INCLUDE }>;

function dec(value: Prisma.Decimal | number | null): number | null {
  if (value === null) return null;
  return Number(value);
}

function toDto(row: ProductRow): ProductDto {
  return {
    id: row.id,
    applicationId: row.applicationId,
    organizationId: row.organizationId,
    categoryId: row.categoryId,
    retributionObjectId: row.retributionObjectId,
    name: row.name,
    slug: row.slug,
    excerpt: row.excerpt,
    description: row.description,
    address: row.address,
    latitude: dec(row.latitude),
    longitude: dec(row.longitude),
    capacity: row.capacity,
    areaM2: row.areaM2,
    pricingUnit: row.pricingUnit as ProductDto["pricingUnit"],
    availabilityType: row.availabilityType as ProductDto["availabilityType"],
    fulfillmentType: row.fulfillmentType as ProductDto["fulfillmentType"],
    status: row.status,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    coverUrl: row.coverUrl,
    coverFileId: row.coverFileId,
    organization: row.organization,
    category: row.category,
    rates: row.rates.map((r) => ({
      id: r.id,
      name: r.name,
      unit: r.unit as ProductDto["rates"][number]["unit"],
      price: Number(r.price),
      minQty: r.minQty,
      maxQty: r.maxQty,
      startTime: r.startTime,
      endTime: r.endTime,
      status: r.status,
      effectiveFrom: r.effectiveFrom.toISOString(),
      isActive: r.isActive,
    })),
    addons: row.addons.map((a) => ({
      id: a.id,
      name: a.name,
      unit: a.unit as ProductDto["addons"][number]["unit"],
      price: Number(a.price),
      isActive: a.isActive,
    })),
    requirements: row.requirements.map((q) => ({
      id: q.id,
      label: q.label,
      fieldType: q.fieldType as ProductDto["requirements"][number]["fieldType"],
      options: (q.options as string[] | null) ?? null,
      isRequired: q.isRequired,
      sortOrder: q.sortOrder,
    })),
    facilities: row.facilities.map((f) => ({ id: f.id, name: f.name, icon: f.icon })),
    images: row.images.map((i) => ({
      id: i.id,
      url: i.url,
      fileId: i.fileId,
      altText: i.altText,
      isPrimary: i.isPrimary,
      sortOrder: i.sortOrder,
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002";
}

/**
 * Mesin transisi status produk — sama dengan artikel, sumber tunggal
 * ContentStatus (PRD 04 §C: "memakai enum ContentStatus yang sudah ada").
 */
const TRANSITIONS = {
  submit: { from: ["DRAFT", "REJECTED"], to: "PENDING_REVIEW", permission: null },
  approve: { from: ["PENDING_REVIEW"], to: "APPROVED", permission: "approve" },
  reject: { from: ["PENDING_REVIEW"], to: "REJECTED", permission: "reject" },
  publish: { from: ["DRAFT", "APPROVED"], to: "PUBLISHED", permission: "publish" },
  unpublish: { from: ["PUBLISHED"], to: "DRAFT", permission: "publish" },
} as const;

type ProductAction = keyof typeof TRANSITIONS;

export function requiredPermission(action: ProductAction): "approve" | "reject" | "publish" | null {
  return TRANSITIONS[action].permission;
}

// ─── Sync anak-anak produk (rates/addons/requirements/facilities/images) ──────
type ChildSets = {
  rates?: z.infer<typeof RateInputSchema>[];
  addons?: z.infer<typeof AddonInputSchema>[];
  requirements?: z.infer<typeof RequirementInputSchema>[];
  facilities?: z.infer<typeof FacilityInputSchema>[];
  images?: z.infer<typeof ImageInputSchema>[];
};

/**
 * Sinkronisasi anak: id ada → update; id absen → create; id di DB yang tidak
 * dikirim → soft-delete. Pola "replace-set" agar menghapus item dari payload
 * benar-benar menghapusnya.
 */
/** Nama tabel payload → model Prisma (bukan nama tabel DB). */
const CHILD_MODELS = {
  rates: prisma.lapakProductRate,
  addons: prisma.lapakProductAddon,
  requirements: prisma.lapakProductRequirement,
  facilities: prisma.lapakProductFacility,
  images: prisma.lapakProductImage,
} as const;

async function syncChildren(productId: string, children: ChildSets): Promise<void> {
  // `any` di sini disengaja: lima tabel punya shape berbeda, dan Prisma tidak
  // bisa menyatukan create/update-nya lewat satu tipe tanpa verbositas yang
  // lebih besar daripada manfaatnya. Validasi bentuk sudah dilakukan Zod.
  const plan = async (
    table: "rates" | "addons" | "requirements" | "facilities" | "images",
    incoming: any[] | undefined,
    update: (id: string, data: any) => unknown,
    create: (data: any) => unknown,
  ) => {
    if (!incoming) return;
    const keepIds = incoming.map((x) => x.id).filter((x): x is string => Boolean(x));
    const model = CHILD_MODELS[table] as any;
    await model.updateMany({
      where: { productId, id: { notIn: keepIds }, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    for (const item of incoming) {
      const { id, ...data } = item as { id?: string } & Record<string, unknown>;
      if (id) {
        await update(id, { ...data, deletedAt: null });
      } else {
        await create({ ...data, productId });
      }
    }
  };

  await plan("rates", children.rates as any[] | undefined,
    (id, d) => prisma.lapakProductRate.update({ where: { id }, data: { ...d, effectiveFrom: d.effectiveFrom ?? undefined } }),
    (d) => prisma.lapakProductRate.create({ data: d }));
  await plan("addons", children.addons as any[] | undefined,
    (id, d) => prisma.lapakProductAddon.update({ where: { id }, data: d }),
    (d) => prisma.lapakProductAddon.create({ data: d }));
  await plan("requirements", children.requirements as any[] | undefined,
    (id, d) => prisma.lapakProductRequirement.update({ where: { id }, data: d }),
    (d) => prisma.lapakProductRequirement.create({ data: d }));
  await plan("facilities", children.facilities as any[] | undefined,
    (id, d) => prisma.lapakProductFacility.update({ where: { id }, data: d }),
    (d) => prisma.lapakProductFacility.create({ data: d }));
  await plan("images", children.images as any[] | undefined,
    (id, d) => prisma.lapakProductImage.update({ where: { id }, data: d }),
    (d) => prisma.lapakProductImage.create({ data: d }));
}

/** Validasi OPD & kategori aktif + warisi nilai bawaan kategori bila tak diisi. */
async function resolveDefaults(
  categoryId: string,
  body: Pick<CreateProductBody, "pricingUnit" | "availabilityType" | "fulfillmentType">,
): Promise<{ pricingUnit: string; availabilityType: string; fulfillmentType: string }> {
  const category = await prisma.lapakCategory.findFirst({
    where: { id: categoryId, deletedAt: null },
    select: {
      isActive: true,
      defaultPricingUnit: true,
      defaultAvailabilityType: true,
      defaultFulfillmentType: true,
    },
  });
  if (!category) throw new NotFoundError("Kategori", categoryId);
  if (!category.isActive) throw new BadRequestError("Kategori nonaktif — pilih kategori lain");

  // null eksplisit dari klien diperlakukan sama dengan tidak dikirim:
  // fallback ke bawaan kategori (dipakai frontend yang mem-bersihkan form).
  const pricingUnit = body.pricingUnit ?? category.defaultPricingUnit;
  const availabilityType = body.availabilityType ?? category.defaultAvailabilityType;
  const fulfillmentType = body.fulfillmentType ?? category.defaultFulfillmentType;
  if (!pricingUnit || !availabilityType || !fulfillmentType) {
    throw new BadRequestError(
      "Kategori tidak memiliki nilai bawaan lengkap — isi pricingUnit/availabilityType/fulfillmentType secara manual",
    );
  }
  return { pricingUnit, availabilityType, fulfillmentType };
}

// ─── Queries (CMS) ────────────────────────────────────────────────────────────
export async function listProducts(
  query: ListProductsQuery,
  scope: string[] | null,
) {
  const { page, limit, search, organizationId, categoryId, status, sortBy, sortOrder } = query;
  const applicationId = await getLapakAppId();
  const skip = (page - 1) * limit;

  const where: Prisma.LapakProductWhereInput = {
    applicationId,
    deletedAt: null,
    // Bapenda (scope null) melihat semua; OPD hanya miliknya.
    ...(scope !== null && { organizationId: { in: scope } }),
    ...(organizationId && { organizationId }),
    ...(categoryId && { categoryId }),
    ...(status && { status }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { slug: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ],
    }),
  };

  const [totalItems, rows] = await Promise.all([
    prisma.lapakProduct.count({ where }),
    prisma.lapakProduct.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ [sortBy]: sortOrder }],
      include: PRODUCT_INCLUDE,
    }),
  ]);

  const totalPages = Math.ceil(totalItems / limit) || 1;
  return {
    data: rows.map(toDto),
    meta: { page, limit, totalItems, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 },
  };
}

export async function getProductById(id: string, scope: string[] | null) {
  const applicationId = await getLapakAppId();
  const row = await prisma.lapakProduct.findFirst({
    where: { id, applicationId, deletedAt: null },
    include: PRODUCT_INCLUDE,
  });
  if (!row) throw new NotFoundError("Produk", id);
  assertInScope(row.organizationId, scope);
  return toDto(row);
}

// ─── Mutations (CMS) ──────────────────────────────────────────────────────────
export async function createProduct(body: CreateProductBody, scope: string[] | null) {
  const applicationId = await getLapakAppId();

  // OPD yang membuat produk harus dalam lingkupnya (Bapenda = bebas).
  assertInScope(body.organizationId, scope);

  const org = await prisma.organization.findFirst({
    where: { id: body.organizationId, deletedAt: null, isActive: true },
    select: { id: true },
  });
  if (!org) throw new NotFoundError("OPD", body.organizationId);

  const attrs = await resolveDefaults(body.categoryId, body);
  const slug = body.slug ?? slugify(body.name);
  if (!slug) throw new BadRequestError("Slug tidak dapat dibentuk dari nama — isi manual");

  const existing = await prisma.lapakProduct.findFirst({
    where: { applicationId, slug },
    select: { id: true, deletedAt: true },
  });
  if (existing && !existing.deletedAt) {
    throw new ConflictError(`Slug '${slug}' sudah digunakan produk lain`);
  }

  const { rates, addons, requirements, facilities, images, ...head } = body;

  // Nested create: buang `id` dari payload anak (selalu undefined di sini,
  // tapi biar aman). `any` karena lima tabel berbeda shape — Zod yang menjaga
  // bentuknya; tipe generik Prisma justru menolak union lima tabel sekaligus.
  const stripId = (items: any[] | undefined): any[] =>
    (items ?? []).map(({ id: _id, ...rest }) => rest);

  const row = await prisma.lapakProduct.create({
    data: {
      applicationId,
      organizationId: body.organizationId,
      categoryId: body.categoryId,
      name: head.name,
      slug,
      excerpt: head.excerpt ?? null,
      description: head.description,
      address: head.address ?? null,
      latitude: head.latitude ?? null,
      longitude: head.longitude ?? null,
      capacity: head.capacity ?? null,
      areaM2: head.areaM2 ?? null,
      ...attrs,
      coverUrl: head.coverUrl ?? null,
      coverFileId: head.coverFileId ?? null,
      rates: { create: stripId(rates) },
      addons: { create: stripId(addons) },
      requirements: { create: stripId(requirements).map((q) => ({ ...q, options: q.options ?? undefined })) },
      facilities: { create: stripId(facilities) },
      images: { create: stripId(images).map((i) => ({ ...i, fileId: i.fileId ?? null, altText: i.altText ?? null })) },
    },
    include: PRODUCT_INCLUDE,
  });
  return toDto(row);
}

export async function updateProduct(id: string, body: UpdateProductBody, scope: string[] | null) {
  const applicationId = await getLapakAppId();
  const existing = await prisma.lapakProduct.findFirst({
    where: { id, applicationId, deletedAt: null },
    select: { id: true, organizationId: true, slug: true, categoryId: true },
  });
  if (!existing) throw new NotFoundError("Produk", id);
  assertInScope(existing.organizationId, scope);

  // Hanya DRAFT/REJECTED yang boleh diedit bebas (aturan sama dengan artikel).
  const full = await prisma.lapakProduct.findUniqueOrThrow({
    where: { id },
    select: { status: true },
  });
  if (!["DRAFT", "REJECTED"].includes(full.status)) {
    throw new ForbiddenError(
      `Produk ber-status ${full.status} tidak boleh diedit — ajukan unpublish dahulu`,
    );
  }

  // Pindah OPD: OPD tujuan harus tetap dalam lingkup.
  if (body.organizationId && body.organizationId !== existing.organizationId) {
    assertInScope(body.organizationId, scope);
    const org = await prisma.organization.findFirst({
      where: { id: body.organizationId, deletedAt: null, isActive: true },
      select: { id: true },
    });
    if (!org) throw new NotFoundError("OPD", body.organizationId);
  }

  let attrs: { pricingUnit?: string; availabilityType?: string; fulfillmentType?: string } = {};
  const categoryId = body.categoryId ?? existing.categoryId;
  if (body.categoryId || body.pricingUnit !== undefined || body.availabilityType !== undefined || body.fulfillmentType !== undefined) {
    attrs = await resolveDefaults(categoryId, {
      pricingUnit: body.pricingUnit,
      availabilityType: body.availabilityType,
      fulfillmentType: body.fulfillmentType,
    });
  }

  const slug = body.slug ?? undefined;
  if (slug && slug !== existing.slug) {
    const conflict = await prisma.lapakProduct.findFirst({
      where: { applicationId, slug, id: { not: id }, deletedAt: null },
      select: { id: true },
    });
    if (conflict) throw new ConflictError(`Slug '${slug}' sudah digunakan produk lain`);
  }

  const { rates, addons, requirements, facilities, images, ...head } = body;

  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.lapakProduct.update({
      where: { id },
      data: {
        ...(head.name !== undefined && { name: head.name }),
        ...(slug !== undefined && { slug }),
        ...(head.excerpt !== undefined && { excerpt: head.excerpt ?? null }),
        ...(head.description !== undefined && { description: head.description }),
        ...(head.address !== undefined && { address: head.address ?? null }),
        ...(head.latitude !== undefined && { latitude: head.latitude ?? null }),
        ...(head.longitude !== undefined && { longitude: head.longitude ?? null }),
        ...(head.capacity !== undefined && { capacity: head.capacity ?? null }),
        ...(head.areaM2 !== undefined && { areaM2: head.areaM2 ?? null }),
        ...(attrs.pricingUnit !== undefined && { pricingUnit: attrs.pricingUnit }),
        ...(attrs.availabilityType !== undefined && { availabilityType: attrs.availabilityType }),
        ...(attrs.fulfillmentType !== undefined && { fulfillmentType: attrs.fulfillmentType }),
        ...(head.coverUrl !== undefined && { coverUrl: head.coverUrl ?? null }),
        ...(head.coverFileId !== undefined && { coverFileId: head.coverFileId ?? null }),
        ...(body.organizationId !== undefined && { organizationId: body.organizationId }),
        ...(body.categoryId !== undefined && { categoryId: body.categoryId }),
      },
      include: PRODUCT_INCLUDE,
    });
    return updated;
  });

  await syncChildren(id, { rates, addons, requirements, facilities, images } as ChildSets);

  const fresh = await prisma.lapakProduct.findUniqueOrThrow({
    where: { id },
    include: PRODUCT_INCLUDE,
  });
  return toDto(fresh);
}

export async function patchProductStatus(
  params: ProductActionParams,
  scope: string[] | null,
  permissions: string[],
): Promise<ProductDto> {
  const applicationId = await getLapakAppId();
  const existing = await prisma.lapakProduct.findFirst({
    where: { id: params.id, applicationId, deletedAt: null },
    select: { id: true, organizationId: true, status: true, name: true },
  });
  if (!existing) throw new NotFoundError("Produk", params.id);
  assertInScope(existing.organizationId, scope);

  const action = params.action as ProductAction;
  const rule = TRANSITIONS[action] as { from: readonly string[]; to: ContentStatus; permission: "approve" | "reject" | "publish" | null };
  if (!rule.from.includes(existing.status)) {
    throw new BadRequestError(
      `Aksi '${action}' tidak sah dari status ${existing.status}`,
    );
  }

  const permission = rule.permission;
  if (permission && !permissions.includes(`product:${permission}`)) {
    throw new ForbiddenError(`Butuh izin product:${permission} untuk aksi ini`);
  }

  // approve/reject/publish hanya dari OPD yang sama (lingkup sudah dijaga atas).
  const row = await prisma.lapakProduct.update({
    where: { id: existing.id },
    data: {
      status: rule.to as ContentStatus,
      ...(rule.to === "PUBLISHED" && { publishedAt: new Date() }),
      ...(action === "unpublish" && { publishedAt: null }),
    },
    include: PRODUCT_INCLUDE,
  });
  return toDto(row);
}

export async function deleteProduct(id: string, scope: string[] | null) {
  const applicationId = await getLapakAppId();
  const existing = await prisma.lapakProduct.findFirst({
    where: { id, applicationId, deletedAt: null },
    select: { id: true, organizationId: true, status: true },
  });
  if (!existing) throw new NotFoundError("Produk", id);
  assertInScope(existing.organizationId, scope);

  if (existing.status === "PUBLISHED") {
    throw new ConflictError("Produk masih terbit — unpublish dahulu sebelum dihapus");
  }

  await prisma.lapakProduct.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  return { id, deleted: true };
}

// ─── Publik ───────────────────────────────────────────────────────────────────
/**
 * Tarif yang terlihat publik (PRD 04 §C, penuh sejak LJ-1.3): hanya
 * APPROVED/PUBLISHED yang `effectiveFrom` sudah tercapai. Tarif DRAFT tidak
 * pernah bocor ke portal; produk yang belum punya tarif terapprove
 * menyajikan `rates: []` dan `startingPrice: 0`.
 */
const PUBLIC_RATE_FILTER = {
  deletedAt: null,
  isActive: true,
  status: { in: ["APPROVED", "PUBLISHED"] as ContentStatus[] },
  effectiveFrom: { lte: new Date() },
} as const;

export async function getPublicProducts(query: PublicListProductsQuery) {
  const applicationId = await getLapakAppId();
  const { page, limit, search, category, organization, minPrice, maxPrice, sortBy, sortOrder } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.LapakProductWhereInput = {
    applicationId,
    deletedAt: null,
    status: "PUBLISHED",
    ...(category && { category: { slug: category, isActive: true, deletedAt: null } }),
    ...(organization && { organization: { code: organization, deletedAt: null } }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { address: { contains: search, mode: "insensitive" } },
      ],
    }),
  };

  // Filter harga dihitung di level tarif termurah: subquery agregat.
  if (minPrice !== undefined || maxPrice !== undefined) {
    where.rates = {
      some: {
        ...PUBLIC_RATE_FILTER,
        ...(minPrice !== undefined && { price: { gte: minPrice } }),
        ...(maxPrice !== undefined && { price: { lte: maxPrice } }),
      },
    };
  }

  const isPriceSort = sortBy === "price";
  const [totalItems, rows] = await Promise.all([
    prisma.lapakProduct.count({ where }),
    prisma.lapakProduct.findMany({
      where,
      skip,
      take: limit,
      orderBy: isPriceSort
        ? { rates: { _count: "desc" } } // fallback; sort harga dikerjakan di memori
        : { [sortBy === "name" ? "name" : "publishedAt"]: sortOrder },
      include: {
        organization: { select: { code: true, name: true } },
        category: { select: { name: true, slug: true } },
        rates: { where: PUBLIC_RATE_FILTER, orderBy: { price: "asc" }, take: 1 },
      },
    }),
  ]);

  let cards = rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    excerpt: row.excerpt,
    coverUrl: row.coverUrl,
    address: row.address,
    pricingUnit: row.pricingUnit as ProductDto["pricingUnit"],
    startingPrice: row.rates[0] ? Number(row.rates[0].price) : 0,
    organization: row.organization,
    category: row.category,
  }));

  if (isPriceSort) {
    cards = cards.sort((a, b) => (sortOrder === "asc" ? a.startingPrice - b.startingPrice : b.startingPrice - a.startingPrice));
  }

  const totalPages = Math.ceil(totalItems / limit) || 1;
  return {
    data: cards,
    meta: { page, limit, totalItems, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 },
  };
}

export async function getPublicProductBySlug(slug: string) {
  const applicationId = await getLapakAppId();
  const row = await prisma.lapakProduct.findFirst({
    where: { slug, applicationId, deletedAt: null, status: "PUBLISHED" },
    include: {
      organization: { select: { code: true, name: true } },
      category: { select: { name: true, slug: true } },
      rates: { where: PUBLIC_RATE_FILTER, orderBy: { price: "asc" } },
      addons: { where: { deletedAt: null, isActive: true }, orderBy: { name: "asc" } },
      requirements: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" } },
      facilities: { where: { deletedAt: null }, orderBy: { name: "asc" } },
      images: { where: { deletedAt: null }, orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] },
    },
  });
  if (!row) throw new NotFoundError(`Produk dengan slug '${slug}'`);

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    excerpt: row.excerpt,
    description: row.description,
    address: row.address,
    latitude: dec(row.latitude),
    longitude: dec(row.longitude),
    capacity: row.capacity,
    areaM2: row.areaM2,
    pricingUnit: row.pricingUnit as ProductDto["pricingUnit"],
    availabilityType: row.availabilityType as ProductDto["availabilityType"],
    fulfillmentType: row.fulfillmentType as ProductDto["fulfillmentType"],
    coverUrl: row.coverUrl,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    organization: row.organization,
    category: row.category,
    rates: row.rates.map((r) => ({
      id: r.id, name: r.name,
      unit: r.unit as ProductDto["rates"][number]["unit"],
      price: Number(r.price), minQty: r.minQty, maxQty: r.maxQty,
      startTime: r.startTime, endTime: r.endTime,
    })),
    addons: row.addons.map((a) => ({
      id: a.id, name: a.name,
      unit: a.unit as ProductDto["addons"][number]["unit"],
      price: Number(a.price),
    })),
    requirements: row.requirements.map((q) => ({
      id: q.id, label: q.label,
      fieldType: q.fieldType as ProductDto["requirements"][number]["fieldType"],
      options: (q.options as string[] | null) ?? null,
      isRequired: q.isRequired, sortOrder: q.sortOrder,
    })),
    facilities: row.facilities.map((f) => ({ id: f.id, name: f.name, icon: f.icon })),
    images: row.images.map((i) => ({
      id: i.id, url: i.url, altText: i.altText, isPrimary: i.isPrimary, sortOrder: i.sortOrder,
    })),
  };
}
