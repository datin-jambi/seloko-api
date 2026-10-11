import type { UploadOptions } from "imagekit/dist/libs/interfaces/index.js";
import { imagekit, isImageKitConfigured } from "../../../config/imagekit.js";
import { AppError, HttpStatus } from "../../errors/index.js";
import type {
  UploadFileOptions,
  UploadFileResult,
  ImageKitAuthParams,
  FileDetailsResult,
} from "./storage.types.js";

/**
 * imagekit.service.ts — Layanan penyimpanan dan manajemen berkas terpusat ImageKit.
 *
 * Mengimplementasikan pengelompokan folder dinamis per aplikasi & modul:
 *   Format: /{appCode}/{module}/{subFolder}
 *   Contoh: /bapenda-profile/articles/foto-kegiatan.jpg
 */
export class ImageKitService {
  /**
   * Membangun format direktori folder terisolasi per aplikasi & modul.
   */
  public static buildFolderPath(
    appCode: string,
    module: string,
    subFolder?: string,
  ): string {
    const sanitize = (val: string) =>
      val
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-_]/g, "-")
        .replace(/-+/g, "-");

    const cleanApp = sanitize(appCode);
    const cleanModule = sanitize(module);

    if (subFolder) {
      const cleanSub = sanitize(subFolder);
      return `/${cleanApp}/${cleanModule}/${cleanSub}`;
    }

    return `/${cleanApp}/${cleanModule}`;
  }

  /**
   * Mengunggah berkas (Buffer, Base64, atau URL publik) ke ImageKit.
   */
  public static async uploadFile(
    options: UploadFileOptions,
  ): Promise<UploadFileResult> {
    if (!isImageKitConfigured()) {
      throw new AppError(
        "Layanan penyimpanan ImageKit belum dikonfigurasi di environment (.env)",
        HttpStatus.INTERNAL_SERVER_ERROR,
        "STORAGE_UNCONFIGURED",
      );
    }

    const folder = this.buildFolderPath(
      options.appCode,
      options.module,
      options.subFolder,
    );

    const uploadPayload: UploadOptions = {
      file: options.file,
      fileName: options.fileName,
      folder,
      useUniqueFileName: options.useUniqueFileName ?? true,
      ...(options.tags ? { tags: options.tags } : {}),
      ...(options.isPrivateFile !== undefined
        ? { isPrivateFile: options.isPrivateFile }
        : {}),
    };

    try {
      const response = await imagekit.upload(uploadPayload);

      // Generate clean public thumbnail URL using standard dynamic transformation
      // (Menghindari named transformation 'tr:n-ik_ml_thumbnail' ImageKit yang diblokir oleh security policy)
      let thumbnailUrl: string | undefined = undefined;
      const isImage = Boolean(response.filePath.match(/\.(jpe?g|png|webp|gif|svg)$/i));
      if (isImage) {
        thumbnailUrl = imagekit.url({
          path: response.filePath,
          transformation: [{ width: 300, height: 300 }],
        });
      } else if (response.thumbnailUrl) {
        thumbnailUrl = response.thumbnailUrl;
      }

      return {
        fileId: response.fileId,
        url: response.url,
        name: response.name,
        size: response.size,
        filePath: response.filePath,
        ...(thumbnailUrl ? { thumbnailUrl } : {}),
      };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Gagal mengunggah berkas ke ImageKit";
      console.error("[ImageKitService] Upload error:", err);
      throw new AppError(message, HttpStatus.BAD_GATEWAY, "STORAGE_UPLOAD_FAILED");
    }
  }

  /**
   * Menghapus berkas dari ImageKit berdasarkan fileId (untuk auto-cleanup saat record dihapus/di-update).
   */
  public static async deleteFile(fileId: string): Promise<boolean> {
    if (!fileId || !fileId.trim()) {
      return false;
    }

    if (!isImageKitConfigured()) {
      console.warn(
        `[ImageKitService] Lewati deleteFile(${fileId}): ImageKit belum dikonfigurasi.`,
      );
      return false;
    }

    try {
      await imagekit.deleteFile(fileId);
      return true;
    } catch (err: unknown) {
      // Jika file memang sudah tidak ada di ImageKit, jangan lempar fatal error — log peringatan saja
      console.warn(
        `[ImageKitService] Gagal menghapus berkas fileId: ${fileId}`,
        err instanceof Error ? err.message : err,
      );
      return false;
    }
  }

  /**
   * Mengambil detail dan metadata berkas dari ImageKit berdasarkan fileId.
   */
  public static async getFileDetails(
    fileId: string,
  ): Promise<FileDetailsResult | null> {
    if (!fileId || !fileId.trim()) {
      return null;
    }

    if (!isImageKitConfigured()) {
      throw new AppError(
        "Layanan penyimpanan ImageKit belum dikonfigurasi di environment (.env)",
        HttpStatus.INTERNAL_SERVER_ERROR,
        "STORAGE_UNCONFIGURED",
      );
    }

    try {
      const response = await imagekit.getFileDetails(fileId.trim());
      if (!response) {
        return null;
      }

      let thumbnailUrl = response.thumbnail;
      const isImage = Boolean(
        response.filePath?.match(/\.(jpe?g|png|webp|gif|svg)$/i),
      );
      if (isImage && response.filePath) {
        thumbnailUrl = imagekit.url({
          path: response.filePath,
          transformation: [{ width: 300, height: 300 }],
        });
      }

      const result: FileDetailsResult = {
        fileId: response.fileId,
        name: response.name,
        filePath: response.filePath,
        url: response.url,
        fileType: response.fileType,
        size: response.size,
      };

      if (response.height !== undefined && response.height !== null) {
        result.height = response.height;
      }
      if (response.width !== undefined && response.width !== null) {
        result.width = response.width;
      }
      if (thumbnailUrl) {
        result.thumbnailUrl = thumbnailUrl;
      }
      if (response.createdAt) {
        result.createdAt = String(response.createdAt);
      }
      if (response.updatedAt) {
        result.updatedAt = String(response.updatedAt);
      }

      return result;
    } catch (err: unknown) {
      const errObj = err as { status?: number; statusCode?: number; message?: string };
      if (
        errObj.status === 404 ||
        errObj.statusCode === 404 ||
        errObj.message?.toLowerCase().includes("not found")
      ) {
        return null;
      }
      console.warn(
        `[ImageKitService] Gagal memeriksa detail berkas fileId: ${fileId}:`,
        err instanceof Error ? err.message : err,
      );
      return null;
    }
  }

  /**
   * Menghasilkan authentication parameters untuk client-side upload langsung dari front-end.
   */
  public static getAuthenticationParameters(
    token?: string,
    expire?: number,
  ): ImageKitAuthParams {
    if (!isImageKitConfigured()) {
      throw new AppError(
        "Layanan penyimpanan ImageKit belum dikonfigurasi",
        HttpStatus.INTERNAL_SERVER_ERROR,
        "STORAGE_UNCONFIGURED",
      );
    }

    return imagekit.getAuthenticationParameters(token, expire);
  }
}
