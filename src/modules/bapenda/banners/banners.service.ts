import { prisma } from "~/config/database.js";
import { BadRequestError, NotFoundError } from "~/common/errors/index.js";
import { APP_CODES } from "~/common/constants/index.js";
import { ImageKitService } from "~/common/services/storage/imagekit.service.js";
import type { Prisma } from "@prisma/client";
import type {
  ListBannersQuery,
  CreateBannerBody,
  UpdateBannerBody,
} from "./banners.schema.js";

/** Resolusi ID aplikasi target (bapenda-profile) */
async function getBapendaAppId(): Promise<string> {
  const app = await prisma.application.findUniqueOrThrow({
    where: { code: APP_CODES.BAPENDA_PROFILE },
    select: { id: true },
  });
  return app.id;
}

/**
 * Memvalidasi apakah berkas gambar benar-benar ada di penyimpanan ImageKit.
 * Dipanggil secara kondisional saat banner dibuat atau diaktifkan (isActive = true).
 */
async function validateActiveBannerImage(imageFileId?: string | null): Promise<void> {
  if (!imageFileId || !imageFileId.trim()) {
    return;
  }

  const file = await ImageKitService.getFileDetails(imageFileId);
  if (!file) {
    throw new BadRequestError(
      `Berkas gambar dengan ID '${imageFileId}' tidak ditemukan di penyimpanan ImageKit. Pastikan berkas valid sebelum mengaktifkan banner.`,
    );
  }
}

/** Mengambil daftar banner aktif untuk portal publik / frontend */
export async function listPublicBanners(limit = 10) {
  const applicationId = await getBapendaAppId();

  return prisma.banner.findMany({
    where: {
      applicationId,
      isActive: true,
      deletedAt: null,
    },
    take: limit,
    orderBy: [
      { sortOrder: "asc" },
      { createdAt: "desc" },
    ],
  });
}

/** Mengambil daftar seluruh banner untuk CMS dengan pagination & filter */
export async function listBanners(query: ListBannersQuery) {
  const { page, limit, search, isActive, sortBy, sortOrder } = query;
  const skip = (page - 1) * limit;
  const applicationId = await getBapendaAppId();

  const where: Prisma.BannerWhereInput = {
    applicationId,
    deletedAt: null,
  };

  if (isActive !== undefined) {
    where.isActive = isActive;
  }

  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
    ];
  }

  const [totalItems, data] = await Promise.all([
    prisma.banner.count({ where }),
    prisma.banner.findMany({
      where,
      skip,
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

/** Mengambil detail satu data banner berdasarkan ID */
export async function getBannerById(id: string) {
  const banner = await prisma.banner.findFirst({
    where: { id, deletedAt: null },
  });

  if (!banner) {
    throw new NotFoundError("Banner tidak ditemukan");
  }

  return banner;
}

/** Menambahkan banner baru */
export async function createBanner(body: CreateBannerBody) {
  // Jika banner dibuat langsung dengan status aktif dan memiliki imageFileId, verifikasi fisik di ImageKit
  if (body.isActive && body.imageFileId) {
    await validateActiveBannerImage(body.imageFileId);
  }

  const applicationId = await getBapendaAppId();

  const data: Prisma.BannerCreateInput = {
    application: { connect: { id: applicationId } },
    title: body.title,
    description: body.description ?? null,
    imageUrl: body.imageUrl,
    imageFileId: body.imageFileId ?? null,
    buttonText: body.buttonText ?? null,
    buttonUrl: body.buttonUrl ?? null,
    sortOrder: body.sortOrder,
    isActive: body.isActive,
  };

  return prisma.banner.create({ data });
}

/** Memperbarui data banner */
export async function updateBanner(id: string, body: UpdateBannerBody) {
  const existing = await getBannerById(id);

  const willBeActive =
    body.isActive !== undefined ? body.isActive : existing.isActive;
  const targetImageFileId =
    body.imageFileId !== undefined ? body.imageFileId : existing.imageFileId;

  // Jika banner berstatus aktif (atau diubah menjadi aktif) dan ada fileId baru atau diaktifkan, verifikasi di ImageKit
  if (
    willBeActive &&
    targetImageFileId &&
    (body.isActive === true || body.imageFileId !== undefined)
  ) {
    await validateActiveBannerImage(targetImageFileId);
  }

  // Auto-cleanup ImageKit jika gambar diganti dengan file baru
  if (
    existing.imageFileId &&
    body.imageFileId &&
    existing.imageFileId !== body.imageFileId
  ) {
    ImageKitService.deleteFile(existing.imageFileId).catch((err) => {
      console.error("[BannersService] Gagal menghapus file lama di ImageKit:", err);
    });
  }

  const data: Prisma.BannerUpdateInput = {};

  if (body.title !== undefined) data.title = body.title;
  if (body.description !== undefined) data.description = body.description ?? null;
  if (body.imageUrl !== undefined) data.imageUrl = body.imageUrl;
  if (body.imageFileId !== undefined) data.imageFileId = body.imageFileId ?? null;
  if (body.buttonText !== undefined) data.buttonText = body.buttonText ?? null;
  if (body.buttonUrl !== undefined) data.buttonUrl = body.buttonUrl ?? null;
  if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;
  if (body.isActive !== undefined) data.isActive = body.isActive;

  return prisma.banner.update({
    where: { id },
    data,
  });
}

/** Toggle status aktif banner */
export async function setBannerActive(id: string, isActive: boolean) {
  const existing = await getBannerById(id);

  if (isActive && existing.imageFileId) {
    await validateActiveBannerImage(existing.imageFileId);
  }

  return prisma.banner.update({
    where: { id },
    data: { isActive },
  });
}

/** Reorder urutan sortOrder banner secara massal */
export async function reorderBanners(items: { id: string; sortOrder: number }[]) {
  await prisma.$transaction(
    items.map((item) =>
      prisma.banner.update({
        where: { id: item.id },
        data: { sortOrder: item.sortOrder },
      }),
    ),
  );

  return { success: true };
}

/** Menghapus banner (soft-delete) */
export async function deleteBanner(id: string) {
  const existing = await getBannerById(id);

  await prisma.banner.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  return { id: existing.id, deleted: true };
}
