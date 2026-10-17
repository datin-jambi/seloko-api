import argon2 from "argon2";
import type { Prisma } from "@prisma/client";
import { prisma } from "~/config/database.js";
import { invalidateAllUserPermissionCaches } from "~/config/redis.js";
import { ConflictError, NotFoundError, ForbiddenError, BadRequestError } from "~/common/errors/index.js";
import { buildPaginatedResult } from "~/common/types/index.js";
import { ImageKitService } from "~/common/services/storage/imagekit.service.js";
import type {
  ListUsersQuery,
  ListRoleAssignmentsQuery,
  CreateUserBody,
  UpdateUserBody,
  AssignRoleBody,
} from "./users.schema.js";

// Dipakai controller saat invalidasi cache gagal (Redis down): aksi di DB sudah
// permanen, tapi izin lama masih terbaca dari cache sampai TTL-nya habis.
// Klien harus diberi tahu, bukan dibiarkan menyangka perubahan langsung efektif.
export const CACHE_DEGRADED_NOTE =
  " (cache izin gagal dibersihkan — perubahan efektif penuh dalam ≤5 menit)";


// ─── Helpers ──────────────────────────────────────────────────────────────────
/** Select ringkas OPD — dipakai di setiap penugasan role. */
const ORG_REF_SELECT = {
  select: { organization: { select: { id: true, code: true, name: true, shortName: true } } },
  orderBy: { organization: { name: "asc" as const } },
} as const;

const ORG_REF_REL = {
  organizations: ORG_REF_SELECT,
} as const;

function formatRole(uar: {
  id: string;
  roleId: string;
  expiresAt: Date | null;
  createdAt: Date;
  role: { name: string };
  application: { id: string; code: string; name: string };
  organizations: Array<{ organization: { id: string; code: string; name: string; shortName: string | null } }>;
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
    // Kosong = penugasan berlaku untuk seluruh OPD (level Bapenda).
    organizations: uar.organizations.map((o) => o.organization),
  };
}

/**
 * Mengelompokkan penugasan role berdasarkan aplikasi sehingga jelas
 * user terdaftar di aplikasi apa saja dan sebagai role apa saja.
 */
function groupUserApplications(userAppRoles: Array<{
  id: string;
  roleId: string;
  expiresAt: Date | null;
  createdAt: Date;
  role: { name: string };
  application: { id: string; code: string; name: string };
  organizations: Array<{ organization: { id: string; code: string; name: string; shortName: string | null } }>;
}>) {
  const appMap = new Map<string, {
    id: string;
    code: string;
    name: string;
    roles: Array<{
      id: string;
      roleId: string;
      roleName: string;
      expiresAt: string | null;
      createdAt: string;
      organizations: Array<{ id: string; code: string; name: string; shortName: string | null }>;
    }>;
  }>();

  for (const uar of userAppRoles) {
    let app = appMap.get(uar.application.id);
    if (!app) {
      app = {
        id: uar.application.id,
        code: uar.application.code,
        name: uar.application.name,
        roles: [],
      };
      appMap.set(uar.application.id, app);
    }
    app.roles.push({
      id: uar.id,
      roleId: uar.roleId,
      roleName: uar.role.name,
      expiresAt: uar.expiresAt?.toISOString() ?? null,
      createdAt: uar.createdAt.toISOString(),
      organizations: uar.organizations.map((o) => o.organization),
    });
  }

  return Array.from(appMap.values());
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
  avatarFileId: true,
  accountType: true,
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
      ...ORG_REF_REL,
    },
    orderBy: { createdAt: "asc" as const },
  },
} as const;

function formatUser(user: {
  id: string;
  nip: string | null;
  username: string | null;
  email: string;
  fullName: string;
  phoneNumber: string | null;
  avatarUrl: string | null;
  avatarFileId: string | null;
  accountType: "INTERNAL" | "PUBLIC";
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
    avatarFileId: user.avatarFileId,
    accountType: user.accountType,
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
 * Mengembalikan daftar user ter-paginasi beserta ringkasan aplikasi & total role.
 * Mendukung pencarian full-text (username, email, nama) dan filter status.
 * Soft-deleted user TIDAK ditampilkan secara default.
 */
export async function listUsers(query: ListUsersQuery) {
  const { page, limit, search, accountType, isActive, isSuperAdmin } = query;
  const skip = (page - 1) * limit;

  const where = {
    deletedAt: null, // Sembunyikan soft-deleted
    ...(accountType !== undefined && { accountType }),
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
      select: {
        ...USER_LIST_SELECT,
        userAppRoles: {
          select: {
            id: true,
            roleId: true,
            application: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.count({ where }),
  ]);

  const formattedUsers = users.map((user) => {
    const { userAppRoles, ...rest } = user;

    const appMap = new Map<string, { id: string; code: string; name: string }>();
    for (const uar of userAppRoles) {
      if (!appMap.has(uar.application.id)) {
        appMap.set(uar.application.id, {
          id: uar.application.id,
          code: uar.application.code,
          name: uar.application.name,
        });
      }
    }

    const applications = Array.from(appMap.values());
    const totalApplications = applications.length;
    const totalRoles = userAppRoles.length;

    return {
      ...formatUser(rest),
      totalApplications,
      totalRoles,
      applications,
    };
  });

  return buildPaginatedResult(formattedUsers, total, page, limit);
}

// ─── Get User By ID ───────────────────────────────────────────────────────────
/**
 * Mengembalikan detail user beserta seluruh penugasan role yang dipetakan
 * rapi per aplikasi maupun dalam format list roles.
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
  const applications = groupUserApplications(userAppRoles);
  const totalApplications = applications.length;
  const totalRoles = userAppRoles.length;

  return {
    ...formatUser(rest),
    totalApplications,
    totalRoles,
    applications,
    roles: userAppRoles.map(formatRole),
  };
}

/**
 * Memvalidasi berkas avatar di ImageKit dengan kriteria toleran.
 */
async function validateAvatarImage(fileId?: string | null): Promise<void> {
  if (!fileId || !fileId.trim()) return;

  const file = await ImageKitService.getFileDetails(fileId);
  if (!file) {
    throw new BadRequestError(
      `Berkas foto avatar (ID: '${fileId}') tidak ditemukan di ImageKit.`,
    );
  }

  // Ukuran maksimal avatar: 2 MB
  const maxBytes = 2 * 1024 * 1024;
  if (file.size > maxBytes) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
    throw new BadRequestError(
      `Ukuran foto avatar terlalu besar (${sizeMb} MB). Maksimal yang diizinkan adalah 2 MB.`,
    );
  }

  // Dimensi minimal avatar: 100x100 px jika metadata dimensi tersedia
  if (file.width !== undefined && file.height !== undefined) {
    if (file.width < 100 || file.height < 100) {
      throw new BadRequestError(
        `Dimensi foto avatar terlalu kecil (${file.width}x${file.height} px). Minimal 100x100 px.`,
      );
    }
  }
}

// ─── Create User ──────────────────────────────────────────────────────────────
/**
 * Membuat user baru dengan password di-hash argon2id.
 * Menolak jika username atau email sudah dipakai.
 */
export async function createUser(data: CreateUserBody) {
  // Cek konflik sebelum hash (hemat CPU). Email hanya unik di antara akun
  // pegawai — warga dengan email sama adalah akun lain, dan bukan konflik.
  // Baris soft-deleted IKUT dicek: unique index di DB tetap memegang username/
  // email/NIP-nya, jadi tanpa ini INSERT gagal P2002 dan berakhir 500.
  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { username: data.username.toLowerCase() },
        { accountType: "INTERNAL", email: data.email.toLowerCase() },
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

  if (data.avatarFileId) {
    await validateAvatarImage(data.avatarFileId);
  }

  const passwordHash = await argon2.hash(data.password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const user = await prisma.user.create({
    data: {
      accountType: "INTERNAL",
      username: data.username.toLowerCase(),
      email: data.email.toLowerCase(),
      fullName: data.fullName,
      passwordHash,
      nip: data.nip ?? null,
      phoneNumber: data.phoneNumber ?? null,
      avatarUrl: data.avatarUrl ?? null,
      avatarFileId: data.avatarFileId ?? null,
      isSuperAdmin: data.isSuperAdmin,
      isActive: true,
    },
    select: {
      ...USER_LIST_SELECT,
      ...ROLES_INCLUDE,
    },
  });

  const { userAppRoles, ...rest } = user;
  const applications = groupUserApplications(userAppRoles);
  const totalApplications = applications.length;
  const totalRoles = userAppRoles.length;

  return {
    ...formatUser(rest),
    totalApplications,
    totalRoles,
    applications,
    roles: userAppRoles.map(formatRole),
  };
}

// ─── Update User ──────────────────────────────────────────────────────────────
/**
 * Update field profil user. Tidak mencakup password dan username/email
 * (keduanya butuh verifikasi terpisah).
 */
export async function updateUser(id: string, data: UpdateUserBody) {
  const existing = await prisma.user.findUnique({
    where: { id, deletedAt: null },
    select: { id: true, avatarFileId: true },
  });
  if (!existing) throw new NotFoundError("User", id);

  if (data.avatarFileId) {
    await validateAvatarImage(data.avatarFileId);
  }

  // Auto-cleanup foto avatar lama di ImageKit jika diganti
  if (
    existing.avatarFileId &&
    data.avatarFileId &&
    existing.avatarFileId !== data.avatarFileId
  ) {
    ImageKitService.deleteFile(existing.avatarFileId).catch((err) => {
      console.error("[UsersService] Gagal menghapus avatar lama di ImageKit:", err);
    });
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(data.fullName !== undefined && { fullName: data.fullName }),
      ...(data.phoneNumber !== undefined && { phoneNumber: data.phoneNumber }),
      ...(data.avatarUrl !== undefined && { avatarUrl: data.avatarUrl }),
      ...(data.avatarFileId !== undefined && { avatarFileId: data.avatarFileId }),
      ...(data.nip !== undefined && { nip: data.nip }),
      ...(data.isSuperAdmin !== undefined && { isSuperAdmin: data.isSuperAdmin }),
    },
    select: {
      ...USER_LIST_SELECT,
      ...ROLES_INCLUDE,
    },
  });

  // Jika isSuperAdmin berubah, cache permission perlu dibuang
  let cacheCleared = true;
  if (data.isSuperAdmin !== undefined) {
    cacheCleared = await invalidateAllUserPermissionCaches(id);
  }

  const { userAppRoles, ...rest } = user;
  const applications = groupUserApplications(userAppRoles);
  const totalApplications = applications.length;
  const totalRoles = userAppRoles.length;

  return {
    ...formatUser(rest),
    totalApplications,
    totalRoles,
    applications,
    roles: userAppRoles.map(formatRole),
    cacheCleared,
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
  let cacheCleared = true;
  if (!isActive) {
    await prisma.refreshToken.updateMany({
      where: { userId: id, isRevoked: false },
      data: { isRevoked: true },
    });
    cacheCleared = await invalidateAllUserPermissionCaches(id);
  }

  return { isActive, cacheCleared };
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
  return { cacheCleared: await invalidateAllUserPermissionCaches(id) };
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
  const user = await prisma.user.findUnique({
    where: { id: userId, deletedAt: null },
    select: { id: true, accountType: true },
  });
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
    select: { id: true, name: true, audience: true },
  });
  if (!role) throw new BadRequestError(`Role dengan ID "${data.roleId}" tidak ditemukan di aplikasi ini`);

  // Role pegawai hanya untuk akun pegawai, role warga hanya untuk akun warga.
  // Tanpa pagar ini operator bisa memberi akun warga role "verifikator" lapak
  // — dan warga itu ikut memegang izin approve pedagang lain.
  if (role.audience !== user.accountType) {
    throw new BadRequestError(
      `Role "${role.name}" khusus akun ${role.audience === "INTERNAL" ? "pegawai" : "publik"}, ` +
        `sedangkan pengguna ini akun ${user.accountType === "INTERNAL" ? "pegawai" : "publik"}`,
    );
  }

  // Lingkup OPD: pastikan semuanya ada & aktif sebelum menyentuh penugasan,
  // supaya kegagalan tidak meninggalkan penugasan setengah jadi.
  const organizationIds = data.organizationIds ?? [];
  if (organizationIds.length > 0) {
    const found = await prisma.organization.findMany({
      where: { id: { in: organizationIds }, deletedAt: null },
      select: { id: true },
    });
    if (found.length !== organizationIds.length) {
      const missing = organizationIds.filter((id) => !found.some((o) => o.id === id));
      throw new BadRequestError(`Organisasi tidak ditemukan: ${missing.join(", ")}`);
    }
  }

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
      ...ORG_REF_REL,
    },
  });

  // Lingkup OPD diganti utuh (bukan ditambah): mengirim daftar baru berarti
  // "hanya OPD ini", mengirim kosong berarti "seluruh OPD".
  await prisma.$transaction([
    prisma.userAppRoleOrganization.deleteMany({ where: { userAppRoleId: uar.id } }),
    prisma.userAppRoleOrganization.createMany({
      data: organizationIds.map((organizationId) => ({
        userAppRoleId: uar.id,
        organizationId,
      })),
      skipDuplicates: true,
    }),
  ]);

  const withOrgs = await prisma.userAppRole.findUniqueOrThrow({
    where: { id: uar.id },
    include: {
      role: { select: { name: true } },
      application: { select: { id: true, code: true, name: true } },
      ...ORG_REF_REL,
    },
  });

  // Buang cache permission agar perubahan langsung efektif
  const cacheCleared = await invalidateAllUserPermissionCaches(userId);

  return { ...formatRole(withOrgs), cacheCleared };
}

// ─── List Role Assignments (berpaginasi & berfilter) ──────────────────────────
/**
 * Daftar penugasan role satu user untuk tabel CMS.
 *
 * `summary` dihitung dari SELURUH penugasan user (bukan hanya halaman ini) —
 * itulah yang dipakai badge "3 aplikasi · 5 role · 2 OPD" di kartu user.
 */
export async function listRoleAssignments(userId: string, query: ListRoleAssignmentsQuery) {
  const { page, limit, applicationId, roleId, organizationId, status, sortBy, sortOrder } = query;

  const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null }, select: { id: true } });
  if (!user) throw new NotFoundError("User", userId);

  const now = new Date();
  const notExpired = { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
  const expired = { expiresAt: { lte: now } };

  const where: Prisma.UserAppRoleWhereInput = {
    userId,
    ...(applicationId !== undefined && { applicationId }),
    ...(roleId !== undefined && { roleId }),
    // Penugasan tanpa baris OPD berlaku untuk SEMUA OPD, jadi ikut cocok.
    ...(organizationId !== undefined && {
      OR: [{ organizations: { none: {} } }, { organizations: { some: { organizationId } } }],
    }),
    ...(status === "active" && notExpired),
    ...(status === "expired" && expired),
  };

  const orderBy: Prisma.UserAppRoleOrderByWithRelationInput =
    sortBy === "application" ? { application: { name: sortOrder } } : { [sortBy]: sortOrder };

  const [rows, total, all, appGroups, orgGroups, globalCount] = await Promise.all([
    prisma.userAppRole.findMany({
      where,
      include: {
        role: { select: { name: true } },
        application: { select: { id: true, code: true, name: true } },
        ...ORG_REF_REL,
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy,
    }),
    prisma.userAppRole.count({ where }),
    prisma.userAppRole.count({ where: { userId } }),
    prisma.userAppRole.findMany({
      where: { userId },
      select: { applicationId: true },
      distinct: ["applicationId"],
    }),
    prisma.userAppRoleOrganization.findMany({
      where: { userAppRole: { userId } },
      select: { organizationId: true },
      distinct: ["organizationId"],
    }),
    prisma.userAppRole.count({ where: { userId, organizations: { none: {} } } }),
  ]);

  const activeCount = await prisma.userAppRole.count({ where: { userId, ...notExpired } });

  return {
    ...buildPaginatedResult(rows.map(formatRole), total, page, limit),
    summary: {
      totalAssignments: all,
      activeAssignments: activeCount,
      expiredAssignments: all - activeCount,
      totalApplications: appGroups.length,
      totalOrganizations: orgGroups.length,
      globalAssignments: globalCount,
    },
  };
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
  return { cacheCleared: await invalidateAllUserPermissionCaches(userId) };
}

