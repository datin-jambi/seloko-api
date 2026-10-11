import { prisma } from "~/config/database.js";
import { invalidateAppPermissionCaches } from "~/config/redis.js";
import { ConflictError, NotFoundError, ForbiddenError, BadRequestError } from "~/common/errors/index.js";
import { buildPaginatedResult } from "~/common/types/index.js";
import { APP_CODES } from "~/common/constants/index.js";
import { ImageKitService } from "~/common/services/storage/imagekit.service.js";
import type {
  ListApplicationsQuery,
  CreateApplicationBody,
  UpdateApplicationBody,
  ApplicationSettings,
} from "./applications.schema.js";
import type { Prisma } from "@prisma/client";

// Dipakai controller saat invalidasi cache gagal (Redis down): perubahan di DB
// sudah permanen, tapi izin lama masih terbaca dari cache sampai TTL habis.
export const CACHE_DEGRADED_NOTE =
  " (cache izin gagal dibersihkan — perubahan efektif penuh dalam ≤5 menit)";

/** Select standar — tidak ada field rahasia, tapi tetap eksplisit. */
const APP_SELECT = {
  id: true,
  code: true,
  name: true,
  tagline: true,
  description: true,
  baseUrl: true,
  icon: true,
  audience: true,
  logoUrl: true,
  logoFileId: true,
  logoDarkUrl: true,
  logoDarkFileId: true,
  faviconUrl: true,
  faviconFileId: true,
  ogImageUrl: true,
  ogImageFileId: true,
  settings: true,
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
  tagline: string | null;
  description: string | null;
  baseUrl: string | null;
  icon: string | null;
  audience: "INTERNAL" | "PUBLIC";
  logoUrl: string | null;
  logoFileId: string | null;
  logoDarkUrl: string | null;
  logoDarkFileId: string | null;
  faviconUrl: string | null;
  faviconFileId: string | null;
  ogImageUrl: string | null;
  ogImageFileId: string | null;
  settings: Prisma.JsonValue;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Validasi toleran berkas media ImageKit untuk aplikasi.
 */
async function validateImageKitMedia(
  fileId: string | null | undefined,
  label: string,
  maxMb = 2,
  minDimension = 32,
): Promise<void> {
  if (!fileId || !fileId.trim()) return;

  const file = await ImageKitService.getFileDetails(fileId);
  if (!file) {
    throw new BadRequestError(`Berkas ${label} (ID: '${fileId}') tidak ditemukan di ImageKit.`);
  }

  const maxBytes = maxMb * 1024 * 1024;
  if (file.size > maxBytes) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
    throw new BadRequestError(
      `Ukuran berkas ${label} terlalu besar (${sizeMb} MB). Maksimal yang diizinkan adalah ${maxMb} MB.`,
    );
  }

  if (file.width !== undefined && file.height !== undefined) {
    if (file.width < minDimension || file.height < minDimension) {
      throw new BadRequestError(
        `Dimensi berkas ${label} terlalu kecil (${file.width}x${file.height} px). Minimal ${minDimension}x${minDimension} px.`,
      );
    }
  }
}

function formatApplication(app: AppRow) {
  return {
    ...app,
    // Kolom JSONB bertipe JsonValue; isinya selalu lewat ApplicationSettingsSchema
    // saat ditulis, jadi aman dipersempit di sini.
    settings: (app.settings ?? {}) as ApplicationSettings,
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
  const { page, limit, search, audience, isActive } = query;
  const skip = (page - 1) * limit;

  const where = {
    ...(audience !== undefined && { audience }),
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
 *
 * Untuk akun PUBLIC daftar ini adalah aplikasi tempat warga sudah mendaftar;
 * untuk akun INTERNAL, aplikasi yang bisa ia kelola dari seloko.
 */
export async function listMyApplications(userId: string, isSuperAdmin: boolean) {
  // Hanya field navigasi — selaras dengan MyApplicationShape.
  const select = {
    id: true,
    code: true,
    name: true,
    tagline: true,
    description: true,
    baseUrl: true,
    icon: true,
    logoUrl: true,
    logoDarkUrl: true,
    faviconUrl: true,
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
          audience: true,
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

  if (data.isActive) {
    if (data.logoFileId) await validateImageKitMedia(data.logoFileId, "logo", 2, 64);
    if (data.logoDarkFileId) await validateImageKitMedia(data.logoDarkFileId, "logo tema gelap", 2, 64);
    if (data.faviconFileId) await validateImageKitMedia(data.faviconFileId, "favicon", 1, 16);
    if (data.ogImageFileId) await validateImageKitMedia(data.ogImageFileId, "Open Graph image", 3, 200);
  }

  const app = await prisma.application.create({
    data: {
      code: data.code,
      name: data.name,
      audience: data.audience,
      tagline: data.tagline ?? null,
      description: data.description ?? null,
      baseUrl: data.baseUrl ?? null,
      icon: data.icon ?? null,
      logoUrl: data.logoUrl ?? null,
      logoFileId: data.logoFileId ?? null,
      logoDarkUrl: data.logoDarkUrl ?? null,
      logoDarkFileId: data.logoDarkFileId ?? null,
      faviconUrl: data.faviconUrl ?? null,
      faviconFileId: data.faviconFileId ?? null,
      ogImageUrl: data.ogImageUrl ?? null,
      ogImageFileId: data.ogImageFileId ?? null,
      settings: (data.settings ?? {}) as Prisma.InputJsonObject,
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
  const existing = await prisma.application.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      isActive: true,
      logoFileId: true,
      logoDarkFileId: true,
      faviconFileId: true,
      ogImageFileId: true,
    },
  });
  if (!existing) throw new NotFoundError("Aplikasi", id);

  const willBeActive =
    data.isActive !== undefined ? data.isActive : existing.isActive;
  const targetLogoFileId =
    data.logoFileId !== undefined ? data.logoFileId : existing.logoFileId;
  const targetLogoDarkFileId =
    data.logoDarkFileId !== undefined ? data.logoDarkFileId : existing.logoDarkFileId;
  const targetFaviconFileId =
    data.faviconFileId !== undefined ? data.faviconFileId : existing.faviconFileId;
  const targetOgImageFileId =
    data.ogImageFileId !== undefined ? data.ogImageFileId : existing.ogImageFileId;

  // Jika aplikasi berstatus aktif (atau diubah menjadi aktif), validasi berkas di ImageKit
  if (willBeActive) {
    if (
      targetLogoFileId &&
      (data.isActive === true || data.logoFileId !== undefined)
    ) {
      await validateImageKitMedia(targetLogoFileId, "logo", 2, 64);
    }
    if (
      targetLogoDarkFileId &&
      (data.isActive === true || data.logoDarkFileId !== undefined)
    ) {
      await validateImageKitMedia(targetLogoDarkFileId, "logo tema gelap", 2, 64);
    }
    if (
      targetFaviconFileId &&
      (data.isActive === true || data.faviconFileId !== undefined)
    ) {
      await validateImageKitMedia(targetFaviconFileId, "favicon", 1, 16);
    }
    if (
      targetOgImageFileId &&
      (data.isActive === true || data.ogImageFileId !== undefined)
    ) {
      await validateImageKitMedia(targetOgImageFileId, "Open Graph image", 3, 200);
    }
  }

  // Jika dinonaktifkan via updateApplication, pastikan bukan aplikasi terlindungi (seloko)
  if (data.isActive !== undefined && !data.isActive) {
    assertNotProtected(existing.code, "dinonaktifkan");
  }

  // Auto-cleanup berkas lama di ImageKit jika diganti
  const cleanupTasks: string[] = [];
  if (existing.logoFileId && data.logoFileId && existing.logoFileId !== data.logoFileId) {
    cleanupTasks.push(existing.logoFileId);
  }
  if (existing.logoDarkFileId && data.logoDarkFileId && existing.logoDarkFileId !== data.logoDarkFileId) {
    cleanupTasks.push(existing.logoDarkFileId);
  }
  if (existing.faviconFileId && data.faviconFileId && existing.faviconFileId !== data.faviconFileId) {
    cleanupTasks.push(existing.faviconFileId);
  }
  if (existing.ogImageFileId && data.ogImageFileId && existing.ogImageFileId !== data.ogImageFileId) {
    cleanupTasks.push(existing.ogImageFileId);
  }
  for (const oldFileId of cleanupTasks) {
    ImageKitService.deleteFile(oldFileId).catch((err) => {
      console.error("[ApplicationsService] Gagal menghapus media lama di ImageKit:", err);
    });
  }

  const app = await prisma.application.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.tagline !== undefined && { tagline: data.tagline }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.baseUrl !== undefined && { baseUrl: data.baseUrl }),
      ...(data.icon !== undefined && { icon: data.icon }),
      ...(data.logoUrl !== undefined && { logoUrl: data.logoUrl }),
      ...(data.logoFileId !== undefined && { logoFileId: data.logoFileId }),
      ...(data.logoDarkUrl !== undefined && { logoDarkUrl: data.logoDarkUrl }),
      ...(data.logoDarkFileId !== undefined && { logoDarkFileId: data.logoDarkFileId }),
      ...(data.faviconUrl !== undefined && { faviconUrl: data.faviconUrl }),
      ...(data.faviconFileId !== undefined && { faviconFileId: data.faviconFileId }),
      ...(data.ogImageUrl !== undefined && { ogImageUrl: data.ogImageUrl }),
      ...(data.ogImageFileId !== undefined && { ogImageFileId: data.ogImageFileId }),
      ...(data.settings !== undefined && { settings: data.settings as Prisma.InputJsonObject }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
    select: APP_SELECT,
  });

  if (data.isActive === false && existing.isActive === true) {
    await prisma.refreshToken.updateMany({
      where: { appCode: existing.code, isRevoked: false },
      data: { isRevoked: true },
    });
    await invalidateAppPermissionCaches(existing.code);
  }

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
    select: {
      code: true,
      logoFileId: true,
      logoDarkFileId: true,
      faviconFileId: true,
      ogImageFileId: true,
    },
  });
  if (!app) throw new NotFoundError("Aplikasi", id);

  if (!isActive) {
    assertNotProtected(app.code, "dinonaktifkan");
  } else {
    // Validasi berkas media ImageKit sebelum mengaktifkan aplikasi
    if (app.logoFileId) await validateImageKitMedia(app.logoFileId, "logo", 2, 64);
    if (app.logoDarkFileId) await validateImageKitMedia(app.logoDarkFileId, "logo tema gelap", 2, 64);
    if (app.faviconFileId) await validateImageKitMedia(app.faviconFileId, "favicon", 1, 16);
    if (app.ogImageFileId) await validateImageKitMedia(app.ogImageFileId, "Open Graph image", 3, 200);
  }

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

// ─── Public Config ────────────────────────────────────────────────────────────
/**
 * Mengambil konfigurasi publik aplikasi (branding, kontak, SEO, status features)
 * berdasarkan kode aplikasi (mis. 'bapenda-profile', 'lapak-jambi-web').
 * Dapat diakses tanpa login oleh front-end client.
 */
export async function getPublicAppConfig(code: string) {
  const app = await prisma.application.findUnique({
    where: { code, isActive: true },
    select: APP_SELECT,
  });

  if (!app) {
    throw new NotFoundError("Aplikasi", code);
  }

  const formatted = formatApplication(app);

  return {
    code: formatted.code,
    name: formatted.name,
    tagline: formatted.tagline,
    description: formatted.description,
    baseUrl: formatted.baseUrl,
    icon: formatted.icon,
    audience: formatted.audience,
    logoUrl: formatted.logoUrl,
    logoDarkUrl: formatted.logoDarkUrl,
    faviconUrl: formatted.faviconUrl,
    ogImageUrl: formatted.ogImageUrl,
    settings: formatted.settings,
  };
}
