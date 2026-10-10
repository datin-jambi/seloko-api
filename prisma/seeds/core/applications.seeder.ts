/**
 * applications.seeder.ts — Aplikasi, permission, dan role bawaan.
 *
 * Harus jalan PERTAMA: user dan menu menautkan diri ke baris yang dibuat di
 * sini lewat kode/nama, bukan id.
 */
import { prisma, expandActions } from "../shared/utils.js";
import type { Prisma } from "@prisma/client";
import type { ApplicationDef, Audience, RoleDef } from "../shared/types.js";

/**
 * Buat/perbarui permission satu aplikasi dari daftar PermissionDef.
 * Kode tersusun `<entity>:<action>`, nama dari `<label aksi> <label entitas>`.
 */
async function syncPermissions(
  def: ApplicationDef,
  applicationId: string,
  actionLabels: Record<string, string>,
  actionGroups: Record<string, string[]>,
): Promise<number> {
  let count = 0;

  for (const perm of def.permissions) {
    for (const action of expandActions(perm.actions, actionGroups)) {
      const code = `${perm.entity}:${action}`;
      const name = `${actionLabels[action] ?? action} ${perm.label}`;

      await prisma.permission.upsert({
        where: { applicationId_code: { applicationId, code } },
        update: { name, module: perm.module },
        create: { applicationId, code, name, module: perm.module },
      });
      count++;
    }
  }

  return count;
}

/**
 * Buat/perbarui role satu aplikasi beserta pemetaan permission-nya.
 * `allowedActions: null` berarti role menerima seluruh permission aplikasi.
 */
async function syncRoles(
  appCode: string,
  applicationId: string,
  appAudience: Audience,
  roles: RoleDef[],
  actionGroups: Record<string, string[]>,
): Promise<number> {
  const allPermissions = await prisma.permission.findMany({
    where: { applicationId },
    select: { id: true, code: true },
  });

  const applicable = roles.filter((r) => {
    const listed = !r.apps || r.apps.length === 0 || r.apps.includes(appCode);
    // Role PUBLIC tak berguna di aplikasi INTERNAL — warga tak pernah login ke
    // sana. Diabaikan diam-diam untuk role "semua aplikasi"; bila disebut
    // eksplisit lewat `apps`, itu salah konfigurasi dan harus berisik.
    if (listed && r.audience === "PUBLIC" && appAudience === "INTERNAL") {
      if (r.apps?.includes(appCode)) {
        throw new Error(`Role PUBLIC "${r.name}" tidak boleh dibuat di aplikasi INTERNAL "${appCode}"`);
      }
      return false;
    }
    return listed;
  });

  for (const roleDef of applicable) {
    const audience = roleDef.audience ?? "INTERNAL";
    const role = await prisma.role.upsert({
      where: { applicationId_name: { applicationId, name: roleDef.name } },
      update: { description: roleDef.description, isActive: roleDef.isActive ?? true, audience },
      create: {
        applicationId,
        name: roleDef.name,
        description: roleDef.description,
        audience,
        isSystemRole: true,
        isActive: roleDef.isActive ?? true,
      },
    });

    const allowed =
      roleDef.allowedActions === null
        ? null
        : new Set(expandActions(roleDef.allowedActions, actionGroups));

    const granted = allPermissions.filter((p) => {
      if (allowed === null) return true;
      return allowed.has(p.code.split(":")[1] ?? "");
    });

    // Sinkron penuh: cabut yang tidak lagi berlaku, lalu tambahkan sisanya.
    // Tanpa deleteMany, permission yang dihapus dari JSON akan tertinggal.
    await prisma.rolePermission.deleteMany({
      where: { roleId: role.id, permissionId: { notIn: granted.map((p) => p.id) } },
    });
    await prisma.rolePermission.createMany({
      data: granted.map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });
  }

  return applicable.length;
}

export async function seedApplications(
  apps: ApplicationDef[],
  actionLabels: Record<string, string>,
  actionGroups: Record<string, string[]>,
  roles: RoleDef[],
): Promise<void> {
  for (const def of apps) {
    const audience = def.audience ?? "INTERNAL";
    const profile = {
      name: def.name,
      description: def.description ?? null,
      isActive: def.isActive ?? true,
      audience,
      logoUrl: def.logoUrl ?? null,
      settings: (def.settings ?? {}) as Prisma.InputJsonObject,
    };
    // baseUrl dan icon TIDAK disetel di sini — keduanya urusan navigasi dan
    // dikelola menus.json, supaya satu berkas saja yang mengatur sidebar.
    // `audience` ikut di update: lewat API ia final, tapi seeder adalah sumber
    // kebenaran lingkungan development dan boleh memperbaikinya.
    const app = await prisma.application.upsert({
      where: { code: def.code },
      update: profile,
      create: { code: def.code, ...profile },
      select: { id: true },
    });

    const permissionCount = await syncPermissions(
      def,
      app.id,
      actionLabels,
      actionGroups,
    );
    const roleCount = await syncRoles(def.code, app.id, audience, roles, actionGroups);

    const status = def.isActive === false ? " (NONAKTIF)" : "";
    console.log(
      `✅ ${def.code} [${audience}]${status} — ${permissionCount} permission, ${roleCount} role`,
    );
  }
}
