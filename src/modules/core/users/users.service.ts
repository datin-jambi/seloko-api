import argon2 from "argon2";
import { prisma } from "~/config/database.js";
import { invalidateAllUserPermissionCaches } from "~/config/redis.js";
import { ConflictError, NotFoundError, ForbiddenError, BadRequestError } from "~/common/errors/index.js";
import { buildPaginatedResult } from "~/common/types/index.js";
import type { ListUsersQuery, CreateUserBody, UpdateUserBody, AssignRoleBody } from "./users.schema.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────
/**
 * Memformat satu baris UserAppRole menjadi shape respons yang konsisten.
 */
function formatRole(uar: {
  id: string;
  roleId: string;
  expiresAt: Date | null;
  createdAt: Date;
  role: { name: string };
  application: { id: string; code: string; name: string };
}) {
  return {
    id: uar.id,
    roleId: uar.roleId,
    roleName: uar.role.name,
    applicationId: uar.application.id,
    applicationCode: uar.application.code,
    applicationName: uar.application.name,
    expiresAt: uar.expiresAt?.toISOString() ?? null,
    createdAt: uar.createdAt.toISOString(),
  };
}

/** Select standar untuk user dalam daftar (tanpa passwordHash). */
const USER_LIST_SELECT = {
  id: true,
  nip: true,
  username: true,
  email: true,
  fullName: true,
  phoneNumber: true,
  avatarUrl: true,
  isSuperAdmin: true,
  isActive: true,
  emailVerifiedAt: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const;

/** Select standar untuk UserAppRole yang di-include di detail user. */
const ROLES_INCLUDE = {
  userAppRoles: {
    include: {
      role: { select: { name: true } },
      application: { select: { id: true, code: true, name: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
} as const;

function formatUser(user: {
  id: string;
  nip: string | null;
  username: string;
  email: string;
  fullName: string;
  phoneNumber: string | null;
  avatarUrl: string | null;
  isSuperAdmin: boolean;
  isActive: boolean;
  emailVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}) {
  return {
    id: user.id,
    nip: user.nip,
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    phoneNumber: user.phoneNumber,
    avatarUrl: user.avatarUrl,
    isSuperAdmin: user.isSuperAdmin,
    isActive: user.isActive,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    deletedAt: user.deletedAt?.toISOString() ?? null,
  };
}

// ─── List Users ───────────────────────────────────────────────────────────────
/**
 * Mengembalikan daftar user ter-paginasi.
 * Mendukung pencarian full-text (username, email, nama) dan filter status.
 * Soft-deleted user TIDAK ditampilkan secara default.
 */
export async function listUsers(query: ListUsersQuery) {
  const { page, limit, search, isActive, isSuperAdmin } = query;
  const skip = (page - 1) * limit;

  const where = {
    deletedAt: null, // Sembunyikan soft-deleted
    ...(isActive !== undefined && { isActive: isActive === "true" }),
    ...(isSuperAdmin !== undefined && { isSuperAdmin: isSuperAdmin === "true" }),
    ...(search && {
      OR: [
        { username: { contains: search, mode: "insensitive" as const } },
        { email: { contains: search, mode: "insensitive" as const } },
        { fullName: { contains: search, mode: "insensitive" as const } },
        { nip: { contains: search, mode: "insensitive" as const } },
      ],
    }),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: USER_LIST_SELECT,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.count({ where }),
  ]);

  return buildPaginatedResult(users.map(formatUser), total, page, limit);
}

// ─── Get User By ID ───────────────────────────────────────────────────────────
/**
 * Mengembalikan detail user beserta seluruh penugasan role-nya.
 * Melempar NotFoundError jika user tidak ditemukan atau sudah dihapus.
 */
export async function getUserById(id: string) {
  const user = await prisma.user.findUnique({
    where: { id, deletedAt: null },
    select: {
      ...USER_LIST_SELECT,
      ...ROLES_INCLUDE,
    },
  });

  if (!user) throw new NotFoundError("User", id);

  const { userAppRoles, ...rest } = user;

  return {
    ...formatUser(rest),
    roles: userAppRoles.map(formatRole),
  };
}

// ─── Create User ──────────────────────────────────────────────────────────────
/**
 * Membuat user baru dengan password di-hash argon2id.
 * Menolak jika username atau email sudah dipakai.
 */
export async function createUser(data: CreateUserBody) {
  // Cek konflik sebelum hash (hemat CPU)
  const existing = await prisma.user.findFirst({
    where: {
      deletedAt: null,
      OR: [
        { username: data.username.toLowerCase() },
        { email: data.email.toLowerCase() },
        ...(data.nip ? [{ nip: data.nip }] : []),
      ],
    },
    select: { username: true, email: true, nip: true },
  });

  if (existing) {
    if (existing.username === data.username.toLowerCase())
      throw new ConflictError(`Username "${data.username}" sudah digunakan`);
    if (existing.email === data.email.toLowerCase())
      throw new ConflictError(`Email "${data.email}" sudah terdaftar`);
    if (data.nip && existing.nip === data.nip)
      throw new ConflictError(`NIP "${data.nip}" sudah terdaftar`);
  }

  const passwordHash = await argon2.hash(data.password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const user = await prisma.user.create({
    data: {
      username: data.username.toLowerCase(),
      email: data.email.toLowerCase(),
      fullName: data.fullName,
      passwordHash,
      nip: data.nip ?? null,
      phoneNumber: data.phoneNumber ?? null,
      avatarUrl: data.avatarUrl ?? null,
      isSuperAdmin: data.isSuperAdmin,
      isActive: true,
    },
    select: {
      ...USER_LIST_SELECT,
      ...ROLES_INCLUDE,
    },
  });

  const { userAppRoles, ...rest } = user;

  return {
    ...formatUser(rest),
    roles: userAppRoles.map(formatRole),
  };
}

// ─── Update User ──────────────────────────────────────────────────────────────
/**
 * Update field profil user. Tidak mencakup password dan username/email
 * (keduanya butuh verifikasi terpisah).
 */
export async function updateUser(id: string, data: UpdateUserBody) {
  const exists = await prisma.user.findUnique({ where: { id, deletedAt: null }, select: { id: true } });
  if (!exists) throw new NotFoundError("User", id);

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(data.fullName !== undefined && { fullName: data.fullName }),
      ...(data.phoneNumber !== undefined && { phoneNumber: data.phoneNumber }),
      ...(data.avatarUrl !== undefined && { avatarUrl: data.avatarUrl }),
      ...(data.nip !== undefined && { nip: data.nip }),
      ...(data.isSuperAdmin !== undefined && { isSuperAdmin: data.isSuperAdmin }),
    },
    select: {
      ...USER_LIST_SELECT,
      ...ROLES_INCLUDE,
    },
  });

  // Jika isSuperAdmin berubah, cache permission perlu dibuang
  if (data.isSuperAdmin !== undefined) {
    await invalidateAllUserPermissionCaches(id);
  }

  const { userAppRoles, ...rest } = user;

  return {
    ...formatUser(rest),
    roles: userAppRoles.map(formatRole),
  };
}

// ─── Set Active Status ────────────────────────────────────────────────────────
/**
 * Mengaktifkan atau menonaktifkan user.
 * User yang dinonaktifkan tidak bisa login (loginUser memeriksa isActive).
 */
export async function setUserActiveStatus(id: string, isActive: boolean) {
  const exists = await prisma.user.findUnique({ where: { id, deletedAt: null }, select: { id: true } });
  if (!exists) throw new NotFoundError("User", id);

  await prisma.user.update({ where: { id }, data: { isActive } });

  // Saat dinonaktifkan, revoke semua refresh token agar tidak bisa memperpanjang sesi
  if (!isActive) {
    await prisma.refreshToken.updateMany({
      where: { userId: id, isRevoked: false },
      data: { isRevoked: true },
    });
    await invalidateAllUserPermissionCaches(id);
  }

  return { isActive };
}

// ─── Soft Delete ──────────────────────────────────────────────────────────────
/**
 * Soft-delete user: isi deletedAt, cabut semua sesi, buang cache.
 * Melempar ForbiddenError jika mencoba menghapus diri sendiri.
 */
export async function softDeleteUser(id: string, requesterId: string) {
  if (id === requesterId) {
    throw new ForbiddenError("Tidak dapat menghapus akun diri sendiri");
  }

  const user = await prisma.user.findUnique({ where: { id, deletedAt: null }, select: { id: true } });
  if (!user) throw new NotFoundError("User", id);

  await prisma.$transaction([
    // Soft delete
    prisma.user.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } }),
    // Cabut semua refresh token
    prisma.refreshToken.updateMany({ where: { userId: id, isRevoked: false }, data: { isRevoked: true } }),
  ]);

  // Buang permission cache
  await invalidateAllUserPermissionCaches(id);
}

// ─── Assign Role ──────────────────────────────────────────────────────────────
/**
 * Menugaskan role ke user pada aplikasi tertentu.
 * Idempoten: jika kombinasi (userId, applicationId, roleId) sudah ada,
 * hanya update expiresAt.
 */
export async function assignRole(
  userId: string,
  data: AssignRoleBody,
  assignedBy: string,
) {
  // Validasi: user ada?
  const user = await prisma.user.findUnique({ where: { id: userId, deletedAt: null }, select: { id: true } });
  if (!user) throw new NotFoundError("User", userId);

  // Validasi: aplikasi aktif?
  const app = await prisma.application.findUnique({
    where: { id: data.applicationId, isActive: true },
    select: { id: true },
  });
  if (!app) throw new BadRequestError(`Aplikasi dengan ID "${data.applicationId}" tidak ditemukan atau tidak aktif`);

  // Validasi: role ada dan milik aplikasi yang sama?
  const role = await prisma.role.findFirst({
    where: { id: data.roleId, applicationId: data.applicationId, isActive: true },
    select: { id: true },
  });
  if (!role) throw new BadRequestError(`Role dengan ID "${data.roleId}" tidak ditemukan di aplikasi ini`);

  const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;

  // Upsert — jika sudah ada, update expiresAt saja
  const uar = await prisma.userAppRole.upsert({
    where: {
      userId_applicationId_roleId: {
        userId,
        applicationId: data.applicationId,
        roleId: data.roleId,
      },
    },
    update: { expiresAt, assignedBy },
    create: {
      userId,
      applicationId: data.applicationId,
      roleId: data.roleId,
      expiresAt,
      assignedBy,
    },
    include: {
      role: { select: { name: true } },
      application: { select: { id: true, code: true, name: true } },
    },
  });

  // Buang cache permission agar perubahan langsung efektif
  await invalidateAllUserPermissionCaches(userId);

  return formatRole(uar);
}

// ─── Revoke Role ──────────────────────────────────────────────────────────────
/**
 * Mencabut penugasan role dari user berdasarkan UserAppRole ID.
 */
export async function revokeRole(userId: string, userAppRoleId: string) {
  const uar = await prisma.userAppRole.findFirst({
    where: { id: userAppRoleId, userId },
    select: { id: true },
  });

  if (!uar) {
    throw new NotFoundError("Penugasan role", userAppRoleId);
  }

  await prisma.userAppRole.delete({ where: { id: userAppRoleId } });

  // Buang cache permission agar pencabutan langsung efektif
  await invalidateAllUserPermissionCaches(userId);
}
