import { prisma } from "~/config/database.js";
import { invalidateAppPermissionCaches } from "~/config/redis.js";
import { ConflictError, NotFoundError, ForbiddenError } from "~/common/errors/index.js";
import { buildPaginatedResult } from "~/common/types/index.js";
import { APP_CODES } from "~/common/constants/index.js";
import type {
  ListApplicationsQuery,
  CreateApplicationBody,
  UpdateApplicationBody,
} from "./applications.schema.js";

// Dipakai controller saat invalidasi cache gagal (Redis down): perubahan di DB
// sudah permanen, tapi izin lama masih terbaca dari cache sampai TTL habis.
export const CACHE_DEGRADED_NOTE =
  " (cache izin gagal dibersihkan — perubahan efektif penuh dalam ≤5 menit)";

/** Select standar — tidak ada field rahasia, tapi tetap eksplisit. */
const APP_SELECT = {
  id: true,
  code: true,
  name: true,
  description: true,
  baseUrl: true,
  icon: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Hitungan entitas turunan, dipakai CMS untuk memperingatkan sebelum hapus. */
const COUNTS_SELECT = {
  _count: {
    select: {
      permissions: true,
      roles: true,
      menuItems: true,
      userAppRoles: true,
    },
  },
} as const;

type AppRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  baseUrl: string | null;
  icon: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function formatApplication(app: AppRow) {
  return {
    ...app,
    createdAt: app.createdAt.toISOString(),
    updatedAt: app.updatedAt.toISOString(),
  };
}

function formatCounts(counts: {
  permissions: number;
  roles: number;
  menuItems: number;
  userAppRoles: number;
}) {
  return {
    permissions: counts.permissions,
    roles: counts.roles,
    menuItems: counts.menuItems,
    userAppRoles: counts.userAppRoles,
  };
}

/**
 * Aplikasi inti yang tidak boleh dihapus atau dinonaktifkan.
 *
 * `seloko` adalah konsol tempat manajemen ini sendiri dijalankan —
 * mematikannya mengunci semua admin di luar pintu, dan tidak ada endpoint lain
 * untuk menyalakannya kembali.
 */
const PROTECTED_APP_CODES: readonly string[] = [APP_CODES.SELOKO];

function assertNotProtected(code: string, action: string): void {
  if (PROTECTED_APP_CODES.includes(code)) {
    throw new ForbiddenError(
      `Aplikasi inti "${code}" tidak dapat ${action} — konsol manajemen akan terkunci`,
    );
  }
}

// ─── List ─────────────────────────────────────────────────────────────────────
export async function listApplications(query: ListApplicationsQuery) {
  const { page, limit, search, isActive } = query;
  const skip = (page - 1) * limit;

  const where = {
    ...(isActive !== undefined && { isActive: isActive === "true" }),
    ...(search && {
      OR: [
        { code: { contains: search, mode: "insensitive" as const } },
        { name: { contains: search, mode: "insensitive" as const } },
      ],
    }),
  };

  const [apps, total] = await Promise.all([
    prisma.application.findMany({
      where,
      select: { ...APP_SELECT, ...COUNTS_SELECT },
      skip,
      take: limit,
      orderBy: { code: "asc" },
    }),
    prisma.application.count({ where }),
  ]);

  const data = apps.map(({ _count, ...app }) => ({
    ...formatApplication(app),
    counts: formatCounts(_count),
  }));

  return buildPaginatedResult(data, total, page, limit);
}

// ─── Milik Sendiri (launcher super app) ───────────────────────────────────────
/**
 * Aplikasi yang boleh diakses user yang sedang login.
 *
 * Inilah daftar yang mengisi launcher super app, jadi sengaja TIDAK memerlukan
 * permission apa pun: isinya milik si pemanggil sendiri. Yang dikembalikan hanya
 * metadata navigasi (kode, nama, baseUrl, icon) plus nama role — bukan data
 * internal aplikasinya — sehingga tidak melanggar isolasi antar aplikasi
 * meskipun token diterbitkan untuk satu appCode saja.
 *
 * Aturan sama dengan assertUserCanAccessApp, supaya daftar ini tidak pernah
 * menampilkan aplikasi yang justru menolak saat diklik:
 *   - aplikasi harus aktif
 *   - role harus aktif
 *   - penugasan belum kedaluwarsa
 *
 * Super admin memang lintas-aplikasi, jadi menerima seluruh aplikasi aktif
 * dengan `roles` kosong — tidak ada role yang perlu disebut saat semuanya
 * di-bypass.
 */
export async function listMyApplications(userId: string, isSuperAdmin: boolean) {
  // Hanya field navigasi — selaras dengan MyApplicationShape.
  const select = {
    id: true,
    code: true,
    name: true,
    description: true,
    baseUrl: true,
    icon: true,
  } as const;

  if (isSuperAdmin) {
    const apps = await prisma.application.findMany({
      where: { isActive: true },
      select,
      orderBy: { code: "asc" },
    });

    return apps.map((app) => ({ ...app, roles: [] as string[], expiresAt: null }));
  }

  const assignments = await prisma.userAppRole.findMany({
    where: {
      userId,
      application: { isActive: true },
      role: { isActive: true },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: {
      expiresAt: true,
      role: { select: { name: true } },
      application: { select },
    },
    orderBy: { application: { code: "asc" } },
  });

  // Satu user bisa punya beberapa role di satu aplikasi — kelompokkan agar
  // aplikasinya tampil sekali saja di launcher, dengan role digabung.
  type Entry = {
    app: (typeof assignments)[number]["application"];
    roles: string[];
    expiresAt: Date | null;
  };
  const byApp = new Map<string, Entry>();

  for (const { application, role, expiresAt } of assignments) {
    const entry = byApp.get(application.id);

    if (!entry) {
      byApp.set(application.id, { app: application, roles: [role.name], expiresAt });
      continue;
    }

    entry.roles.push(role.name);

    // Penugasan permanen (null) mengalahkan yang berbatas waktu; di antara yang
    // berbatas waktu, yang paling lama menentukan kapan akses benar-benar hilang.
    if (entry.expiresAt !== null) {
      entry.expiresAt =
        expiresAt === null ? null : new Date(Math.max(+entry.expiresAt, +expiresAt));
    }
  }

  return [...byApp.values()].map(({ app, roles, expiresAt }) => ({
    ...app,
    roles,
    expiresAt: expiresAt?.toISOString() ?? null,
  }));
}

// ─── Get By ID ────────────────────────────────────────────────────────────────
/**
 * Detail aplikasi beserta role dan permission-nya.
 *
 * Permission dikelompokkan per `module` di sini, bukan di front-end: kolom itu
 * memang hanya label pengelompokan untuk CMS, jadi bentuk responsnya sekalian
 * mengikuti cara tampilnya.
 */
export async function getApplicationById(id: string) {
  const app = await prisma.application.findUnique({
    where: { id },
    select: {
      ...APP_SELECT,
      ...COUNTS_SELECT,
      roles: {
        select: {
          id: true,
          name: true,
          description: true,
          isSystemRole: true,
          isActive: true,
          _count: { select: { rolePermissions: true } },
        },
        orderBy: { name: "asc" },
      },
      permissions: {
        select: { id: true, code: true, name: true, module: true },
        orderBy: [{ module: "asc" }, { code: "asc" }],
      },
    },
  });

  if (!app) throw new NotFoundError("Aplikasi", id);

  const { _count, roles, permissions, ...rest } = app;

  const grouped = new Map<string, { id: string; code: string; name: string }[]>();
  for (const { module, ...perm } of permissions) {
    const bucket = grouped.get(module);
    if (bucket) bucket.push(perm);
    else grouped.set(module, [perm]);
  }

  return {
    ...formatApplication(rest),
    counts: formatCounts(_count),
    roles: roles.map(({ _count: roleCount, ...role }) => ({
      ...role,
      permissionCount: roleCount.rolePermissions,
    })),
    permissionsByModule: [...grouped].map(([module, perms]) => ({
      module,
      permissions: perms,
    })),
  };
}

// ─── Create ───────────────────────────────────────────────────────────────────
/**
 * Daftarkan aplikasi baru.
 *
 * Aplikasi lahir tanpa permission, role, maupun menu — ketiganya ditambahkan
 * lewat endpointnya sendiri. Tanpa role, belum ada siapa pun yang bisa login ke
 * aplikasi ini (assertUserCanAccessApp menolak), dan itu memang aman.
 */
export async function createApplication(data: CreateApplicationBody) {
  const existing = await prisma.application.findUnique({
    where: { code: data.code },
    select: { id: true },
  });

  if (existing) {
    throw new ConflictError(`Kode aplikasi "${data.code}" sudah digunakan`);
  }

  const app = await prisma.application.create({
    data: {
      code: data.code,
      name: data.name,
      description: data.description ?? null,
      baseUrl: data.baseUrl ?? null,
      icon: data.icon ?? null,
      isActive: data.isActive,
    },
    select: APP_SELECT,
  });

  return formatApplication(app);
}

// ─── Update ───────────────────────────────────────────────────────────────────
/**
 * Update metadata aplikasi. `code` sengaja tidak termasuk — lihat catatan pada
 * UpdateApplicationBodySchema.
 */
export async function updateApplication(id: string, data: UpdateApplicationBody) {
  const exists = await prisma.application.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) throw new NotFoundError("Aplikasi", id);

  const app = await prisma.application.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.baseUrl !== undefined && { baseUrl: data.baseUrl }),
      ...(data.icon !== undefined && { icon: data.icon }),
    },
    select: APP_SELECT,
  });

  return formatApplication(app);
}

// ─── Set Active Status ────────────────────────────────────────────────────────
/**
 * Aktifkan atau matikan aplikasi.
 *
 * Mematikan aplikasi langsung menutup pintu: assertUserCanAccessApp menolak
 * login dan refresh untuk aplikasi non-aktif. Refresh token yang sudah terbit
 * ikut dicabut supaya sesi berjalan tidak bisa diperpanjang, dan cache
 * permission se-aplikasi dibuang agar access token yang masih hidup tidak
 * menikmati izin dari cache selama TTL.
 */
export async function setApplicationActiveStatus(id: string, isActive: boolean) {
  const app = await prisma.application.findUnique({
    where: { id },
    select: { code: true },
  });
  if (!app) throw new NotFoundError("Aplikasi", id);

  if (!isActive) assertNotProtected(app.code, "dinonaktifkan");

  await prisma.application.update({ where: { id }, data: { isActive } });

  let cacheCleared = true;
  if (!isActive) {
    await prisma.refreshToken.updateMany({
      where: { appCode: app.code, isRevoked: false },
      data: { isRevoked: true },
    });
    cacheCleared = await invalidateAppPermissionCaches(app.code);
  }

  return { isActive, cacheCleared };
}

// ─── Delete ───────────────────────────────────────────────────────────────────
/**
 * Hapus aplikasi secara permanen.
 *
 * Tidak ada soft delete di tabel ini: `applications.code` adalah kunci yang
 * dipakai header X-App-Code, dan baris yang "terhapus tapi masih ada" membuat
 * pertanyaan "apakah kode ini terpakai" punya dua jawaban.
 *
 * Ditolak selama masih ada penugasan role pengguna. Cascade akan menghapusnya
 * diam-diam beserta seluruh permission, role, dan menu — kehilangan yang tidak
 * bisa dibatalkan, jadi operator harus mencabut penugasannya lebih dulu secara
 * sadar.
 */
export async function deleteApplication(id: string) {
  const app = await prisma.application.findUnique({
    where: { id },
    select: { code: true, _count: { select: { userAppRoles: true } } },
  });
  if (!app) throw new NotFoundError("Aplikasi", id);

  assertNotProtected(app.code, "dihapus");

  if (app._count.userAppRoles > 0) {
    throw new ConflictError(
      `Aplikasi masih memiliki ${app._count.userAppRoles} penugasan role pengguna. ` +
        "Cabut seluruh penugasan lebih dulu sebelum menghapus.",
    );
  }

  await prisma.refreshToken.updateMany({
    where: { appCode: app.code, isRevoked: false },
    data: { isRevoked: true },
  });

  // Permission, role, dan menu ikut terhapus lewat onDelete: Cascade.
  await prisma.application.delete({ where: { id } });

  return { cacheCleared: await invalidateAppPermissionCaches(app.code) };
}
