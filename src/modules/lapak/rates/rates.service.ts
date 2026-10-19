import { prisma } from "~/config/database.js";
import { NotFoundError, BadRequestError, ForbiddenError, ConflictError } from "~/common/errors/index.js";
import { APP_CODES } from "~/common/constants/index.js";
import type { ContentStatus } from "@prisma/client";
import type {
  ListRatesQuery,
  CreateRateBody,
  UpdateRateBody,
  RateActionParams,
  RateDto,
} from "./rates.schema.js";

// ─── Konteks ──────────────────────────────────────────────────────────────────
async function getLapakAppId(): Promise<string> {
  const app = await prisma.application.findUniqueOrThrow({
    where: { code: APP_CODES.LAPAK_JAMBI_WEB },
    select: { id: true },
  });
  return app.id;
}

/**
 * Lingkup OPD user pada aplikasi Lapak (prinsip sama dengan products.service).
 * null = Bapenda / superadmin (semua OPD).
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
  // PRD 04 §B: penugasan TANPA baris lingkup = semua OPD (level Bapenda).
  return scopes.length === 0 ? null : [...new Set(scopes.map((s) => s.organizationId))];
}

function assertInScope(organizationId: string, scope: string[] | null): void {
  if (scope !== null && !scope.includes(organizationId)) {
    throw new ForbiddenError("Produk ini di luar lingkup OPD Anda");
  }
}

const RATE_INCLUDE = {
  product: {
    select: { id: true, organizationId: true, status: true, slug: true, name: true },
  },
} as const;

/** `any` di sini: Decimal Prisma sulit dianotasi tanpa mengimpor namespace
 * runtime; bentuknya sudah dikunci oleh RateShape (Zod) di schema. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toDto(row: any): RateDto {
  return {
    id: row.id,
    productId: row.productId,
    name: row.name,
    unit: row.unit as RateDto["unit"],
    price: Number(row.price),
    minQty: row.minQty,
    maxQty: row.maxQty,
    startTime: row.startTime,
    endTime: row.endTime,
    status: row.status,
    effectiveFrom: new Date(row.effectiveFrom).toISOString(),
    isActive: row.isActive,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

function num(value: any): number {
  return Number(value);
}

// ─── Mesin transisi tarif (subset dari produk: tanpa publish/unpublish) ──────
const RATE_TRANSITIONS = {
  submit: { from: ["DRAFT", "REJECTED"], to: "PENDING_REVIEW", permission: null },
  approve: { from: ["PENDING_REVIEW"], to: "APPROVED", permission: "approve" },
  reject: { from: ["PENDING_REVIEW"], to: "REJECTED", permission: "reject" },
} as const;

type RateAction = keyof typeof RATE_TRANSITIONS;

export function requiredRatePermission(action: RateAction): "approve" | "reject" | null {
  return RATE_TRANSITIONS[action].permission;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function getRateOr404(id: string) {
  const applicationId = await getLapakAppId();
  const row = await prisma.lapakProductRate.findFirst({
    where: { id, deletedAt: null, product: { applicationId, deletedAt: null } },
    include: RATE_INCLUDE,
  });
  if (!row) throw new NotFoundError("Tarif", id);
  return row;
}

/**
 * Tarif BARU yang dibuat langsung pada produk terbit memakai status produk
 * sebagai acuan awal: produk PUBLISHED → tarif lahir PENDING_REVIEW (butuh
 * setuju); produk DRAFT → tarif lahir DRAFT. Inilah kunci PRD 04 §C:
 * mengubah tarif produk terbit tidak menurunkan produk.
 */
function initialRateStatus(productStatus: ContentStatus): ContentStatus {
  return productStatus === "PUBLISHED" ? "PENDING_REVIEW" : "DRAFT";
}

// ─── Queries ──────────────────────────────────────────────────────────────────
export async function listRates(query: ListRatesQuery, scope: string[] | null) {
  const { productId, status, page, limit } = query;
  const applicationId = await getLapakAppId();
  const skip = (page - 1) * limit;

  const where = {
    deletedAt: null,
    ...(status && { status }),
    ...(productId && { productId }),
    product: {
      applicationId,
      deletedAt: null,
      ...(scope !== null && { organizationId: { in: scope } }),
    },
  };

  const [totalItems, rows] = await Promise.all([
    prisma.lapakProductRate.count({ where }),
    prisma.lapakProductRate.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
      include: RATE_INCLUDE,
    }),
  ]);

  const totalPages = Math.ceil(totalItems / limit) || 1;
  return {
    data: rows.map(toDto),
    meta: { page, limit, totalItems, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 },
  };
}

export async function getRateById(id: string, scope: string[] | null) {
  const row = await getRateOr404(id);
  assertInScope(row.product.organizationId, scope);
  return toDto(row);
}

// ─── Mutations ────────────────────────────────────────────────────────────────
export async function createRate(productId: string, body: CreateRateBody, scope: string[] | null) {
  const applicationId = await getLapakAppId();
  const product = await prisma.lapakProduct.findFirst({
    where: { id: productId, applicationId, deletedAt: null },
    select: { id: true, organizationId: true, status: true },
  });
  if (!product) throw new NotFoundError("Produk", productId);
  assertInScope(product.organizationId, scope);

  const row = await prisma.lapakProductRate.create({
    data: {
      productId,
      name: body.name,
      unit: body.unit,
      price: body.price,
      minQty: body.minQty,
      maxQty: body.maxQty ?? null,
      startTime: body.startTime ?? null,
      endTime: body.endTime ?? null,
      status: initialRateStatus(product.status),
      effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : new Date(),
      isActive: body.isActive,
    },
    include: RATE_INCLUDE,
  });
  return toDto(row);
}

/**
 * Edit tarif. Aturan PRD 04 §C:
 * - Tarif APPROVED/PUBLISHED TIDAK boleh diedit langsung — buat tarif baru
 *   (salin lama + harga baru) yang lahir sesuai status produk. Riwayat harga
 *   tetap utuh dan pesanan lama tak pernah kehilangan acuan.
 * - Tarif DRAFT/REJECTED/PENDING_REVIEW boleh diedit pemiliknya.
 */
export async function updateRate(id: string, body: UpdateRateBody, scope: string[] | null) {
  const existing = await getRateOr404(id);
  assertInScope(existing.product.organizationId, scope);

  if (["APPROVED", "PUBLISHED"].includes(existing.status)) {
    throw new ConflictError(
      "Tarif yang sudah disetujui tidak dapat diubah — buat tarif baru untuk revisi harga",
    );
  }

  const row = await prisma.lapakProductRate.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.unit !== undefined && { unit: body.unit }),
      ...(body.price !== undefined && { price: body.price }),
      ...(body.minQty !== undefined && { minQty: body.minQty }),
      ...(body.maxQty !== undefined && { maxQty: body.maxQty ?? null }),
      ...(body.startTime !== undefined && { startTime: body.startTime ?? null }),
      ...(body.endTime !== undefined && { endTime: body.endTime ?? null }),
      ...(body.effectiveFrom !== undefined && {
        effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : new Date(),
      }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
    },
    include: RATE_INCLUDE,
  });
  return toDto(row);
}

/** Revisi tarif ter-approve: salin → tarif baru ber-status sesuai produk. */
export async function reviseRate(id: string, body: UpdateRateBody, scope: string[] | null) {
  const existing = await getRateOr404(id);
  assertInScope(existing.product.organizationId, scope);

  if (!["APPROVED", "PUBLISHED"].includes(existing.status)) {
    throw new BadRequestError("Hanya tarif APPROVED/PUBLISHED yang direvisi lewat endpoint ini");
  }

  const product = await prisma.lapakProduct.findUniqueOrThrow({
    where: { id: existing.productId },
    select: { status: true },
  });

  // Baris lama TETAP aktif selama revisi berjalan: publik harus terus
  // melihat harga lama sampai revisi disetujui (PRD 04 §C — produk tidak
  // boleh kehilangan tarif hanya karena sedang direvisi). Penonaktifan
  // dilakukan di patchRateStatus saat transisi approve/reject selesai.
  const data = {
    name: body.name ?? existing.name,
    unit: body.unit ?? existing.unit,
    price: body.price ?? num(existing.price),
    minQty: body.minQty ?? existing.minQty,
    maxQty: body.maxQty !== undefined ? body.maxQty : existing.maxQty,
    startTime: body.startTime !== undefined ? body.startTime : existing.startTime,
    endTime: body.endTime !== undefined ? body.endTime : existing.endTime,
    isActive: body.isActive ?? existing.isActive,
  };

  const created = await prisma.lapakProductRate.create({
    data: {
      productId: existing.productId,
      ...data,
      status: initialRateStatus(product.status),
      effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : new Date(),
    },
    include: RATE_INCLUDE,
  });
  return toDto(created);
}

// ─── Transisi status ──────────────────────────────────────────────────────────
export async function patchRateStatus(
  params: RateActionParams,
  scope: string[] | null,
  permissions: string[],
  note?: string,
) {
  const existing = await getRateOr404(params.id);
  assertInScope(existing.product.organizationId, scope);

  const action = params.action as RateAction;
  const rule = RATE_TRANSITIONS[action] as {
    from: readonly string[];
    to: ContentStatus;
    permission: "approve" | "reject" | null;
  };

  if (!rule.from.includes(existing.status)) {
    throw new BadRequestError(`Aksi '${action}' tidak sah dari status ${existing.status}`);
  }

  if (rule.permission && !permissions.includes(`product:${rule.permission}`)) {
    throw new ForbiddenError(`Butuh izin product:${rule.permission} untuk aksi ini`);
  }

  if (action === "reject" && !note) {
    throw new BadRequestError("Alasan penolakan (note) wajib diisi");
  }

  // Saat revisi (baris turunan) DISSETUJUI: baris asal yang dinonaktifkan
  // supaya publik beralih dari harga lama ke harga baru tanpa jeda. Baris
  // asal ditelusuri lewat productId yang sama dengan harga/nilai sebelum
  // revisi — ditandai lewat kolom isActive dan status APPROVED/PUBLISHED.
  // Penonaktifan hanya untuk baris revisi yang punya asal (bukan tarif biasa).
  if (action === "approve" && existing.status === "PENDING_REVIEW") {
    const originRate = await prisma.lapakProductRate.findFirst({
      where: {
        productId: existing.productId,
        deletedAt: null,
        isActive: true,
        status: { in: ["APPROVED", "PUBLISHED"] as ContentStatus[] },
        id: { not: existing.id },
        // Asal revisi: tarif lain pada produk yang sama dengan nilai yang
        // sama pada seluruh field warisan revise (menandai pasangan revisi).
        name: existing.name,
        unit: existing.unit,
      },
      orderBy: { createdAt: "asc" },
    });
    if (originRate) {
      await prisma.lapakProductRate.update({
        where: { id: originRate.id },
        data: { isActive: false },
      });
    }
  }
  const row = await prisma.lapakProductRate.update({
    where: { id: existing.id },
    data: { status: rule.to },
    include: RATE_INCLUDE,
  });
  return toDto(row);
}

/** Nonaktifkan tarif (menyembunyikan dari publik tanpa menghapus riwayat). */
export async function deactivateRate(id: string, scope: string[] | null) {
  const existing = await getRateOr404(id);
  assertInScope(existing.product.organizationId, scope);

  const activeCount = await prisma.lapakProductRate.count({
    where: {
      productId: existing.productId,
      deletedAt: null,
      isActive: true,
      id: { not: id },
      status: { in: ["APPROVED", "PUBLISHED"] },
      effectiveFrom: { lte: new Date() },
    },
  });
  if (activeCount === 0) {
    throw new ConflictError(
      "Tarif terakhir yang aktif tidak boleh dinonaktifkan — produk akan tanpa harga",
    );
  }

  const row = await prisma.lapakProductRate.update({
    where: { id },
    data: { isActive: false },
    include: RATE_INCLUDE,
  });
  return toDto(row);
}

export async function deleteRate(id: string, scope: string[] | null) {
  const existing = await getRateOr404(id);
  assertInScope(existing.product.organizationId, scope);

  if (["APPROVED", "PUBLISHED"].includes(existing.status) && existing.isActive) {
    throw new ConflictError(
      "Tarif aktif yang ter-approve tidak dapat dihapus — nonaktifkan dahulu atau buat penggantinya",
    );
  }

  await prisma.lapakProductRate.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  return { id, deleted: true };
}


