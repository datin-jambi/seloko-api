import { prisma } from "~/config/database.js";
import { invalidateAppPermissionCaches } from "~/config/redis.js";
import {
  ConflictError,
  NotFoundError,
  ForbiddenError,
  BadRequestError,
} from "~/common/errors/index.js";
import { buildPaginatedResult } from "~/common/types/index.js";
import type {
  ListRolesQuery,
  CreateRoleBody,
  UpdateRoleBody,
} from "./roles.schema.js";

// Dipakai controller saat invalidasi cache gagal (Redis down): perubahan di DB
// sudah permanen, tapi izin lama masih terbaca dari cache sampai TTL habis.
export const CACHE_DEGRADED_NOTE =
  " (cache izin gagal dibersihkan — perubahan efektif penuh dalam ≤5 menit)";

const ROLE_SELECT = {
  id: true,
  applicationId: true,
  name: true,
  description: true,
  isSystemRole: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  application: { select: { code: true, name: true } },
} as const;

type RoleRow = {
  id: string;
  applicationId: string;
  name: string;
  description: string | null;
  isSystemRole: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  application: { code: string; name: string };
};

function formatRole({ application, ...role }: RoleRow) {
  return {
    ...role,
    applicationCode: application.code,
    applicationName: application.name,
    createdAt: role.createdAt.toISOString(),
    updatedAt: role.updatedAt.toISOString(),
  };
}

/**
 * Role bawaan sistem dilindungi dari penghapusan, penggantian nama, dan
 * penonaktifan.
 *
 * `isSystemRole` disetel seeder, dan seeder mencari role lewat nama
 * (`"<appCode>/<roleName>"`). Mengubah atau menghapusnya membuat seed berikutnya
 * membuat ulang role tersebut sebagai baris baru — penugasan pengguna yang lama
 * ikut hilang tanpa jejak. Permission-nya tetap boleh diubah: itu memang yang
 * perlu disesuaikan operator.
 */
function assertNotSystemRole(role: { isSystemRole: boolean; name: string }, action: string): void {
  if (role.isSystemRole) {
    throw new ForbiddenError(
      `Role sistem "${role.name}" tidak dapat ${action} — role ini dikelola seeder`,
    );
  }
}

/**
 * Pastikan seluruh permissionId memang milik aplikasi role tersebut.
 *
 * Tanpa pemeriksaan ini sebuah role di `lapak-jambi-web` bisa diberi permission
 * milik `seloko`, dan guard — yang hanya mencocokkan string `code` — akan
 * meloloskannya. Itu melubangi isolasi antar aplikasi dari dalam.
 */
async function assertPermissionsBelongToApp(
  permissionIds: string[],
  applicationId: string,
): Promise<void> {
  if (permissionIds.length === 0) return;

  const unique = [...new Set(permissionIds)];
  const valid = await prisma.permission.count({
    where: { id: { in: unique }, applicationId },
  });

  if (valid !== unique.length) {
    throw new BadRequestError(
      `${unique.length - valid} permission tidak ditemukan atau bukan milik aplikasi ini`,
    );
  }
}

// ─── List ─────────────────────────────────────────────────────────────────────
export async function listRoles(query: ListRolesQuery) {
  const { page, limit, search, applicationId, isActive, isSystemRole } = query;
  const skip = (page - 1) * limit;

  const where = {
    ...(applicationId !== undefined && { applicationId }),
    ...(isActive !== undefined && { isActive: isActive === "true" }),
    ...(isSystemRole !== undefined && { isSystemRole: isSystemRole === "true" }),
    ...(search && { name: { contains: search, mode: "insensitive" as const } }),
  };

  const [roles, total] = await Promise.all([
    prisma.role.findMany({
      where,
      select: {
        ...ROLE_SELECT,
        _count: { select: { rolePermissions: true, userAppRoles: true } },
      },
      skip,
      take: limit,
      orderBy: [{ application: { code: "asc" } }, { name: "asc" }],
    }),
    prisma.role.count({ where }),
  ]);

  const data = roles.map(({ _count, ...role }) => ({
    ...formatRole(role),
    permissionCount: _count.rolePermissions,
    userCount: _count.userAppRoles,
  }));

  return buildPaginatedResult(data, total, page, limit);
}

// ─── Get By ID ────────────────────────────────────────────────────────────────
/**
 * Detail role beserta SELURUH permission aplikasinya, ditandai mana yang
 * dipegang. Bentuk ini langsung cocok untuk layar daftar centang di CMS — tanpa
 * itu front-end harus memanggil dua endpoint lalu mencocokkan sendiri.
 */
export async function getRoleById(id: string) {
  const role = await prisma.role.findUnique({
    where: { id },
    select: {
      ...ROLE_SELECT,
      _count: { select: { userAppRoles: true } },
      rolePermissions: { select: { permissionId: true } },
    },
  });

  if (!role) throw new NotFoundError("Role", id);

  const { _count, rolePermissions, ...rest } = role;
  const granted = new Set(rolePermissions.map((rp) => rp.permissionId));

  const permissions = await prisma.permission.findMany({
    where: { applicationId: role.applicationId },
    select: { id: true, code: true, name: true, module: true },
    orderBy: [{ module: "asc" }, { code: "asc" }],
  });

  const grouped = new Map<
    string,
    { id: string; code: string; name: string; granted: boolean }[]
  >();

  for (const { module, ...perm } of permissions) {
    const entry = { ...perm, granted: granted.has(perm.id) };
    const bucket = grouped.get(module);
    if (bucket) bucket.push(entry);
    else grouped.set(module, [entry]);
  }

  return {
    ...formatRole(rest),
    userCount: _count.userAppRoles,
    permissionsByModule: [...grouped].map(([module, perms]) => ({
      module,
      permissions: perms,
    })),
  };
}

// ─── Create ───────────────────────────────────────────────────────────────────
export async function createRole(data: CreateRoleBody) {
  const app = await prisma.application.findUnique({
    where: { id: data.applicationId },
    select: { id: true, isActive: true },
  });

  if (!app) {
    throw new BadRequestError(
      `Aplikasi dengan ID "${data.applicationId}" tidak ditemukan`,
    );
  }
  if (!app.isActive) {
    throw new BadRequestError(
      "Tidak dapat membuat role pada aplikasi yang sedang nonaktif",
    );
  }

  const existing = await prisma.role.findUnique({
    where: { applicationId_name: { applicationId: app.id, name: data.name } },
    select: { id: true },
  });
  if (existing) {
    throw new ConflictError(
      `Role "${data.name}" sudah ada di aplikasi ini`,
    );
  }

  await assertPermissionsBelongToApp(data.permissionIds, app.id);

  // isSystemRole TIDAK pernah diset dari API — penanda itu milik seeder, dan
  // role buatan operator harus tetap bisa dihapus olehnya sendiri.
  const role = await prisma.role.create({
    data: {
      applicationId: app.id,
      name: data.name,
      description: data.description ?? null,
      isActive: data.isActive,
      rolePermissions: {
        create: [...new Set(data.permissionIds)].map((permissionId) => ({
          permissionId,
        })),
      },
    },
    select: { ...ROLE_SELECT, _count: { select: { rolePermissions: true } } },
  });

  const { _count, ...rest } = role;

  // Role baru belum dipegang siapa pun, jadi tidak ada cache yang perlu dibuang.
  return { ...formatRole(rest), permissionCount: _count.rolePermissions };
}

// ─── Update ───────────────────────────────────────────────────────────────────
export async function updateRole(id: string, data: UpdateRoleBody) {
  const role = await prisma.role.findUnique({
    where: { id },
    select: { applicationId: true, name: true, isSystemRole: true },
  });
  if (!role) throw new NotFoundError("Role", id);

  if (data.name !== undefined && data.name !== role.name) {
    assertNotSystemRole(role, "diganti namanya");

    const clash = await prisma.role.findUnique({
      where: {
        applicationId_name: { applicationId: role.applicationId, name: data.name },
      },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictError(`Role "${data.name}" sudah ada di aplikasi ini`);
    }
  }

  const updated = await prisma.role.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
    },
    select: ROLE_SELECT,
  });

  // Nama dan deskripsi tidak memengaruhi hasil resolveUserPermissions (yang
  // di-cache hanyalah daftar kode permission), jadi cache dibiarkan utuh.
  return formatRole(updated);
}

// ─── Set Permissions ──────────────────────────────────────────────────────────
/**
 * Menyetel ulang seluruh permission role.
 *
 * Cache permission se-aplikasi WAJIB dibuang: perubahan ini mengubah izin
 * setiap pemegang role, dan `resolveUserPermissions` menyimpan hasilnya 5 menit.
 * Tanpa invalidasi, izin yang baru dicabut masih berlaku selama itu.
 */
export async function setRolePermissions(id: string, permissionIds: string[]) {
  const role = await prisma.role.findUnique({
    where: { id },
    select: {
      applicationId: true,
      application: { select: { code: true } },
      rolePermissions: { select: { permissionId: true } },
    },
  });
  if (!role) throw new NotFoundError("Role", id);

  const target = [...new Set(permissionIds)];
  await assertPermissionsBelongToApp(target, role.applicationId);

  const current = new Set(role.rolePermissions.map((rp) => rp.permissionId));
  const toGrant = target.filter((pid) => !current.has(pid));
  const toRevoke = [...current].filter((pid) => !target.includes(pid));

  // Satu transaksi: cabut lalu pasang. Kalau terpisah dan yang kedua gagal,
  // role tertinggal dengan separuh izin — lebih buruk daripada tidak berubah.
  await prisma.$transaction([
    prisma.rolePermission.deleteMany({
      where: { roleId: id, permissionId: { in: toRevoke } },
    }),
    prisma.rolePermission.createMany({
      data: toGrant.map((permissionId) => ({ roleId: id, permissionId })),
      skipDuplicates: true,
    }),
  ]);

  return {
    granted: toGrant.length,
    revoked: toRevoke.length,
    total: target.length,
    cacheCleared: await invalidateAppPermissionCaches(role.application.code),
  };
}

// ─── Revoke Satu Permission ───────────────────────────────────────────────────
/**
 * Cabut satu permission dari role.
 *
 * `deleteMany` dipakai alih-alih `delete` agar tidak melempar P2025 mentah, tapi
 * `count === 0` TETAP dijadikan 404: pemanggil yang mengirim permissionId salah
 * harus tahu, bukan menerima 200 yang membuatnya yakin izin sudah dicabut
 * padahal tidak ada yang berubah.
 *
 * Seperti setRolePermissions, cache se-aplikasi dibuang supaya pencabutan
 * langsung berlaku dan tidak tertahan TTL 5 menit.
 */
export async function revokeRolePermission(id: string, permissionId: string) {
  const role = await prisma.role.findUnique({
    where: { id },
    select: { application: { select: { code: true } } },
  });
  if (!role) throw new NotFoundError("Role", id);

  const { count } = await prisma.rolePermission.deleteMany({
    where: { roleId: id, permissionId },
  });

  if (count === 0) {
    throw new NotFoundError("Permission pada role ini", permissionId);
  }

  return {
    remaining: await prisma.rolePermission.count({ where: { roleId: id } }),
    cacheCleared: await invalidateAppPermissionCaches(role.application.code),
  };
}

// ─── Set Active Status ────────────────────────────────────────────────────────
/**
 * Aktifkan atau matikan role.
 *
 * Role nonaktif diabaikan `resolveUserPermissions` dan `assertUserCanAccessApp`,
 * jadi mematikannya langsung mencabut izin seluruh pemegangnya — dan bila itu
 * satu-satunya role yang dia punya di aplikasi tersebut, aksesnya ikut hilang.
 * Karena itu cache se-aplikasi dibuang.
 */
export async function setRoleActiveStatus(id: string, isActive: boolean) {
  const role = await prisma.role.findUnique({
    where: { id },
    select: { name: true, isSystemRole: true, application: { select: { code: true } } },
  });
  if (!role) throw new NotFoundError("Role", id);

  if (!isActive) assertNotSystemRole(role, "dinonaktifkan");

  await prisma.role.update({ where: { id }, data: { isActive } });

  return {
    isActive,
    cacheCleared: await invalidateAppPermissionCaches(role.application.code),
  };
}

// ─── Delete ───────────────────────────────────────────────────────────────────
/**
 * Hapus role secara permanen.
 *
 * Ditolak selama masih dipegang pengguna. Cascade akan menghapus penugasannya
 * diam-diam, dan pengguna yang hanya punya role itu kehilangan akses
 * aplikasinya tanpa jejak apa pun — operator harus mencabutnya secara sadar
 * lebih dulu.
 *
 * Menu yang menunjuk role ini ikut terhapus dari `menu_roles` lewat cascade;
 * itu memang benar — pembatas yang menunjuk role mati tidak ada artinya.
 */
export async function deleteRole(id: string) {
  const role = await prisma.role.findUnique({
    where: { id },
    select: {
      name: true,
      isSystemRole: true,
      application: { select: { code: true } },
      _count: { select: { userAppRoles: true } },
    },
  });
  if (!role) throw new NotFoundError("Role", id);

  assertNotSystemRole(role, "dihapus");

  if (role._count.userAppRoles > 0) {
    throw new ConflictError(
      `Role masih dipegang ${role._count.userAppRoles} pengguna. ` +
        "Cabut seluruh penugasan lebih dulu sebelum menghapus.",
    );
  }

  await prisma.role.delete({ where: { id } });

  return { cacheCleared: await invalidateAppPermissionCaches(role.application.code) };
}
