import { z } from "zod";

// ─── Shared Shapes ────────────────────────────────────────────────────────────
const RoleShape = z.object({
  id: z.string(),
  applicationId: z.string(),
  applicationCode: z.string(),
  applicationName: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  /** Jenis akun yang boleh memegang role ini. Final setelah dibuat. */
  audience: z.enum(["INTERNAL", "PUBLIC"]),
  isSystemRole: z.boolean(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const RoleListItemShape = RoleShape.extend({
  permissionCount: z.number(),
  /** Jumlah pengguna yang sedang memegang role ini. */
  userCount: z.number(),
});

const RoleDetailShape = RoleShape.extend({
  userCount: z.number(),
  /**
   * SELURUH permission milik aplikasi, ditandai mana yang dipegang role ini.
   * Dikelompokkan per `module` agar CMS bisa langsung merender daftar centang
   * tanpa perlu memanggil endpoint permission secara terpisah.
   */
  permissionsByModule: z.array(
    z.object({
      module: z.string(),
      permissions: z.array(
        z.object({
          id: z.string(),
          code: z.string(),
          name: z.string(),
          granted: z.boolean(),
        }),
      ),
    }),
  ),
});

// ─── Field Rules ──────────────────────────────────────────────────────────────
/**
 * Nama role dipakai sebagai kunci oleh seeder (`"<appCode>/<roleName>"`) dan
 * tampil di JWT `/auth/me`, jadi dibatasi slug: huruf kecil, angka, tanda
 * hubung. Tanpa aturan ini "Editor" dan "editor" menjadi dua role berbeda yang
 * mustahil dibedakan operator.
 */
const nameField = z
  .string()
  .min(3, "Nama role minimal 3 karakter")
  .max(50)
  .regex(
    /^[a-z0-9-]+$/,
    "Nama role hanya boleh huruf kecil, angka, atau tanda hubung",
  )
  .describe("Nama role dalam satu aplikasi, mis. 'verifikator'");

const descriptionField = z.string().max(500);

const permissionIdsField = z
  .array(z.string().uuid("Permission ID harus berformat UUID"))
  .describe("Permission yang dipegang role ini — seluruhnya, bukan tambahan");

// ─── List ─────────────────────────────────────────────────────────────────────
export const ListRolesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional().describe("Cari berdasarkan nama role"),
  applicationId: z
    .string()
    .uuid("Application ID harus berformat UUID")
    .optional()
    .describe("Batasi ke satu aplikasi"),
  isActive: z.enum(["true", "false"]).optional(),
  isSystemRole: z.enum(["true", "false"]).optional(),
  audience: z.enum(["INTERNAL", "PUBLIC"]).optional(),
});

export const ListRolesResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.array(RoleListItemShape),
  meta: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
    hasNextPage: z.boolean(),
    hasPreviousPage: z.boolean(),
  }),
});

// ─── Get ──────────────────────────────────────────────────────────────────────
export const RoleParamsSchema = z.object({
  id: z.string().uuid("Role ID harus berformat UUID"),
});

export const GetRoleResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: RoleDetailShape,
});

// ─── Create ───────────────────────────────────────────────────────────────────
export const CreateRoleBodySchema = z.object({
  applicationId: z.string().uuid("Application ID harus berformat UUID"),
  name: nameField,
  /**
   * Absen = INTERNAL. Aplikasi INTERNAL hanya menerima role INTERNAL (warga
   * tidak pernah login ke sana); aplikasi PUBLIC menerima keduanya —
   * verifikator lapak adalah pegawai, pedagang lapak adalah warga.
   */
  audience: z.enum(["INTERNAL", "PUBLIC"]).default("INTERNAL"),
  description: descriptionField.optional(),
  /** Boleh kosong: role tanpa izin berguna sebagai penanda akses aplikasi saja. */
  permissionIds: permissionIdsField.default([]),
  isActive: z.boolean().default(true),
});

export const CreateRoleResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: RoleShape.extend({ permissionCount: z.number() }),
});

// ─── Update ───────────────────────────────────────────────────────────────────
/**
 * `applicationId` TIDAK bisa diubah: permission yang sudah terpasang milik
 * aplikasi lama, dan memindahkan role berarti seluruh izinnya jadi lintas
 * aplikasi — tepat yang dicegah RBAC ini. Buat role baru di aplikasi tujuan.
 *
 * `name` pada role sistem juga ditolak di service — seeder dan kode mencarinya
 * lewat nama.
 */
export const UpdateRoleBodySchema = z
  .object({
    name: nameField.optional(),
    description: descriptionField.nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Setidaknya satu field harus diisi untuk update",
  });

export const UpdateRoleResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: RoleShape,
});

// ─── Set Permissions ──────────────────────────────────────────────────────────
/**
 * Menyetel ulang SELURUH permission role (bukan menambah).
 *
 * Sengaja menyeluruh, bukan tambah/kurang satu-satu: layar CMS-nya adalah
 * daftar centang, jadi satu simpan = satu kiriman. Dengan begitu dua operator
 * yang menyimpan bersamaan tidak saling menimpa separuh perubahan.
 */
export const SetRolePermissionsBodySchema = z.object({
  permissionIds: permissionIdsField,
});

export const SetRolePermissionsResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.object({
    granted: z.number(),
    revoked: z.number(),
    total: z.number(),
  }),
});

// ─── Revoke Satu Permission ───────────────────────────────────────────────────
/**
 * Cabut satu permission dari role.
 *
 * Pelengkap `PUT /permissions` yang menyetel seluruhnya: dipakai saat operator
 * mencabut satu izin dari layar detail role, atau saat pemanggil non-UI hanya
 * tahu permission mana yang harus dilepas tanpa perlu mengirim daftar lengkap.
 */
export const RolePermissionParamsSchema = z.object({
  id: z.string().uuid("Role ID harus berformat UUID"),
  permissionId: z.string().uuid("Permission ID harus berformat UUID"),
});

export const RevokeRolePermissionResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.object({
    /** Sisa permission yang masih dipegang role setelah pencabutan. */
    remaining: z.number(),
  }),
});

// ─── Toggle Active ────────────────────────────────────────────────────────────
export const SetRoleActiveBodySchema = z.object({
  isActive: z.boolean(),
});

export const SetRoleActiveResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.object({ isActive: z.boolean() }),
});

// ─── Delete ───────────────────────────────────────────────────────────────────
export const DeleteRoleResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.null(),
});

// ─── Inferred Types ───────────────────────────────────────────────────────────
export type ListRolesQuery = z.infer<typeof ListRolesQuerySchema>;
export type RoleParams = z.infer<typeof RoleParamsSchema>;
export type CreateRoleBody = z.infer<typeof CreateRoleBodySchema>;
export type UpdateRoleBody = z.infer<typeof UpdateRoleBodySchema>;
export type SetRolePermissionsBody = z.infer<typeof SetRolePermissionsBodySchema>;
export type RolePermissionParams = z.infer<typeof RolePermissionParamsSchema>;
export type SetRoleActiveBody = z.infer<typeof SetRoleActiveBodySchema>;
