import path from "node:path";
import crypto from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ImageKitService } from "~/common/services/storage/imagekit.service.js";
import { AppError, BadRequestError, HttpStatus } from "~/common/errors/index.js";
import type { UploadFileResult } from "~/common/services/storage/storage.types.js";
import type {
  UploadMediaQuery,
  DeleteMediaParams,
} from "./storage.schema.js";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

interface UploadedFileBuffer {
  originalFilename: string;
  mimetype: string;
  buffer: Buffer;
  truncated: boolean;
}

/**
 * Menghasilkan nama berkas yang bersih, terstruktur, dan unik berbasis modul/submodul, timestamp, dan hash acak.
 * Contoh:
 *   - banners_homepage_20261011_041022_a3f19c2b.png
 *   - hero-promo_20261011_041022_a3f19c2b.png
 */
function generateStorageFileName(params: {
  originalFilename: string;
  module: string;
  subFolder?: string | undefined;
  customPrefix?: string | undefined;
  index?: number | undefined;
}): string {
  const origExt = (path.extname(params.originalFilename) || "").toLowerCase();

  let prefix = "";
  if (params.customPrefix && params.customPrefix.trim()) {
    prefix = params.customPrefix
      .trim()
      .toLowerCase()
      .replace(new RegExp(`\\${origExt}$`), "")
      .replace(/[^a-z0-9_-]/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 50);
  } else {
    const cleanMod = params.module.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    const cleanSub = params.subFolder
      ? params.subFolder.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "")
      : "";
    prefix = cleanSub ? `${cleanMod}_${cleanSub}` : cleanMod;
  }

  if (params.index !== undefined && params.index > 0) {
    prefix = `${prefix}-${params.index}`;
  }

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const timeStr = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const randomHash = crypto.randomBytes(4).toString("hex");

  return `${prefix}_${dateStr}_${timeStr}_${randomHash}${origExt}`;
}

export async function handleUploadMedia(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!request.isMultipart()) {
    throw new BadRequestError("Content-Type request harus berupa multipart/form-data");
  }

  const query = (request.query || {}) as UploadMediaQuery;
  const fields: Record<string, string> = {};
  const uploadedFiles: UploadedFileBuffer[] = [];

  try {
    const parts = request.parts();

    for await (const part of parts) {
      if (part.type === "file") {
        const buffer = await part.toBuffer();
        const isTruncated = Boolean((part.file as { truncated?: boolean }).truncated);

        uploadedFiles.push({
          originalFilename: part.filename,
          mimetype: part.mimetype,
          buffer,
          truncated: isTruncated,
        });
      } else {
        // Text field
        if (typeof part.value === "string") {
          fields[part.fieldname] = part.value;
        }
      }
    }
  } catch (err: unknown) {
    if (err instanceof AppError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    if ((err as { code?: string })?.code === "FST_REQ_FILE_TOO_LARGE") {
      throw new BadRequestError("Ukuran salah satu berkas melebihi batas maksimal 50MB");
    }
    throw new BadRequestError(`Gagal membaca berkas multipart: ${msg}`);
  }

  if (uploadedFiles.length === 0) {
    throw new BadRequestError("Tidak ada berkas yang diunggah. Pastikan menyertakan berkas pada form-data");
  }

  // 1. Validasi Truncation / Batas Ukuran File
  // Mencegah berkas yang terpotong diunggah dalam keadaan rusak ke ImageKit.
  for (const file of uploadedFiles) {
    if (file.truncated || file.buffer.length > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestError(
        `Berkas '${file.originalFilename}' melebihi batas ukuran maksimal (50MB). Berkas dibatalkan agar tidak rusak di ImageKit.`,
      );
    }
  }

  // 2. Validasi MIME Type
  for (const file of uploadedFiles) {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestError(
        `Format berkas '${file.originalFilename}' (${file.mimetype}) tidak didukung. Format yang diizinkan: JPG, PNG, WebP, GIF, SVG, PDF, DOC, DOCX.`,
      );
    }
  }

  // 3. Resolusi Parameter: Query string diprioritaskan, lalu form fields, lalu default context
  const targetApp = query.appCode || fields["appCode"] || request.appCode || "general";
  const targetModule = query.module || fields["module"] || "general";
  const targetSubFolder =
    query.subFolder ||
    query.subModule ||
    fields["subFolder"] ||
    fields["subModule"];

  // Custom nama file
  const customFileNameRaw =
    query.fileName ||
    fields["fileName"] ||
    fields["customFileName"] ||
    fields["name"];

  // Unique suffix option
  let useUniqueFileName: boolean | undefined = query.useUniqueFileName;
  if (useUniqueFileName === undefined && fields["useUniqueFileName"] !== undefined) {
    useUniqueFileName = fields["useUniqueFileName"] === "true";
  }

  // 4. Proses Upload ke ImageKit
  const results: UploadFileResult[] = [];

  for (let i = 0; i < uploadedFiles.length; i++) {
    const file = uploadedFiles[i]!;

    const finalFileName = generateStorageFileName({
      originalFilename: file.originalFilename,
      module: targetModule,
      subFolder: targetSubFolder,
      customPrefix: customFileNameRaw,
      index: uploadedFiles.length > 1 ? i + 1 : undefined,
    });

    const uploadRes = await ImageKitService.uploadFile({
      file: file.buffer,
      fileName: finalFileName,
      appCode: targetApp,
      module: targetModule,
      ...(targetSubFolder ? { subFolder: targetSubFolder } : {}),
      useUniqueFileName: useUniqueFileName ?? false,
    });

    results.push(uploadRes);
  }

  const isSingle = results.length === 1;

  return reply.status(HttpStatus.CREATED).send({
    statusCode: HttpStatus.CREATED,
    code: "SUCCESS",
    message: isSingle
      ? "Berkas berhasil diunggah ke ImageKit"
      : `${results.length} berkas berhasil diunggah ke ImageKit`,
    data: isSingle ? results[0] : results,
  });
}

export async function handleDeleteMedia(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { fileId } = request.params as DeleteMediaParams;
  const deleted = await ImageKitService.deleteFile(fileId);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: deleted
      ? "Berkas berhasil dihapus dari ImageKit"
      : "Berkas tidak ditemukan atau sudah pernah dihapus",
    data: { deleted },
  });
}
