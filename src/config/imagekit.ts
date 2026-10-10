import ImageKit from "imagekit";
import { env } from "./env.js";

/**
 * imagekit.ts — Inisialisasi ImageKit SDK Singleton.
 *
 * Digunakan untuk manajemen penyimpanan berkas terpusat (gambar, dokumen, PDF)
 * di seluruh modul super app SELOKO dan aplikasi satelit (misal: Bapenda Profile).
 */

declare global {
  // eslint-disable-next-line no-var
  var __imagekit: ImageKit | undefined;
}

export function isImageKitConfigured(): boolean {
  return Boolean(
    env.IMAGEKIT_PUBLIC_KEY &&
    env.IMAGEKIT_PRIVATE_KEY &&
    env.IMAGEKIT_URL_ENDPOINT
  );
}

function createImageKitInstance(): ImageKit {
  return new ImageKit({
    publicKey: env.IMAGEKIT_PUBLIC_KEY || "dummy_public_key",
    privateKey: env.IMAGEKIT_PRIVATE_KEY || "dummy_private_key",
    urlEndpoint: env.IMAGEKIT_URL_ENDPOINT || "https://ik.imagekit.io/dummy",
  });
}

export const imagekit: ImageKit =
  globalThis.__imagekit ?? createImageKitInstance();

if (env.NODE_ENV !== "production") {
  globalThis.__imagekit = imagekit;
}
