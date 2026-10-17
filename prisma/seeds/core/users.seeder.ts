/**
 * users.seeder.ts — Akun uji, penugasan role, dan pegawai massal.
 *
 * Bergantung pada applications.seeder: role dicari lewat "<appCode>/<roleName>".
 */
import { prisma, hashPassword, resolveExpiry } from "../shared/utils.js";
import type { BulkDef, RoleRef, UserDef } from "../shared/types.js";

/** Indeks id organisasi per `code`, dipakai penugasan berlingkup OPD. */
export async function buildOrgIndex(): Promise<Map<string, string>> {
  const orgs = await prisma.organization.findMany({
    where: { deletedAt: null },
    select: { id: true, code: true },
  });
  return new Map(orgs.map((o) => [o.code, o.id]));
}

/** Indeks id role per "appCode/roleName" agar tidak query berulang per user. */
export async function buildRoleIndex(): Promise<Map<string, RoleRef>> {
  const roles = await prisma.role.findMany({
    select: {
      id: true,
      name: true,
      applicationId: true,
      application: { select: { code: true } },
    },
  });

  const index = new Map<string, RoleRef>();
  for (const r of roles) {
    index.set(`${r.application.code}/${r.name}`, {
      roleId: r.id,
      applicationId: r.applicationId,
    });
  }
  return index;
}

/**
 * Cari role atau gagalkan seed.
 *
 * Salah tulis nama app/role di JSON harus terlihat — dibiarkan terlewat berarti
 * akun uji berdiri tanpa hak akses yang diniatkan, dan pengujian jadi menipu.
 */
function requireRole(
  roleIndex: Map<string, RoleRef>,
  appCode: string,
  roleName: string,
  context: string,
): RoleRef {
  const target = roleIndex.get(`${appCode}/${roleName}`);
  if (!target) {
    throw new Error(
      `Role "${appCode}/${roleName}" (${context}) tidak ada. Periksa applications.json / roles.json.`,
    );
  }
  return target;
}

/** Tugaskan satu role ke user; idempoten lewat unique (user, app, role). */
async function assignRole(
  userId: string,
  target: RoleRef,
  expiresAt: Date | null,
  organizationIds: string[] = [],
): Promise<void> {
  const uar = await prisma.userAppRole.upsert({
    where: {
      userId_applicationId_roleId: {
        userId,
        applicationId: target.applicationId,
        roleId: target.roleId,
      },
    },
    update: { expiresAt },
    create: {
      userId,
      applicationId: target.applicationId,
      roleId: target.roleId,
      expiresAt,
    },
    select: { id: true },
  });

  // Lingkup OPD disinkron penuh tiap seed: cabut lalu pasang ulang, supaya
  // menghapus `organizationCodes` dari JSON benar-benar mengembalikan penugasan
  // ke "seluruh OPD" alih-alih menyisakan lingkup lama.
  await prisma.userAppRoleOrganization.deleteMany({ where: { userAppRoleId: uar.id } });
  if (organizationIds.length > 0) {
    await prisma.userAppRoleOrganization.createMany({
      data: organizationIds.map((organizationId) => ({ userAppRoleId: uar.id, organizationId })),
      skipDuplicates: true,
    });
  }
}

async function seedUser(
  def: UserDef,
  defaultPassword: string,
  roleIndex: Map<string, RoleRef>,
  orgIndex: Map<string, string>,
): Promise<void> {
  const plain =
    (def.passwordEnv ? process.env[def.passwordEnv] : undefined) ??
    def.password ??
    defaultPassword;

  const accountType = def.accountType ?? "INTERNAL";
  const email = def.email.toLowerCase();
  const username = def.username?.toLowerCase() ?? null;
  const label = username ?? email;

  if (accountType === "INTERNAL" && !username) {
    throw new Error(`Akun INTERNAL "${email}" wajib punya username.`);
  }
  if (accountType === "PUBLIC" && username) {
    throw new Error(`Akun PUBLIC "${email}" tidak boleh punya username — warga login dengan email.`);
  }

  const passwordHash = await hashPassword(plain);

  const profile = {
    username,
    fullName: def.fullName,
    nip: def.nip ?? null,
    phoneNumber: def.phoneNumber ?? null,
    isSuperAdmin: def.isSuperAdmin ?? false,
    isActive: def.isActive ?? true,
    emailVerifiedAt: def.emailVerified ? new Date() : null,
    deletedAt: def.softDeleted ? new Date() : null,
  };

  // Kunci upsert (accountType, email) — bukan username, karena akun warga
  // tidak punya username dan email yang sama boleh dimiliki pegawai sekaligus
  // warga sebagai dua akun berbeda.
  const user = await prisma.user.upsert({
    where: { accountType_email: { accountType, email } },
    // passwordHash hanya di create: seed ulang tidak boleh mengubah kredensial
    // akun yang sudah dipakai untuk pengujian.
    update: profile,
    create: { accountType, email, passwordHash, ...profile },
    select: { id: true },
  });

  for (const assignment of def.roles) {
    const target = requireRole(
      roleIndex,
      assignment.app,
      assignment.role,
      `user "${label}"`,
    );
    const organizationIds = (assignment.organizationCodes ?? []).map((code) => {
      const id = orgIndex.get(code);
      if (!id) {
        throw new Error(
          `Organisasi "${code}" (user "${label}") tidak ada. Periksa core/organizations.json.`,
        );
      }
      return id;
    });
    await assignRole(user.id, target, resolveExpiry(assignment.expiresAt), organizationIds);
  }
}

/** Pegawai massal untuk menguji pagination & pencarian. */
async function seedBulkUsers(
  bulk: BulkDef,
  defaultPassword: string,
  roleIndex: Map<string, RoleRef>,
): Promise<void> {
  const target = requireRole(roleIndex, bulk.app, bulk.role, "pegawai massal");
  const passwordHash = await hashPassword(defaultPassword);

  // Role referensi untuk simulasi pegawai multi-aplikasi (lintas OPD / unit kerja)
  const bapendaEditor = requireRole(roleIndex, "bapenda-profile", "editor", "pegawai multi-app");
  const bapendaVerifikator = requireRole(roleIndex, "bapenda-profile", "verifikator", "pegawai multi-app");
  const bapendaViewer = requireRole(roleIndex, "bapenda-profile", "viewer", "pegawai multi-app");
  const lapakWebAdminOpd = requireRole(roleIndex, "lapak-jambi-web", "admin-opd", "pegawai multi-app");
  const lapakWebManajerOpd = requireRole(roleIndex, "lapak-jambi-web", "manajer-opd", "pegawai multi-app");
  const lapakAppViewer = requireRole(roleIndex, "lapak-jambi-app", "viewer", "pegawai multi-app");

  for (let i = 1; i <= bulk.count; i++) {
    const first = bulk.firstNames[i % bulk.firstNames.length] ?? "Pegawai";
    const last = bulk.lastNames[i % bulk.lastNames.length] ?? "Jambi";
    const seq = String(i).padStart(3, "0");
    const username = `${bulk.usernamePrefix}${seq}`;
    const email = `${username}@${bulk.emailDomain}`;

    const user = await prisma.user.upsert({
      where: { accountType_email: { accountType: "INTERNAL", email } },
      update: {},
      create: {
        accountType: "INTERNAL",
        username,
        email,
        passwordHash,
        fullName: `${first} ${last}`,
        // NIP semu tapi berpola 18 digit seperti NIP ASN asli.
        nip: `1990010120${seq}${String(i % 10)}${seq}`.slice(0, 18),
        phoneNumber: `+62812${String(7000000 + i)}`,
        isActive: i % 7 !== 0, // ±1 dari 7 nonaktif, agar filter isActive ada isinya
        emailVerifiedAt: i % 3 === 0 ? null : new Date(),
      },
      select: { id: true },
    });

    // 1. Role dasar di seloko
    await assignRole(user.id, target, null);

    // 2. Tepat 20 pegawai pertama (pegawai001 s/d pegawai020) memiliki akses ke >1 aplikasi
    if (i <= 20) {
      // Akses ke bapenda-profile untuk semua 20 user ini
      if (i <= 8) {
        await assignRole(user.id, bapendaEditor, null);
      } else if (i <= 14) {
        await assignRole(user.id, bapendaVerifikator, null);
      } else {
        await assignRole(user.id, bapendaViewer, null);
      }

      // Akses tambahan ke lapak-jambi-web untuk 10 user pertama (i <= 10)
      if (i <= 5) {
        await assignRole(user.id, lapakWebManajerOpd, null);
      } else if (i <= 10) {
        await assignRole(user.id, lapakWebAdminOpd, null);
      }

      // Akses tambahan ke lapak-jambi-app untuk 5 user pertama (i <= 5)
      if (i <= 5) {
        await assignRole(user.id, lapakAppViewer, null);
      }

      // Kasus multi-role dalam 1 aplikasi: pegawai001 & pegawai002 merangkap editor + verifikator di bapenda-profile
      if (i <= 2) {
        await assignRole(user.id, bapendaVerifikator, null);
      }
    }
  }

  console.log(`✅ ${bulk.count} pegawai massal (${bulk.app}/${bulk.role}, 20 di antaranya memiliki akses multi-aplikasi)`);
}

/** Seed seluruh akun uji lalu pegawai massal (bila count > 0). */
export async function seedUsers(
  users: UserDef[],
  bulk: BulkDef | undefined,
  defaultPassword: string,
  roleIndex: Map<string, RoleRef>,
  orgIndex: Map<string, string>,
): Promise<void> {
  for (const def of users) {
    await seedUser(def, defaultPassword, roleIndex, orgIndex);
  }
  console.log(`✅ ${users.length} akun uji`);

  if (bulk && bulk.count > 0) {
    await seedBulkUsers(bulk, defaultPassword, roleIndex);
  }
}
