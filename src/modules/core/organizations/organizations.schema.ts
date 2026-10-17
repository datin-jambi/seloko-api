import { z } from "zod";

// ─── Field Rules ──────────────────────────────────────────────────────────────
/**
 * Kode OPD dipakai sebagai kunci seeder dan segmen URL publik
 * (`/lapak/opd/<code>`), jadi dibatasi sama seperti kode aplikasi.
 */
const codeField = z
  .string()
  .min(2, "Kode organisasi minimal 2 karakter")
  .max(50)
  .regex(/^[A-Za-z0-9_-]+$/, "Kode hanya boleh huruf, angka, underscore, atau tanda hubung")
  .describe("Kode unik organisasi, mis. 'BPSDM'");

const nameField = z.string().min(2, "Nama organisasi minimal 2 karakter").max(200);
const shortNameField = z.string().max(100);

export const OrganizationTypeField = z
  .enum(["OPD", "UPTD", "BIRO", "LAINNYA"])
  .describe("Jenis unit kerja; UPTD biasanya punya induk OPD");

// ─── Shapes ───────────────────────────────────────────────────────────────────
export const OrganizationShape = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  shortName: z.string().nullable(),
  type: OrganizationTypeField,
  parentId: z.string().nullable(),
  description: z.string().nullable(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  website: z.string().nullable(),
  logoUrl: z.string().nullable(),
  logoFileId: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

/** Ringkasan induk untuk dropdown & breadcrumb tanpa query tambahan. */
const ParentRefShape = z.object({ id: z.string(), code: z.string(), name: z.string() });

const OrganizationDetailShape = OrganizationShape.extend({
  parent: ParentRefShape.nullable(),
  counts: z.object({ children: z.number(), userAppRoleScopes: z.number() }),
});

// ─── Params ───────────────────────────────────────────────────────────────────
export const OrganizationParamsSchema = z.object({
  id: z.string().uuid("ID organisasi harus UUID valid"),
});

export const OrganizationCodeParamsSchema = z.object({
  code: codeField,
});

// ─── List ─────────────────────────────────────────────────────────────────────
export const ListOrganizationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  type: OrganizationTypeField.optional(),
  isActive: z.enum(["true", "false"]).optional(),
  parentId: z.string().uuid().optional(),
  /** `true` = hanya baris akar (tanpa induk) — isi dropdown "OPD induk". */
  rootsOnly: z.enum(["true", "false"]).optional(),
  sortBy: z.enum(["code", "name", "createdAt"]).default("code"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

/** Daftar publik: hanya OPD aktif, tanpa paginasi — untuk filter katalog. */
export const PublicListOrganizationsQuerySchema = z.object({
  type: OrganizationTypeField.optional(),
  search: z.string().trim().max(100).optional(),
});

// ─── Create ───────────────────────────────────────────────────────────────────
export const CreateOrganizationBodySchema = z.object({
  code: codeField,
  name: nameField,
  shortName: shortNameField.optional().nullable(),
  type: OrganizationTypeField.default("OPD"),
  parentId: z.string().uuid("ID induk harus UUID valid").optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  email: z.string().email("Format email tidak valid").max(100).optional().nullable(),
  website: z.string().url("Format URL tidak valid").max(255).optional().nullable(),
  logoUrl: z.string().url("Format URL logo tidak valid").max(500).optional().nullable(),
  logoFileId: z.string().max(100).optional().nullable(),
  isActive: z.boolean().default(true),
});

export const UpdateOrganizationBodySchema = CreateOrganizationBodySchema.omit({ code: true })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Setidaknya satu field harus diisi untuk update",
  });
// Siklus hierarki (termasuk induk = diri sendiri) diperiksa di service — butuh
// data DB, tidak bisa diputuskan dari body saja.

export const SetOrganizationActiveBodySchema = z.object({ isActive: z.boolean() });

// ─── Responses ────────────────────────────────────────────────────────────────
const envelope = <T extends z.ZodTypeAny>(data: T) =>
  z.object({ success: z.boolean(), message: z.string(), data });

export const OrganizationResponseSchema = envelope(OrganizationDetailShape);
export const CreateOrganizationResponseSchema = envelope(OrganizationShape);
/** Profil OPD publik: bentuk ringkas tanpa relasi & hitungan. */
export const PublicOrganizationResponseSchema = envelope(OrganizationShape);
export const PublicOrganizationListResponseSchema = envelope(z.array(OrganizationShape));

export const ListOrganizationsResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.array(OrganizationShape),
  meta: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
    hasNextPage: z.boolean(),
    hasPreviousPage: z.boolean(),
  }),
});

export const SetOrganizationActiveResponseSchema = envelope(z.object({ isActive: z.boolean() }));
export const DeleteOrganizationResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.null(),
});

// ─── Inferred Types ───────────────────────────────────────────────────────────
export type OrganizationParams = z.infer<typeof OrganizationParamsSchema>;
export type OrganizationCodeParams = z.infer<typeof OrganizationCodeParamsSchema>;
export type ListOrganizationsQuery = z.infer<typeof ListOrganizationsQuerySchema>;
export type PublicListOrganizationsQuery = z.infer<typeof PublicListOrganizationsQuerySchema>;
export type CreateOrganizationBody = z.infer<typeof CreateOrganizationBodySchema>;
export type UpdateOrganizationBody = z.infer<typeof UpdateOrganizationBodySchema>;
export type SetOrganizationActiveBody = z.infer<typeof SetOrganizationActiveBodySchema>;
