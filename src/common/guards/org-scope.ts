/**
 * org-scope.ts — Lingkup OPD sebuah penugasan role.
 *
 * Sebagian pengguna hanya boleh menyentuh data OPD tertentu (admin OPD di
 * Lapak: hanya aset & pesanan OPD-nya). Penugasan role bisa dibatasi ke
 * beberapa OPD lewat `user_app_role_organizations`:
 *   - ADA baris  → penugasan hanya berlaku untuk OPD tersebut.
 *   - TANPA baris → penugasan berlaku untuk SELURUH OPD (level Bapenda).
 *
 * Bagian murni (`buildOrgScope`, `isOrgInScope`) dipisah supaya aturannya bisa
 * diuji tanpa DB — lihat org-scope.check.ts.
 */
import { prisma } from "~/config/database.js";
import { ForbiddenError } from "~/common/errors/index.js";

/** Hasil gabungan seluruh penugasan user pada satu aplikasi untuk satu izin. */
export type OrgScope =
  /** Boleh menyentuh semua OPD — penugasan tanpa batas, atau super admin. */
  | { all: true }
  /** Hanya OPD terdaftar. `organizationIds` tidak pernah kosong di sini. */
  | { all: false; organizationIds: string[] };

/** Satu penugasan yang sudah dinilai: memberi izin ini atau tidak. */
export interface ScopedAssignment {
  /** Penugasan ini memuat permission yang diminta. */
  grants: boolean;
  /** OPD yang dibatasi untuk penugasan ini; kosong = seluruh OPD. */
  organizationIds: string[];
}

/**
 * Gabungkan seluruh penugasan menjadi satu lingkup efektif.
 *
 * Penugasan tanpa batas OPD membuat hasilnya `all` — hak akses bersifat union,
 * bukan saling menimpa: kalau satu role memberi seluruh OPD, batasan role lain
 * tidak boleh menyempitkannya.
 */
export function buildOrgScope(assignments: ScopedAssignment[]): OrgScope {
  const granting = assignments.filter((a) => a.grants);

  if (granting.some((a) => a.organizationIds.length === 0)) return { all: true };

  const ids = new Set<string>();
  for (const a of granting) {
    for (const id of a.organizationIds) ids.add(id);
  }

  // Tidak ada penugasan yang memberi izin: lingkup kosong. Pemanggil yang
  // memutuskan menolak (403) — di sini cukup kembalikan daftar kosong.
  return { all: false, organizationIds: Array.from(ids) };
}

/** Apakah `organizationId` boleh disentuh pada lingkup ini? */
export function isOrgInScope(scope: OrgScope, organizationId: string): boolean {
  if (scope.all) return true;
  return scope.organizationIds.includes(organizationId);
}

/**
 * Batas query Prisma untuk lingkup ini.
 *
 * `all` → `undefined` supaya pemanggil tidak menambahkan filter sama sekali.
 * Terbatas → `{ in: [...] }`. Lingkup kosong juga mengembalikan `{ in: [] }`,
 * yang di Prisma berarti "tidak ada baris" — gagal tertutup, bukan terbuka.
 */
export function orgScopeFilter(scope: OrgScope): { in: string[] } | undefined {
  if (scope.all) return undefined;
  return { in: scope.organizationIds };
}

/**
 * Lingkup efektif seorang user untuk satu izin pada satu aplikasi.
 *
 * Super admin tidak dibatasi. Selain itu, hanya penugasan yang aktif (role
 * aktif, belum kedaluwarsa, aplikasi aktif) yang dihitung — sama seperti
 * resolver izin, supaya keduanya tidak pernah berbeda kesimpulan.
 */
export async function resolveOrgScope(
  userId: string,
  appCode: string,
  permissionCode: string,
  isSuperAdmin = false,
): Promise<OrgScope> {
  if (isSuperAdmin) return { all: true };

  const assignments = await prisma.userAppRole.findMany({
    where: {
      userId,
      application: { code: appCode, isActive: true },
      role: { isActive: true },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: {
      role: {
        select: {
          rolePermissions: {
            where: { permission: { code: permissionCode } },
            select: { permissionId: true },
          },
        },
      },
      organizations: { select: { organizationId: true } },
    },
  });

  return buildOrgScope(
    assignments.map((a) => ({
      grants: a.role.rolePermissions.length > 0,
      organizationIds: a.organizations.map((o) => o.organizationId),
    })),
  );
}

/** Tolak bila organisasi di luar lingkup — dipakai sebelum mutasi per OPD. */
export function assertOrgInScope(scope: OrgScope, organizationId: string): void {
  if (!isOrgInScope(scope, organizationId)) {
    throw new ForbiddenError("Anda tidak memiliki akses ke data OPD ini");
  }
}
