import { z } from "zod";

// ─── Shared Shapes ────────────────────────────────────────────────────────────
const PermissionShape = z.object({
  id: z.string(),
  applicationId: z.string(),
  applicationCode: z.string(),
  code: z.string(),
  name: z.string(),
  module: z.string(),
  createdAt: z.string().datetime(),
});

const PermissionListItemShape = PermissionShape.extend({
  /** Jumlah role yang memegang permission ini. */
  roleCount: z.number(),
  /** Jumlah menu yang memakai permission ini sebagai pembatas visibilitas. */
  menuCount: z.number(),
});

const PermissionDetailShape = PermissionListItemShape.extend({
  /**
   * Role yang memegang permission ini. Dipakai layar konfirmasi hapus: operator
   * harus tahu izin ini tercabut dari siapa saja sebelum menekan tombol.
   */
  roles: z.array(z.object({ id: z.string(), name: z.string() })),
  /** Menu yang memakai permission ini sebagai pembatas. Hapus = menu jadi terbuka. */
  menus: z.array(z.object({ id: z.string(), label: z.string() })),
});

// ─── Field Rules ──────────────────────────────────────────────────────────────
/**
 * Kode permission adalah rujukan keras, bukan label.
 *
 * Nilainya tertanam sebagai literal di setiap route (`requirePermission("user:list")`),
 * di-cache Redis sebagai string, dan dipakai `menus.json`. Karena itu API ini
 * TIDAK mengizinkan perubahan `code` sama sekali — lihat UpdatePermissionBodySchema.
 */
const codeField = z
  .string()
  .min(3)
  .max(100)
  .regex(
    /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/,
    "Kode harus berformat '<entity>:<action>' dengan huruf kecil, mis. 'user:list'",
  )
  .describe("Kode unik dalam satu aplikasi, mis. 'user:list'");

const nameField = z.string().min(3).max(150).describe("Label yang dibaca manusia");

/**
 * `module` murni pengelompokan tampilan — CMS merender permission berkelompok
 * per modul. Seeder memakai nama berhuruf besar ("Pengguna", "Akses"), jadi
 * tidak dibatasi huruf kecil.
 */
const moduleField = z.string().min(2).max(50);

// ─── List ─────────────────────────────────────────────────────────────────────
export const ListPermissionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  applicationId: z.string().uuid("Application ID harus berformat UUID").optional(),
  module: z.string().trim().min(1).optional().describe("Filter satu modul"),
  search: z
    .string()
    .trim()
    .optional()
    .describe("Cari pada kode atau nama permission"),
});

export const ListPermissionsResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.array(PermissionListItemShape),
  meta: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
    hasNextPage: z.boolean(),
    hasPreviousPage: z.boolean(),
  }),
});

// ─── Modules ──────────────────────────────────────────────────────────────────
// Daftar modul distingtif per aplikasi — mengisi dropdown filter di CMS, agar
// front-end tidak perlu menebak dari halaman yang kebetulan termuat.
export const ListModulesQuerySchema = z.object({
  applicationId: z.string().uuid("Application ID harus berformat UUID"),
});

export const ListModulesResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.array(
    z.object({
      module: z.string(),
      permissionCount: z.number(),
    }),
  ),
});

// ─── Params ───────────────────────────────────────────────────────────────────
export const PermissionParamsSchema = z.object({
  id: z.string().uuid("Permission ID harus berformat UUID"),
});

// ─── Get ──────────────────────────────────────────────────────────────────────
export const GetPermissionResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: PermissionDetailShape,
});

// ─── Create ───────────────────────────────────────────────────────────────────
export const CreatePermissionBodySchema = z.object({
  applicationId: z.string().uuid("Application ID harus berformat UUID"),
  code: codeField,
  name: nameField,
  module: moduleField,
});

export const CreatePermissionResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: PermissionShape,
});

// ─── Update ───────────────────────────────────────────────────────────────────
/**
 * Hanya `name` dan `module` yang dapat diubah.
 *
 * `code` sengaja dikunci: ia literal di dalam kode program
 * (`requirePermission("user:list")`). Mengubahnya lewat API akan membuat guard
 * menolak semua orang tanpa satu pun baris kode berubah — kegagalan yang mahal
 * dan membingungkan. Untuk memakai kode baru, buat permission baru lalu pindahkan
 * role & menunya. Lihat CREATE:
 *
 * `applicationId` juga terkunci — permission milik satu aplikasi, dan
 * memindahkannya berarti memindahkan seluruh riwayat role yang memakainya.
 */
export const UpdatePermissionBodySchema = z
  .object({
    name: nameField.optional(),
    module: moduleField.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Setidaknya satu field harus diisi untuk update",
  });

export const UpdatePermissionResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: PermissionShape,
});

// ─── Delete ───────────────────────────────────────────────────────────────────
// Dampaknya dikembalikan sebagai data, bukan hanya dirangkai ke dalam pesan —
// pemanggil otomatis (skrip migrasi izin) perlu tahu berapa penugasan yang ikut
// tercabut tanpa mem-parsing kalimat.
export const DeletePermissionResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.object({
    revokedFromRoles: z.number(),
    unguardedMenus: z.number(),
  }),
});

// ─── Inferred Types ───────────────────────────────────────────────────────────
export type ListPermissionsQuery = z.infer<typeof ListPermissionsQuerySchema>;
export type ListModulesQuery = z.infer<typeof ListModulesQuerySchema>;
export type PermissionParams = z.infer<typeof PermissionParamsSchema>;
export type CreatePermissionBody = z.infer<typeof CreatePermissionBodySchema>;
export type UpdatePermissionBody = z.infer<typeof UpdatePermissionBodySchema>;
