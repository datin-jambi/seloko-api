import { NotFoundError } from "~/common/errors/index.js";
import { APP_CODES } from "~/common/constants/index.js";
import type { ArticleScope } from "~/modules/shared/article/article.service.js";

/**
 * Konten OPD (LJ-4.1, PRD 04 §G).
 *
 * Berita/artikel/galeri/banner OPD memakai tabel universal yang sama dengan
 * Bapenda (`articles`, `galleries`, `banners`). Yang berbeda hanya SCOPE:
 * konten Lapak difilter `organizationId`, konten Bapenda tidak.
 *
 * Endpoint dibagi tiga kelompok:
 * - `/public/...` — tanpa login, hanya konten PUBLISHED milik OPD tertentu.
 * - `/me/...`     — admin OPD mengelola konten OPD-nya sendiri.
 * - `/cms/...`    — Bapenda melihat semua OPD (monitoring).
 *
 * Lingkup OPD SELALU dipaksa di server dari penugasan user, tidak pernah dari
 * parameter klien — kalau tidak, admin OPD bisa menyunting berita OPD lain.
 */

/** Kode aplikasi Lapak (pemilik data konten). */
export const LAPAK_APP = APP_CODES.LAPAK_JAMBI_WEB;

export const NEWS_SCOPE: ArticleScope = {
  appCode: LAPAK_APP,
  type: "NEWS",
  entity: "news",
  label: "Berita OPD",
};

export const ARTICLE_SCOPE: ArticleScope = {
  appCode: LAPAK_APP,
  type: "ARTICLE",
  entity: "article",
  label: "Artikel OPD",
};

/** Bangun scope yang terikat ke satu OPD. */
export function scopedTo(scope: ArticleScope, organizationId: string): ArticleScope {
  return { ...scope, organizationId };
}

/**
 * Pastikan admin hanya menyentuh OPD-nya sendiri.
 *
 * Dipakai setelah mengambil `organizationId` dari entitas yang disunting —
 * bukan dari request — sehingga klien tidak bisa memalsukannya.
 */
export function assertSameOrg(entityOrgId: string | null, userOrgIds: string[] | null): void {
  // null = superadmin/Bapenda: boleh semua.
  if (userOrgIds === null) return;
  if (!entityOrgId || !userOrgIds.includes(entityOrgId)) {
    // 404, bukan 403: keberadaan konten OPD lain tidak boleh terbocorkan.
    throw new NotFoundError("Konten");
  }
}
