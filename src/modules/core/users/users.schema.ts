import { z } from "zod";

// ─── Shared User Shape ────────────────────────────────────────────────────────
/** OPD yang membatasi sebuah penugasan role (kosong = seluruh OPD). */
export const OrganizationRefShape = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  shortName: z.string().nullable(),
});

const UserRoleShape = z.object({
  id: z.string(),
  roleId: z.string(),
  roleName: z.string(),
  applicationId: z.string(),
  applicationCode: z.string(),
  applicationName: z.string(),
  expiresAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  /** Lingkup OPD penugasan. Array kosong = berlaku untuk SEMUA OPD. */
  organizations: z.array(OrganizationRefShape),
});

export const UserApplicationSummaryShape = z.object({
  id: z.string().describe("Application ID"),
  code: z.string().describe("Application Code (e.g. 'seloko')"),
  name: z.string().describe("Application Name"),
});

export const UserApplicationRoleItemShape = z.object({
  id: z.string().describe("UserAppRole ID penugasan"),
  roleId: z.string(),
  roleName: z.string(),
  expiresAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  organizations: z.array(OrganizationRefShape).describe("Lingkup OPD; kosong = semua OPD"),
});

export const UserApplicationGroupShape = z.object({
  id: z.string().describe("Application ID"),
  code: z.string().describe("Application Code"),
  name: z.string().describe("Application Name"),
  roles: z.array(UserApplicationRoleItemShape).describe("Daftar role pengguna pada aplikasi ini"),
});

const UserShape = z.object({
  id: z.string(),
  nip: z.string().nullable(),
  /** null untuk akun PUBLIC — warga login dengan email saja. */
  username: z.string().nullable(),
  email: z.string().email(),
  fullName: z.string(),
  phoneNumber: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  avatarFileId: z.string().nullable(),
  accountType: z.enum(["INTERNAL", "PUBLIC"]),
  isSuperAdmin: z.boolean(),
  isActive: z.boolean(),
  emailVerifiedAt: z.string().datetime().nullable(),
  lastLoginAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
});

export const UserListItemShape = UserShape.extend({
  totalApplications: z.number().int().nonnegative().describe("Total aplikasi unik yang dimiliki user"),
  totalRoles: z.number().int().nonnegative().describe("Total penugasan role pada user"),
  applications: z.array(UserApplicationSummaryShape).describe("Daftar aplikasi yang dapat diakses user"),
});

export const UserDetailShape = UserShape.extend({
  totalApplications: z.number().int().nonnegative().describe("Total aplikasi unik yang dimiliki user"),
  totalRoles: z.number().int().nonnegative().describe("Total penugasan role pada user"),
  applications: z.array(UserApplicationGroupShape).describe("Daftar aplikasi beserta daftar role di dalamnya"),
  roles: z.array(UserRoleShape).describe("Flat list seluruh penugasan role (backward compatible)"),
});

// ─── List Users ───────────────────────────────────────────────────────────────
export const ListUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional().describe("Cari berdasarkan username, email, atau nama lengkap"),
  accountType: z
    .enum(["INTERNAL", "PUBLIC"])
    .optional()
    .describe("Pegawai atau warga — keduanya dikelola terpisah di CMS"),
  isActive: z.enum(["true", "false"]).optional().describe("Filter status aktif"),
  isSuperAdmin: z.enum(["true", "false"]).optional().describe("Filter super admin"),
});

export const ListUsersResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.array(UserListItemShape),
  meta: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
    hasNextPage: z.boolean(),
    hasPreviousPage: z.boolean(),
  }),
});

// ─── Get User ─────────────────────────────────────────────────────────────────
export const UserParamsSchema = z.object({
  id: z.string().uuid("User ID harus berformat UUID"),
});

export const GetUserResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: UserDetailShape,
});

// ─── Create User ──────────────────────────────────────────────────────────────
/**
 * Endpoint ini HANYA membuat akun pegawai (INTERNAL).
 *
 * Akun warga lahir lewat pendaftaran mandiri di aplikasi publik beserta
 * verifikasi email (Fase 2), bukan dibuat operator. Tidak ada field
 * `accountType` di body justru supaya operator konsol tidak bisa membuat akun
 * warga dengan kata sandi yang ia ketahui.
 */
export const CreateUserBodySchema = z.object({
  username: z
    .string()
    .min(3, "Username minimal 3 karakter")
    .max(50)
    .regex(/^[a-z0-9_.-]+$/, "Username hanya boleh huruf kecil, angka, titik, underscore, atau tanda hubung")
    .describe("Username unik — harus huruf kecil"),
  email: z.string().email("Format email tidak valid").max(100),
  fullName: z.string().min(2, "Nama lengkap minimal 2 karakter").max(150),
  password: z
    .string()
    .min(8, "Password minimal 8 karakter")
    .max(100)
    .regex(/[A-Z]/, "Password harus mengandung minimal 1 huruf besar")
    .regex(/[0-9]/, "Password harus mengandung minimal 1 angka"),
  nip: z.string().max(30).optional().describe("NIP ASN — opsional untuk non-ASN"),
  phoneNumber: z.string().max(20).optional(),
  avatarUrl: z.string().url("Format URL avatar tidak valid").optional(),
  avatarFileId: z.string().max(100).optional().nullable(),
  isSuperAdmin: z.boolean().default(false),
});

export const CreateUserResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: UserDetailShape,
});

// ─── Update User ──────────────────────────────────────────────────────────────
export const UpdateUserBodySchema = z
  .object({
    fullName: z.string().min(2).max(150).optional(),
    phoneNumber: z.string().max(20).nullable().optional(),
    avatarUrl: z.string().url("Format URL avatar tidak valid").nullable().optional(),
    avatarFileId: z.string().max(100).nullable().optional(),
    nip: z.string().max(30).nullable().optional(),
    isSuperAdmin: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Setidaknya satu field harus diisi untuk update",
  });

export const UpdateUserResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: UserDetailShape,
});

// ─── Toggle Active ────────────────────────────────────────────────────────────
export const SetActiveBodySchema = z.object({
  isActive: z.boolean(),
});

export const SetActiveResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.object({ isActive: z.boolean() }),
});

// ─── Delete User ──────────────────────────────────────────────────────────────
export const DeleteUserResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.null(),
});

// ─── Assign Role ──────────────────────────────────────────────────────────────
export const AssignRoleBodySchema = z
  .object({
    applicationId: z.string().uuid("Application ID harus berformat UUID"),
    roleId: z.string().uuid("Role ID harus berformat UUID"),
    expiresAt: z
      .string()
      .datetime({ message: "Format datetime tidak valid (ISO 8601)" })
      .optional()
      .nullable()
      .describe("Waktu kadaluarsa penugasan role — null berarti permanen"),
    /**
     * Lingkup OPD. Kosong/absen = berlaku untuk SELURUH OPD (level Bapenda);
     * diisi = hanya OPD tersebut (mis. admin OPD). Mengirim ulang daftar yang
     * sama MENGGANTI lingkup sebelumnya, bukan menambah.
     */
    organizationIds: z
      .array(z.string().uuid("Setiap organizationIds harus UUID valid"))
      .max(50, "Maksimal 50 OPD per penugasan")
      .optional()
      .describe("OPD yang dibatasi; kosong = seluruh OPD"),
  })
  .refine((d) => !d.organizationIds || new Set(d.organizationIds).size === d.organizationIds.length, {
    message: "organizationIds tidak boleh berisi duplikat",
    path: ["organizationIds"],
  });

export const AssignRoleResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: UserRoleShape,
});

// ─── List Role Assignments ────────────────────────────────────────────────────
/**
 * Daftar penugasan role milik SATU user, siap untuk tabel CMS.
 *
 * `status` menyaring menurut masa berlaku: `active` (permanen atau belum
 * kedaluwarsa), `expired`, atau `all`. Bawaannya `active` — yang kedaluwarsa
 * tidak menarik perhatian tapi tetap bisa diaudit.
 */
export const ListRoleAssignmentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  applicationId: z.string().uuid("Application ID harus berformat UUID").optional(),
  roleId: z.string().uuid("Role ID harus berformat UUID").optional(),
  /** Saring penugasan yang mencakup OPD ini (termasuk yang berlaku semua OPD). */
  organizationId: z.string().uuid("Organization ID harus berformat UUID").optional(),
  status: z
    .enum(["active", "expired", "all"])
    .default("active")
    .describe("active = permanen/belum kedaluwarsa, expired = sudah lewat, all = semua"),
  sortBy: z.enum(["createdAt", "expiresAt", "application"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const ListRoleAssignmentsResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.array(UserRoleShape),
  meta: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
    hasNextPage: z.boolean(),
    hasPreviousPage: z.boolean(),
  }),
  /** Ringkasan lintas halaman, untuk badge & kartu ringkas di CMS. */
  summary: z.object({
    totalAssignments: z.number(),
    activeAssignments: z.number(),
    expiredAssignments: z.number(),
    totalApplications: z.number(),
    totalOrganizations: z.number(),
    /** Penugasan yang berlaku untuk seluruh OPD. */
    globalAssignments: z.number(),
  }),
});

// ─── Revoke Role ──────────────────────────────────────────────────────────────
export const RevokeRoleParamsSchema = z.object({
  id: z.string().uuid("User ID harus berformat UUID"),
  userAppRoleId: z.string().uuid("UserAppRole ID harus berformat UUID"),
});

export const RevokeRoleResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.null(),
});

// ─── Inferred Types ───────────────────────────────────────────────────────────
export type ListUsersQuery = z.infer<typeof ListUsersQuerySchema>;
export type UserParams = z.infer<typeof UserParamsSchema>;
export type CreateUserBody = z.infer<typeof CreateUserBodySchema>;
export type UpdateUserBody = z.infer<typeof UpdateUserBodySchema>;
export type SetActiveBody = z.infer<typeof SetActiveBodySchema>;
export type AssignRoleBody = z.infer<typeof AssignRoleBodySchema>;
export type RevokeRoleParams = z.infer<typeof RevokeRoleParamsSchema>;
export type ListRoleAssignmentsQuery = z.infer<typeof ListRoleAssignmentsQuerySchema>;
