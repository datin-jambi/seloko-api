/**
 * users.seeder.ts — Akun uji, penugasan role, dan pegawai massal.
 *
 * Bergantung pada applications.seeder: role dicari lewat "<appCode>/<roleName>".
 */
import { prisma, hashPassword, resolveExpiry } from "../shared/utils.js";
import type { BulkDef, RoleRef, UserDef } from "../shared/types.js";

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
): Promise<void> {
  await prisma.userAppRole.upsert({
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
  });
}

async function seedUser(
  def: UserDef,
  defaultPassword: string,
  roleIndex: Map<string, RoleRef>,
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
    await assignRole(user.id, target, resolveExpiry(assignment.expiresAt));
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

    await assignRole(user.id, target, null);
  }

  console.log(`✅ ${bulk.count} pegawai massal (${bulk.app}/${bulk.role})`);
}

/** Seed seluruh akun uji lalu pegawai massal (bila count > 0). */
export async function seedUsers(
  users: UserDef[],
  bulk: BulkDef | undefined,
  defaultPassword: string,
  roleIndex: Map<string, RoleRef>,
): Promise<void> {
  for (const def of users) {
    await seedUser(def, defaultPassword, roleIndex);
  }
  console.log(`✅ ${users.length} akun uji`);

  if (bulk && bulk.count > 0) {
    await seedBulkUsers(bulk, defaultPassword, roleIndex);
  }
}
