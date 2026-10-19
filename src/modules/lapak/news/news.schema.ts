import { z } from "zod";
import { ListArticlesQuerySchema } from "~/modules/shared/article/article.schema.js";

/**
 * Skema query CMS Lapak = skema bersama + `organization`.
 *
 * Diturunkan di sini, bukan ditambahkan ke `shared/article`, supaya route
 * Bapenda tidak ikut berubah. Tanpa field ini, Fastify MEMBUANG parameter
 * `?organization=` saat validasi — sehingga lingkup OPD diam-diam diabaikan.
 */
export const ListNewsQuerySchema = ListArticlesQuerySchema.extend({
  organization: z.string().trim().max(50).optional()
    .describe("Kode OPD (hanya Bapenda; admin OPD selalu memakai OPD-nya sendiri)"),
});

/** `?organization=` untuk rute CMS selain daftar (hanya berlaku bagi Bapenda). */
export const OrgQuerySchema = z.object({
  organization: z.string().trim().max(50).optional(),
});

export const OrgParamsSchema = z.object({
  code: z.string().trim().min(1).max(50).describe("Kode OPD, mis. BPSDM"),
});
export const OrgSlugParamsSchema = OrgParamsSchema.extend({
  slug: z.string().trim().min(1).max(255).describe("Slug berita"),
});
