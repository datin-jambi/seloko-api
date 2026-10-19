/**
 * regulations.service.ts — Regulasi & dokumen PDF portal Bapenda (PRD 02 §G).
 * Status cukup DRAFT/PUBLISHED; terbit lewat `PATCH /:id/status`.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "~/config/database.js";
import { APP_CODES } from "~/common/constants/index.js";
import { BadRequestError, ConflictError, NotFoundError } from "~/common/errors/index.js";
import { slugify } from "~/common/utils/index.js";
import { ImageKitService } from "~/common/services/storage/imagekit.service.js";
import type {
  CreateRegulationBody,
  ListRegulationsQuery,
  PublicListRegulationsQuery,
  UpdateRegulationBody,
} from "./regulations.schema.js";

/** Batas ukuran dokumen — regulasi bisa panjang, tetapi tetap perlu batas. */
export const REGULATION_FILE_RULES = { maxSizeBytes: 20 * 1024 * 1024 } as const;

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

async function resolveSlug(applicationId: string, title: string, requested?: string, excludeId?: string) {
  const base = slugify(requested || title);
  if (!base) throw new BadRequestError("Slug tidak dapat dibentuk dari judul");
  const taken = async (slug: string) =>
    (await prisma.regulation.count({
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

/**
 * Validasi berkas PDF di ImageKit — hanya saat dokumen akan tayang.
 *
 * Tanpa `fileId` (data lama hasil migrasi) pengecekan dilewati: berkas itu
 * sudah ada di ImageKit sejak aplikasi lama dan tidak punya ID yang tersimpan.
 * Menolak terbit hanya karena `fileId` kosong akan memblokir 4 dokumen lama
 * yang justru sudah tayang di portal sebelumnya.
 */
async function validatePdf(fileId: string | null | undefined, fileUrl: string): Promise<void> {
  const url = fileUrl.toLowerCase();
  if (!url.endsWith(".pdf") && !url.includes(".pdf?")) {
    throw new BadRequestError("Berkas regulasi harus berupa PDF (URL berakhiran .pdf)");
  }
  if (!fileId?.trim()) return;

  const file = await ImageKitService.getFileDetails(fileId);
  if (!file) {
    throw new BadRequestError(
      `Berkas (ID: '${fileId}') tidak ditemukan di ImageKit. Pastikan berkas sudah diunggah sebelum menerbitkan.`,
    );
  }
  if (file.size > REGULATION_FILE_RULES.maxSizeBytes) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
    throw new BadRequestError(
      `Ukuran dokumen terlalu besar (${sizeMb} MB). Maksimal ${REGULATION_FILE_RULES.maxSizeBytes / (1024 * 1024)} MB.`,
    );
  }
}

/**
 * Hapus berkas lama secara asinkron, hanya bila ada `fileId`.
 * Data hasil migrasi tidak punya `fileId`, jadi tidak ada yang bisa dihapus.
 */
function cleanupFile(fileId: string | null | undefined): void {
  if (!fileId) return;
  ImageKitService.deleteFile(fileId).catch((err) => {
    console.error(`[RegulationsService] Gagal menghapus file ImageKit (${fileId}):`, err);
  });
}

async function findRegulation(id: string) {
  const applicationId = await getAppId();
  const found = await prisma.regulation.findFirst({ where: { id, applicationId, deletedAt: null } });
  if (!found) throw new NotFoundError("Regulasi");
  return { regulation: found, applicationId };
}

// ─── Publik ───────────────────────────────────────────────────────────────────
export async function listPublicRegulations(query: PublicListRegulationsQuery) {
  const applicationId = await getAppId();
  const { page, limit, search } = query;
  const where: Prisma.RegulationWhereInput = {
    applicationId,
    status: "PUBLISHED",
    deletedAt: null,
    ...(search && {
      OR: [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ],
    }),
  };
  const [totalItems, data] = await Promise.all([
    prisma.regulation.count({ where }),
    prisma.regulation.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    }),
  ]);
  return { data, meta: paginate(page, limit, totalItems) };
}

export async function getPublicRegulationBySlug(slug: string) {
  const applicationId = await getAppId();
  const found = await prisma.regulation.findFirst({
    where: { applicationId, slug, status: "PUBLISHED", deletedAt: null },
  });
  if (!found) throw new NotFoundError("Regulasi");
  return found;
}

// ─── CMS ──────────────────────────────────────────────────────────────────────
export async function listRegulations(query: ListRegulationsQuery) {
  const applicationId = await getAppId();
  const { page, limit, search, status, sortBy, sortOrder } = query;
  const where: Prisma.RegulationWhereInput = {
    applicationId,
    deletedAt: null,
    ...(status && { status }),
    ...(search && {
      OR: [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ],
    }),
  };
  const [totalItems, data] = await Promise.all([
    prisma.regulation.count({ where }),
    prisma.regulation.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
    }),
  ]);
  return { data, meta: paginate(page, limit, totalItems) };
}

export async function getRegulationById(id: string) {
  return (await findRegulation(id)).regulation;
}

export async function createRegulation(body: CreateRegulationBody) {
  const applicationId = await getAppId();
  const slug = await resolveSlug(applicationId, body.title, body.slug);
  return prisma.regulation.create({
    data: {
      applicationId,
      title: body.title,
      slug,
      description: body.description ?? null,
      fileUrl: body.fileUrl,
      fileId: body.fileId ?? null,
      fileName: body.fileName ?? null,
      fileSize: body.fileSize ?? null,
      status: "DRAFT",
    },
  });
}

export async function updateRegulation(id: string, body: UpdateRegulationBody) {
  const { regulation, applicationId } = await findRegulation(id);

  const newFileId = body.fileId !== undefined ? body.fileId : regulation.fileId;
  const newFileUrl = body.fileUrl ?? regulation.fileUrl;
  // Dokumen yang sudah tayang: berkas pengganti harus sahih sebelum ditayangkan.
  if (regulation.status === "PUBLISHED" && (body.fileId !== undefined || body.fileUrl !== undefined)) {
    await validatePdf(newFileId, newFileUrl);
  }

  const data: Prisma.RegulationUncheckedUpdateInput = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.slug !== undefined) {
    data.slug = await resolveSlug(applicationId, body.title ?? regulation.title, body.slug, id);
  }
  if (body.description !== undefined) data.description = body.description ?? null;
  if (body.fileUrl !== undefined) data.fileUrl = body.fileUrl;
  if (body.fileId !== undefined) data.fileId = body.fileId ?? null;
  if (body.fileName !== undefined) data.fileName = body.fileName ?? null;
  if (body.fileSize !== undefined) data.fileSize = body.fileSize ?? null;

  const updated = await prisma.regulation.update({ where: { id }, data });
  // Hapus berkas lama SETELAH DB tersimpan — bila update gagal, berkas tetap ada.
  if (regulation.fileId && regulation.fileId !== newFileId) cleanupFile(regulation.fileId);
  return updated;
}

export async function setRegulationStatus(id: string, status: "DRAFT" | "PUBLISHED") {
  const { regulation } = await findRegulation(id);
  if (regulation.status === status) return regulation;

  if (status === "PUBLISHED") {
    await validatePdf(regulation.fileId, regulation.fileUrl);
  }

  return prisma.regulation.update({
    where: { id },
    data: { status, publishedAt: status === "PUBLISHED" ? new Date() : null },
  });
}

export async function deleteRegulation(id: string) {
  const { regulation } = await findRegulation(id);
  await prisma.regulation.update({ where: { id }, data: { deletedAt: new Date() } });
  cleanupFile(regulation.fileId);
  return { id, deleted: true };
}
