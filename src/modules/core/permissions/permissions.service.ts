import { prisma } from "~/config/database.js";
import { invalidateAppPermissionCaches } from "~/config/redis.js";
import { resolveUserPermissions } from "~/common/guards/permission.guard.js";
import { ConflictError, NotFoundError, BadRequestError } from "~/common/errors/index.js";
import { buildPaginatedResult } from "~/common/types/index.js";
import type {
  ListPermissionsQuery,
  ListModulesQuery,
  CreatePermissionBody,
  UpdatePermissionBody,
} from "./permissions.schema.js";

// Dipakai controller saat invalidasi cache gagal (Redis down): baris di DB sudah
// berubah, tapi kode lama masih terbaca dari cache sampai TTL habis.
export const CACHE_DEGRADED_NOTE =
  " (cache izin gagal dibersihkan — perubahan efektif penuh dalam ≤5 menit)";

const PERMISSION_SELECT = {
  id: true,
  applicationId: true,
  code: true,
  name: true,
  module: true,
  createdAt: true,
  application: { select: { code: true } },
} as const;

type PermissionRow = {
  id: string;
  applicationId: string;
  code: string;
  name: string;
  module: string;
  createdAt: Date;
  application: { code: string };
};

function formatPermission({ application, ...permission }: PermissionRow) {
  return {
    ...permission,
    applicationCode: application.code,
    createdAt: permission.createdAt.toISOString(),
  };
}

/**
 * Buang SELURUH cache permission pengguna pada aplikasi ini.
 *
 * Hapus permission adalah satu-satunya perubahan di modul ini yang menggeser
 * izin: `resolveUserPermissions` meng-cache daftar KODE, bukan id, jadi kode
 * yang barisnya sudah dihapus tetap tersimpan di cache sampai TTL 5 menit habis.
 * Selama itu `requirePermission("user:list")` masih meloloskannya.
 */
async function clearPermissionCaches(appCode: string): Promise<boolean> {
  return invalidateAppPermissionCaches(appCode);
}

// ─── List ─────────────────────────────────────────────────────────────────────
export async function listPermissions(query: ListPermissionsQuery) {
  const { page, limit, applicationId, module, search } = query;
  const skip = (page - 1) * limit;

  const where = {
    ...(applicationId !== undefined && { applicationId }),
    ...(module !== undefined && { module }),
    ...(search && {
      OR: [
        { code: { contains: search, mode: "insensitive" as const } },
        { name: { contains: search, mode: "insensitive" as const } },
      ],
    }),
  };

  const [permissions, total] = await Promise.all([
    prisma.permission.findMany({
      where,
      select: {
        ...PERMISSION_SELECT,
        _count: { select: { rolePermissions: true, menuItems: true } },
      },
      skip,
      take: limit,
      orderBy: [{ application: { code: "asc" } }, { module: "asc" }, { code: "asc" }],
    }),
    prisma.permission.count({ where }),
  ]);

  const data = permissions.map(({ _count, ...permission }) => ({
    ...formatPermission(permission),
    roleCount: _count.rolePermissions,
    menuCount: _count.menuItems,
  }));

  return buildPaginatedResult(data, total, page, limit);
}

// ─── Modules ──────────────────────────────────────────────────────────────────
export async function listModules(query: ListModulesQuery) {
  const grouped = await prisma.permission.groupBy({
    by: ["module"],
    where: { applicationId: query.applicationId },
    _count: { _all: true },
    orderBy: { module: "asc" },
  });

  return grouped.map(({ module, _count }) => ({
    module,
    permissionCount: _count._all,
  }));
}

// ─── Get By ID ────────────────────────────────────────────────────────────────
export async function getPermissionById(id: string) {
  const permission = await prisma.permission.findUnique({
    where: { id },
    select: {
      ...PERMISSION_SELECT,
      _count: { select: { rolePermissions: true, menuItems: true } },
      rolePermissions: { select: { role: { select: { id: true, name: true } } } },
      menuItems: { select: { id: true, label: true } },
    },
  });

  if (!permission) throw new NotFoundError("Permission", id);

  const { _count, rolePermissions, menuItems, ...rest } = permission;

  return {
    ...formatPermission(rest),
    roleCount: _count.rolePermissions,
    menuCount: _count.menuItems,
    roles: rolePermissions.map((rp) => rp.role),
    menus: menuItems,
  };
}

// ─── Milik Sendiri ────────────────────────────────────────────────────────────
/**
 * Permission efektif milik pemanggil pada satu aplikasi.
 *
 * Daftar `permissions` diambil dari `resolveUserPermissions` — resolver yang SAMA
 * yang dipakai `requirePermission` — bukan dirakit ulang di sini. Merakit sendiri
 * berarti endpoint ini akan perlahan melenceng dari jawaban guard yang
 * sesungguhnya, dan CMS yang menyembunyikan menu berdasarkan hasilnya akan
 * menampilkan tombol yang justru dijawab 403.
 *
 * Karena resolver memakai `application: { code }` sementara pemanggil menunjuk
 * lewat id, kode aplikasinya dicari lebih dulu.
 *
 * Super admin: `requirePermission` melewati seluruh pemeriksaan untuk mereka.
 * Di sini bypass itu diterjemahkan menjadi "seluruh permission aplikasi", supaya
 * CMS super admin tidak menyembunyikan menu apa pun. `roles` tetap dilaporkan apa
 * adanya, jadi bisa saja kosong meski `permissions` penuh.
 */
export async function getMyPermissions(userId: string, applicationId: string) {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { id: true, code: true, name: true, icon: true, isActive: true },
  });

  if (!app) throw new NotFoundError("Application", applicationId);
  if (!app.isActive) {
    throw new NotFoundError("Application", applicationId);
  }

  // Penugasan yang benar-benar berlaku — penyaringnya cermin dari resolver.
  const assignments = await prisma.userAppRole.findMany({
    where: {
      userId,
      applicationId: app.id,
      role: { isActive: true },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: {
      expiresAt: true,
      role: { select: { id: true, name: true } },
    },
    orderBy: { role: { name: "asc" } },
  });

  const roles = assignments.map(({ role, expiresAt }) => ({
    id: role.id,
    name: role.name,
    expiresAt: expiresAt?.toISOString() ?? null,
  }));

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isSuperAdmin: true },
  });
  const isSuperAdmin = user?.isSuperAdmin ?? false;

  const codes = isSuperAdmin
    ? (
        await prisma.permission.findMany({
          where: { applicationId: app.id },
          select: { code: true },
        })
      ).map((p) => p.code)
    : await resolveUserPermissions(userId, app.code);

  // Lengkapi kode dengan labelnya untuk dirender CMS, lalu kelompokkan per modul.
  const catalog = await prisma.permission.findMany({
    where: { applicationId: app.id, code: { in: codes } },
    select: { code: true, name: true, module: true },
    orderBy: [{ module: "asc" }, { code: "asc" }],
  });

  const grouped = new Map<string, { code: string; name: string }[]>();
  for (const { module, ...perm } of catalog) {
    const bucket = grouped.get(module);
    if (bucket) bucket.push(perm);
    else grouped.set(module, [perm]);
  }

  return {
    application: { id: app.id, code: app.code, name: app.name, icon: app.icon },
    isSuperAdmin,
    roles,
    permissions: catalog.map((p) => p.code),
    permissionsByModule: [...grouped].map(([module, permissions]) => ({
      module,
      permissions,
    })),
    total: catalog.length,
  };
}

export async function createPermission(data: CreatePermissionBody) {
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
      "Tidak dapat membuat permission pada aplikasi yang sedang nonaktif",
    );
  }

  const existing = await prisma.permission.findUnique({
    where: { applicationId_code: { applicationId: app.id, code: data.code } },
    select: { id: true },
  });
  if (existing) {
    throw new ConflictError(`Permission "${data.code}" sudah ada di aplikasi ini`);
  }

  const created = await prisma.permission.create({
    data: {
      applicationId: app.id,
      code: data.code,
      name: data.name,
      module: data.module,
    },
    select: PERMISSION_SELECT,
  });

  // Permission baru belum dipegang role mana pun, jadi tidak ada cache yang
  // perlu dibuang — hasil resolve tidak berubah sampai izin ini dipasang.
  return formatPermission(created);
}

// ─── Update ───────────────────────────────────────────────────────────────────
/**
 * Ubah `name` atau `module` saja.
 *
 * Keduanya murni tampilan: `name` adalah label yang dibaca manusia dan `module`
 * hanya pengelompokan. Yang di-cache dan diperiksa guard adalah `code`, jadi
 * perubahan di sini TIDAK perlu membuang cache — sengaja tidak dilakukan agar
 * penyuntingan label tidak memaksa seluruh pengguna aplikasi resolve ulang.
 */
export async function updatePermission(id: string, data: UpdatePermissionBody) {
  const existing = await prisma.permission.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError("Permission", id);

  const updated = await prisma.permission.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.module !== undefined && { module: data.module }),
    },
    select: PERMISSION_SELECT,
  });

  return formatPermission(updated);
}

// ─── Delete ───────────────────────────────────────────────────────────────────
/**
 * Hapus permission secara permanen.
 *
 * Cascade menghapus `role_permissions` (izin tercabut dari semua role) dan
 * men-NULL-kan `menu_items.permission_id` (menu yang tadinya terbatas menjadi
 * terbuka untuk semua orang yang bisa mengakses aplikasinya). Tidak ada
 * pemeriksaan penghalang di sini: mencabut izin adalah aksi yang aman, tidak
 * ada data pengguna yang hilang. Yang WAJIB adalah memberi tahu operator apa
 * yang akan terjadi — jumlah role dan menu terdampak dikembalikan di respons,
 * dan `GET /permissions/:id` sudah menampilkan daftarnya lebih dulu.
 *
 * Cache dibuang sesudah penghapusan: tanpa itu kode yang sudah hilang tetap
 * meloloskan guard sampai TTL 5 menit habis.
 */
export async function deletePermission(id: string) {
  const permission = await prisma.permission.findUnique({
    where: { id },
    select: {
      application: { select: { code: true } },
      _count: { select: { rolePermissions: true, menuItems: true } },
    },
  });
  if (!permission) throw new NotFoundError("Permission", id);

  const { rolePermissions, menuItems } = permission._count;

  await prisma.permission.delete({ where: { id } });

  return {
    revokedFromRoles: rolePermissions,
    unguardedMenus: menuItems,
    cacheCleared: await clearPermissionCaches(permission.application.code),
  };
}
