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
 * Konfigurasi batas toleransi dimensi & ukuran berkas Banner.
 * Dibuat fleksibel (toleran) agar ramah berbagai variasi resolusi dari tim kreatif.
 */
export const BANNER_IMAGE_RULES = {
  desktop: {
    maxSizeBytes: 3 * 1024 * 1024, // Maks 3 MB
    minWidth: 800,                 // Min lebar 800px (agar tidak pecah di monitor)
    maxWidth: 3840,                // Maks lebar 4K
    minHeight: 250,                // Min tinggi 250px
    maxHeight: 2160,               // Maks tinggi 2160px
  },
  mobile: {
    maxSizeBytes: 1.5 * 1024 * 1024, // Maks 1.5 MB (ringan untuk jaringan HP warga)
    minWidth: 360,                   // Min lebar 360px
    maxWidth: 1600,                  // Maks lebar 1600px
    minHeight: 300,                  // Min tinggi 300px
    maxHeight: 2400,                 // Maks tinggi 2400px
  },
} as const;

/**
 * Memvalidasi berkas gambar Desktop di ImageKit dengan toleransi dimensi & ukuran.
 */
async function validateDesktopBannerImage(fileId?: string | null): Promise<void> {
  if (!fileId || !fileId.trim()) return;

  const file = await ImageKitService.getFileDetails(fileId);
  if (!file) {
    throw new BadRequestError(
      `Berkas gambar desktop (ID: '${fileId}') tidak ditemukan di ImageKit. Pastikan berkas valid sebelum mengaktifkan banner.`,
    );
  }

  // 1. Validasi ukuran berkas
  if (file.size > BANNER_IMAGE_RULES.desktop.maxSizeBytes) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
    throw new BadRequestError(
      `Ukuran gambar desktop terlalu besar (${sizeMb} MB). Maksimal yang diizinkan adalah 3 MB.`,
    );
  }

  // 2. Validasi orientasi landscape & lebar minimal jika metadata dimensi tersedia
  if (file.width !== undefined && file.height !== undefined) {
    if (file.width < file.height) {
      throw new BadRequestError(
        `Gambar desktop harus berorientasi landscape/horizontal (lebar >= tinggi). Dimensi terdeteksi: ${file.width}x${file.height} px.`,
      );
    }
    if (file.width < BANNER_IMAGE_RULES.desktop.minWidth) {
      throw new BadRequestError(
        `Lebar gambar desktop terlalu kecil (${file.width} px). Minimal lebar adalah ${BANNER_IMAGE_RULES.desktop.minWidth} px agar tidak pecah di layar laptop/PC.`,
      );
    }
  }
}

/**
 * Memvalidasi berkas gambar Mobile di ImageKit dengan toleransi dimensi & ukuran.
 */
async function validateMobileBannerImage(fileId?: string | null): Promise<void> {
  if (!fileId || !fileId.trim()) return;

  const file = await ImageKitService.getFileDetails(fileId);
  if (!file) {
    throw new BadRequestError(
      `Berkas gambar mobile (ID: '${fileId}') tidak ditemukan di ImageKit. Pastikan berkas valid sebelum mengaktifkan banner.`,
    );
  }

  // 1. Validasi ukuran berkas
  if (file.size > BANNER_IMAGE_RULES.mobile.maxSizeBytes) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
    throw new BadRequestError(
      `Ukuran gambar mobile terlalu besar (${sizeMb} MB). Maksimal yang diizinkan adalah 1.5 MB agar cepat dimuat di ponsel warga.`,
    );
  }

  // 2. Validasi lebar minimal jika metadata dimensi tersedia
  if (file.width !== undefined && file.width < BANNER_IMAGE_RULES.mobile.minWidth) {
    throw new BadRequestError(
      `Lebar gambar mobile terlalu kecil (${file.width} px). Minimal lebar adalah ${BANNER_IMAGE_RULES.mobile.minWidth} px.`,
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
  // Jika banner dibuat langsung dengan status aktif, validasi gambar desktop & mobile di ImageKit
  if (body.isActive) {
    if (body.imageFileId) {
      await validateDesktopBannerImage(body.imageFileId);
    }
    if (body.mobileImageFileId) {
      await validateMobileBannerImage(body.mobileImageFileId);
    }
  }

  const applicationId = await getBapendaAppId();

  const data: Prisma.BannerCreateInput = {
    application: { connect: { id: applicationId } },
    title: body.title,
    description: body.description ?? null,
    imageUrl: body.imageUrl,
    imageFileId: body.imageFileId ?? null,
    mobileImageUrl: body.mobileImageUrl ?? null,
    mobileImageFileId: body.mobileImageFileId ?? null,
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
  const targetDesktopFileId =
    body.imageFileId !== undefined ? body.imageFileId : existing.imageFileId;
  const targetMobileFileId =
    body.mobileImageFileId !== undefined
      ? body.mobileImageFileId
      : existing.mobileImageFileId;

  // Jika banner berstatus aktif (atau diubah menjadi aktif), validasi berkas di ImageKit
  if (willBeActive) {
    if (
      targetDesktopFileId &&
      (body.isActive === true || body.imageFileId !== undefined)
    ) {
      await validateDesktopBannerImage(targetDesktopFileId);
    }
    if (
      targetMobileFileId &&
      (body.isActive === true || body.mobileImageFileId !== undefined)
    ) {
      await validateMobileBannerImage(targetMobileFileId);
    }
  }

  // Auto-cleanup ImageKit jika gambar desktop diganti dengan file baru
  if (
    existing.imageFileId &&
    body.imageFileId &&
    existing.imageFileId !== body.imageFileId
  ) {
    ImageKitService.deleteFile(existing.imageFileId).catch((err) => {
      console.error("[BannersService] Gagal menghapus file desktop lama di ImageKit:", err);
    });
  }

  // Auto-cleanup ImageKit jika gambar mobile diganti dengan file baru
  if (
    existing.mobileImageFileId &&
    body.mobileImageFileId &&
    existing.mobileImageFileId !== body.mobileImageFileId
  ) {
    ImageKitService.deleteFile(existing.mobileImageFileId).catch((err) => {
      console.error("[BannersService] Gagal menghapus file mobile lama di ImageKit:", err);
    });
  }

  const data: Prisma.BannerUpdateInput = {};

  if (body.title !== undefined) data.title = body.title;
  if (body.description !== undefined) data.description = body.description ?? null;
  if (body.imageUrl !== undefined) data.imageUrl = body.imageUrl;
  if (body.imageFileId !== undefined) data.imageFileId = body.imageFileId ?? null;
  if (body.mobileImageUrl !== undefined) data.mobileImageUrl = body.mobileImageUrl ?? null;
  if (body.mobileImageFileId !== undefined) data.mobileImageFileId = body.mobileImageFileId ?? null;
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

  if (isActive) {
    if (existing.imageFileId) {
      await validateDesktopBannerImage(existing.imageFileId);
    }
    if (existing.mobileImageFileId) {
      await validateMobileBannerImage(existing.mobileImageFileId);
    }
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
