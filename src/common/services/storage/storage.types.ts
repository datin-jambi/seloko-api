/**
 * storage.types.ts — Definisi tipe untuk antarmuka penyimpanan terpusat SELOKO.
 */

export interface UploadFileOptions {
  /**
   * Berkas binary (Buffer), base64 string, atau URL publik yang dapat diunduh oleh provider.
   */
  file: Buffer | string;

  /**
   * Nama berkas tujuan, termasuk ekstensi (mis. 'hero-banner.jpg', 'perda-pajak-2026.pdf').
   */
  fileName: string;

  /**
   * Kode aplikasi pemilik berkas (mis. 'bapenda-profile', 'seloko', 'lapak-jambi-web').
   */
  appCode: string;

  /**
   * Nama modul yang mengunggah berkas (mis. 'articles', 'banners', 'galleries', 'regulations').
   */
  module: string;

  /**
   * Sub-folder opsional di dalam modul (mis. 'thumbnails', 'attachments', 'covers').
   */
  subFolder?: string;

  /**
   * Tag pencarian atau kategorisasi di ImageKit dashboard.
   */
  tags?: string[];

  /**
   * Menandai apakah file berstatus private (ImageKit signed URL only).
   */
  isPrivateFile?: boolean;

  /**
   * Menentukan apakah ImageKit menambahkan karakter acak di nama file.
   * Default: true. Jika false, menggunakan persis nama fileName yang diberikan.
   */
  useUniqueFileName?: boolean;
}

export interface UploadFileResult {
  /**
   * ID unik berkas di ImageKit — WAJIB disimpan di DB untuk kebutuhan penghapusan (cleanup).
   */
  fileId: string;

  /**
   * URL publik berkas CDN.
   */
  url: string;

  /**
   * Nama berkas yang tersimpan.
   */
  name: string;

  /**
   * Ukuran berkas dalam bytes.
   */
  size: number;

  /**
   * Path folder lengkap di penyimpanan (mis. '/bapenda-profile/articles/thumbnails/').
   */
  filePath: string;

  /**
   * URL thumbnail bawaan ImageKit (jika berkas berupa gambar).
   */
  thumbnailUrl?: string;
}

export interface ImageKitAuthParams {
  token: string;
  expire: number;
  signature: string;
}

export interface FileDetailsResult {
  fileId: string;
  name: string;
  filePath: string;
  url: string;
  fileType: string;
  size: number;
  height?: number;
  width?: number;
  thumbnailUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}
