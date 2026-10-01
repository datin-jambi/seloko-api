/**
 * menus.seeder.ts — Sidebar per aplikasi.
 *
 * Harus jalan SETELAH applications.seeder: menu menautkan diri ke permission
 * dan role yang sudah ada, dicari lewat kode/nama agar menus.json tetap bisa
 * ditulis manusia.
 */
import { prisma } from "./utils.js";
import type { AppMenuDef, MenuDef } from "./types.js";

/**
 * Konteks satu aplikasi, dibawa turun lewat rekursi.
 *
 * Digabung jadi satu objek supaya tanda tangan fungsi rekursif tidak
 * berisi enam parameter yang mudah tertukar urutannya.
 */
interface MenuContext {
  applicationId: string;
  appCode: string;
  /** code permission → id, hanya dari aplikasi ini. */
  permissions: Map<string, string>;
  /** nama role → id, hanya dari aplikasi ini. */
  roles: Map<string, string>;
}

/**
 * Cari id permission atau gagalkan seed.
 *
 * Dibiarkan null berarti menu yang seharusnya terbatas justru tampil untuk
 * semua orang — kegagalan paling berbahaya di struktur ini, jadi harus berisik.
 */
function requirePermissionId(ctx: MenuContext, def: MenuDef): string | null {
  if (!def.permission) return null;

  const id = ctx.permissions.get(def.permission);
  if (!id) {
    throw new Error(
      `Permission "${def.permission}" (menu "${ctx.appCode}/${def.code}") tidak ada di aplikasi ini. Periksa applications.json.`,
    );
  }
  return id;
}

/** Terjemahkan nama role menjadi id, gagalkan seed bila ada yang tak dikenal. */
function requireRoleIds(ctx: MenuContext, def: MenuDef): string[] {
  return (def.roles ?? []).map((roleName) => {
    const id = ctx.roles.get(roleName);
    if (!id) {
      throw new Error(
        `Role "${roleName}" (menu "${ctx.appCode}/${def.code}") tidak ada di aplikasi ini. Periksa roles.json.`,
      );
    }
    return id;
  });
}

/**
 * Samakan pembatas role satu menu dengan isi JSON.
 *
 * Sinkron penuh: role yang dicabut dari JSON harus ikut hilang, kalau tidak
 * pembatas lama tertinggal dan menu tetap tampil diam-diam.
 */
async function syncMenuRoles(menuItemId: string, roleIds: string[]): Promise<void> {
  await prisma.menuRole.deleteMany({
    where: { menuItemId, roleId: { notIn: roleIds } },
  });

  if (roleIds.length > 0) {
    await prisma.menuRole.createMany({
      data: roleIds.map((roleId) => ({ menuItemId, roleId })),
      skipDuplicates: true,
    });
  }
}

/** Kumpulkan seluruh code dalam pohon, termasuk anak di segala kedalaman. */
function collectCodes(items: MenuDef[]): string[] {
  const codes: string[] = [];
  for (const item of items) {
    codes.push(item.code);
    if (item.items) codes.push(...collectCodes(item.items));
  }
  return codes;
}

/** Tulis satu tingkat menu lalu turun ke anak-anaknya. Mengembalikan jumlah baris. */
async function seedLevel(
  items: MenuDef[],
  parentId: string | null,
  ctx: MenuContext,
): Promise<number> {
  let count = 0;

  for (const [position, def] of items.entries()) {
    const data = {
      label: def.label,
      icon: def.icon ?? null,
      path: def.path ?? null,
      isExternal: def.isExternal ?? false,
      // Urutan array = urutan tampil. Dikali 10 agar ada ruang menyelipkan
      // menu lewat CMS tanpa menomori ulang seluruh saudara sekandungnya.
      sortOrder: position * 10,
      isActive: def.isActive ?? true,
      permissionId: requirePermissionId(ctx, def),
      parentId,
    };

    const menu = await prisma.menuItem.upsert({
      where: {
        applicationId_code: { applicationId: ctx.applicationId, code: def.code },
      },
      update: data,
      create: { applicationId: ctx.applicationId, code: def.code, ...data },
      select: { id: true },
    });
    count++;

    await syncMenuRoles(menu.id, requireRoleIds(ctx, def));

    if (def.items?.length) {
      count += await seedLevel(def.items, menu.id, ctx);
    }
  }

  return count;
}

/** Bangun konteks lookup permission & role untuk satu aplikasi. */
async function buildContext(
  applicationId: string,
  appCode: string,
): Promise<MenuContext> {
  const [permissions, roles] = await Promise.all([
    prisma.permission.findMany({
      where: { applicationId },
      select: { id: true, code: true },
    }),
    prisma.role.findMany({
      where: { applicationId },
      select: { id: true, name: true },
    }),
  ]);

  return {
    applicationId,
    appCode,
    permissions: new Map(permissions.map((p) => [p.code, p.id])),
    roles: new Map(roles.map((r) => [r.name, r.id])),
  };
}

export async function seedMenus(appMenus: AppMenuDef[]): Promise<void> {
  for (const def of appMenus) {
    const app = await prisma.application.findUnique({
      where: { code: def.code },
      select: { id: true },
    });

    if (!app) {
      throw new Error(
        `Aplikasi "${def.code}" (menus.json) tidak ada. Periksa applications.json.`,
      );
    }

    // baseUrl & icon aplikasi ikut di-seed dari sini: keduanya bagian dari
    // urusan navigasi, jadi satu berkas saja yang mengaturnya.
    await prisma.application.update({
      where: { id: app.id },
      data: { baseUrl: def.baseUrl ?? null, icon: def.icon ?? null },
    });

    // Menu yang dihapus dari JSON harus hilang dari DB. Dibuang lebih dulu
    // supaya baris lama tidak tertinggal sebagai menu hantu di sidebar.
    await prisma.menuItem.deleteMany({
      where: { applicationId: app.id, code: { notIn: collectCodes(def.items) } },
    });

    const ctx = await buildContext(app.id, def.code);
    const count = await seedLevel(def.items, null, ctx);

    console.log(`✅ ${def.code} — ${count} menu sidebar`);
  }
}
