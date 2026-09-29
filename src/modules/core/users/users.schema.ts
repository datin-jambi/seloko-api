import { z } from "zod";

// ─── Shared User Shape ────────────────────────────────────────────────────────
const UserRoleShape = z.object({
  id: z.string(),
  roleId: z.string(),
  roleName: z.string(),
  applicationId: z.string(),
  applicationCode: z.string(),
  applicationName: z.string(),
  expiresAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

const UserShape = z.object({
  id: z.string(),
  nip: z.string().nullable(),
  username: z.string(),
  email: z.string().email(),
  fullName: z.string(),
  phoneNumber: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  isSuperAdmin: z.boolean(),
  isActive: z.boolean(),
  emailVerifiedAt: z.string().datetime().nullable(),
  lastLoginAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
});

const UserDetailShape = UserShape.extend({
  roles: z.array(UserRoleShape),
});

// ─── List Users ───────────────────────────────────────────────────────────────
export const ListUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional().describe("Cari berdasarkan username, email, atau nama lengkap"),
  isActive: z.enum(["true", "false"]).optional().describe("Filter status aktif"),
  isSuperAdmin: z.enum(["true", "false"]).optional().describe("Filter super admin"),
});

export const ListUsersResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.array(UserShape),
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
export const AssignRoleBodySchema = z.object({
  applicationId: z.string().uuid("Application ID harus berformat UUID"),
  roleId: z.string().uuid("Role ID harus berformat UUID"),
  expiresAt: z
    .string()
    .datetime({ message: "Format datetime tidak valid (ISO 8601)" })
    .optional()
    .describe("Waktu kadaluarsa penugasan role — null berarti permanen"),
});

export const AssignRoleResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: UserRoleShape,
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
