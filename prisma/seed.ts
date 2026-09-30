/**
 * prisma/seed.ts — Loader seeder.
 *
 * Skrip ini SENGAJA tidak memuat data apa pun. Seluruh data ada di
 * prisma/seed-data/*.json agar bisa diubah tanpa menyentuh kode:
 *   applications.json — aplikasi + permission per aplikasi
 *   roles.json        — label aksi, grup aksi, role bawaan
 *   users.json        — akun uji + penugasan role + pegawai massal
 *
 * Idempoten (semua upsert) — aman dijalankan berulang.
 *   npm run db:seed              → seed/perbarui
 *   npm run db:seed -- --reset   → kosongkan tabel RBAC lebih dulu
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";

const prisma = new PrismaClient();
const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "seed-data");

// ─── Bentuk File JSON ─────────────────────────────────────────────────────────
interface PermissionDef {
  module: string;
  entity: string;
  label: string;
  /** Aksi tunggal ("read") atau nama grup dari roles.json ("content"). */
  actions: string[];
}

interface ApplicationDef {
  code: string;
  name: string;
  description?: string;
  isActive?: boolean;
  permissions: PermissionDef[];
}

interface RoleDef {
  name: string;
  description: string;
  /** null = seluruh permission aplikasi. */
  allowedActions: string[] | null;
  /** Kode aplikasi tempat role dibuat. Absen = semua aplikasi. */
  apps?: string[];
  isActive?: boolean;
}

interface RoleAssignmentDef {
  app: string;
  role: string;
  /** null/absen = permanen, "expired", "+30d", atau ISO date. */
  expiresAt?: string | null;
}

interface UserDef {
  username: string;
  email: string;
  fullName: string;
  nip?: string;
  phoneNumber?: string;
  isSuperAdmin?: boolean;
  isActive?: boolean;
  emailVerified?: boolean;
  softDeleted?: boolean;
  /** Password khusus; bila absen memakai defaultPassword. */
  password?: string;
  /** Nama env var yang menimpa password bila diset. */
  passwordEnv?: string;
  roles: RoleAssignmentDef[];
}

interface BulkDef {
  count: number;
  usernamePrefix: string;
  emailDomain: string;
  app: string;
  role: string;
  firstNames: string[];
  lastNames: string[];
}

// ─── Baca JSON ────────────────────────────────────────────────────────────────
async function loadJson<T>(fileName: string): Promise<T> {
  // readFile + JSON.parse, bukan `import ... with { type: "json" }`: import
  // attributes masih experimental di Node dan mencetak warning tiap run.
  const raw = await readFile(join(DATA_DIR, fileName), "utf-8");
  return JSON.parse(raw) as T;
}

// ─── Utils ────────────────────────────────────────────────────────────────────
/** Ratakan campuran nama grup dan aksi tunggal menjadi daftar aksi unik. */
function expandActions(
  actions: string[],
  groups: Record<string, string[]>,
): string[] {
  const out = new Set<string>();
  for (const item of actions) {
    for (const action of groups[item] ?? [item]) out.add(action);
  }
  return [...out];
}

/**
 * "expired" → 1 hari lalu, "+30d"/"+12h" → relatif dari sekarang,
 * sisanya diperlakukan sebagai ISO date. null bila permanen.
 */
function resolveExpiry(value: string | null | undefined): Date | null {
  if (!value) return null;
  if (value === "expired") return new Date(Date.now() - 86_400_000);

  const relative = /^\+(\d+)([dhm])$/.exec(value);
  if (relative) {
    const amount = Number(relative[1]);
    const unitMs = { d: 86_400_000, h: 3_600_000, m: 60_000 }[relative[2] as "d" | "h" | "m"];
    return new Date(Date.now() + amount * unitMs);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`expiresAt tidak dikenali: "${value}"`);
  }
  return parsed;
}

/**
 * Hash argon2 dengan cache per-password.
 *
 * Parameter sama dengan users.service.ts (memoryCost 64MB) — sekitar 100ms
 * per hash, jadi 60 akun dengan password yang sama akan memakan menit-menit
 * kalau di-hash satu per satu.
 */
const hashCache = new Map<string, string>();
async function hashPassword(plain: string): Promise<string> {
  const cached = hashCache.get(plain);
  if (cached) return cached;

  const hash = await argon2.hash(plain, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
  hashCache.set(plain, hash);
  return hash;
}

// ─── Reset ────────────────────────────────────────────────────────────────────
/**
 * Kosongkan tabel RBAC. Urutan mengikuti arah foreign key: anak lebih dulu,
 * meski onDelete Cascade sudah terpasang — supaya tidak bergantung padanya.
 */
async function resetTables(): Promise<void> {
  console.log("🧹 --reset: mengosongkan tabel RBAC…");
  await prisma.auditLog.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.userAppRole.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.role.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.user.deleteMany();
  await prisma.application.deleteMany();
}

// ─── Seed: Aplikasi, Permission, Role ─────────────────────────────────────────
async function seedApplications(
  apps: ApplicationDef[],
  actionLabels: Record<string, string>,
  actionGroups: Record<string, string[]>,
  roles: RoleDef[],
): Promise<void> {
  for (const def of apps) {
    const app = await prisma.application.upsert({
      where: { code: def.code },
      update: {
        name: def.name,
        description: def.description ?? null,
        isActive: def.isActive ?? true,
      },
      create: {
        code: def.code,
        name: def.name,
        description: def.description ?? null,
        isActive: def.isActive ?? true,
      },
    });

    // ── Permission ──────────────────────────────────────────────────────────
    let permissionCount = 0;
    for (const perm of def.permissions) {
      for (const action of expandActions(perm.actions, actionGroups)) {
        const code = `${perm.entity}:${action}`;
        const name = `${actionLabels[action] ?? action} ${perm.label}`;
        await prisma.permission.upsert({
          where: { applicationId_code: { applicationId: app.id, code } },
          update: { name, module: perm.module },
          create: { applicationId: app.id, code, name, module: perm.module },
        });
        permissionCount++;
      }
    }

    // ── Role + pemetaan permission ──────────────────────────────────────────
    const allPermissions = await prisma.permission.findMany({
      where: { applicationId: app.id },
      select: { id: true, code: true },
    });

    const applicable = roles.filter(
      (r) => !r.apps || r.apps.length === 0 || r.apps.includes(def.code),
    );

    for (const roleDef of applicable) {
      const role = await prisma.role.upsert({
        where: { applicationId_name: { applicationId: app.id, name: roleDef.name } },
        update: { description: roleDef.description, isActive: roleDef.isActive ?? true },
        create: {
          applicationId: app.id,
          name: roleDef.name,
          description: roleDef.description,
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

    const status = def.isActive === false ? " (NONAKTIF)" : "";
    console.log(
      `✅ ${def.code}${status} — ${permissionCount} permission, ${applicable.length} role`,
    );
  }
}

// ─── Seed: User ───────────────────────────────────────────────────────────────
/** Cache id role per "appCode/roleName" agar tidak query berulang. */
async function buildRoleIndex(): Promise<Map<string, { roleId: string; applicationId: string }>> {
  const roles = await prisma.role.findMany({
    select: { id: true, name: true, applicationId: true, application: { select: { code: true } } },
  });

  const index = new Map<string, { roleId: string; applicationId: string }>();
  for (const r of roles) {
    index.set(`${r.application.code}/${r.name}`, {
      roleId: r.id,
      applicationId: r.applicationId,
    });
  }
  return index;
}

async function seedUser(
  def: UserDef,
  defaultPassword: string,
  roleIndex: Map<string, { roleId: string; applicationId: string }>,
): Promise<void> {
  const plain =
    (def.passwordEnv ? process.env[def.passwordEnv] : undefined) ??
    def.password ??
    defaultPassword;

  const passwordHash = await hashPassword(plain);
  const username = def.username.toLowerCase();
  const email = def.email.toLowerCase();

  const user = await prisma.user.upsert({
    where: { username },
    // Password TIDAK ditimpa saat update: seed ulang tidak boleh mengubah
    // kredensial akun yang sudah dipakai untuk pengujian.
    update: {
      email,
      fullName: def.fullName,
      nip: def.nip ?? null,
      phoneNumber: def.phoneNumber ?? null,
      isSuperAdmin: def.isSuperAdmin ?? false,
      isActive: def.isActive ?? true,
      emailVerifiedAt: def.emailVerified ? new Date() : null,
      deletedAt: def.softDeleted ? new Date() : null,
    },
    create: {
      username,
      email,
      passwordHash,
      fullName: def.fullName,
      nip: def.nip ?? null,
      phoneNumber: def.phoneNumber ?? null,
      isSuperAdmin: def.isSuperAdmin ?? false,
      isActive: def.isActive ?? true,
      emailVerifiedAt: def.emailVerified ? new Date() : null,
      deletedAt: def.softDeleted ? new Date() : null,
    },
    select: { id: true },
  });

  for (const assignment of def.roles) {
    const key = `${assignment.app}/${assignment.role}`;
    const target = roleIndex.get(key);
    if (!target) {
      // Salah tulis di JSON harus terlihat, bukan diam-diam terlewat.
      throw new Error(
        `Role "${key}" (user "${def.username}") tidak ada. Periksa applications.json / roles.json.`,
      );
    }

    await prisma.userAppRole.upsert({
      where: {
        userId_applicationId_roleId: {
          userId: user.id,
          applicationId: target.applicationId,
          roleId: target.roleId,
        },
      },
      update: { expiresAt: resolveExpiry(assignment.expiresAt) },
      create: {
        userId: user.id,
        applicationId: target.applicationId,
        roleId: target.roleId,
        expiresAt: resolveExpiry(assignment.expiresAt),
      },
    });
  }
}

/** Pegawai massal untuk menguji pagination & pencarian. */
async function seedBulkUsers(
  bulk: BulkDef,
  defaultPassword: string,
  roleIndex: Map<string, { roleId: string; applicationId: string }>,
): Promise<void> {
  const target = roleIndex.get(`${bulk.app}/${bulk.role}`);
  if (!target) throw new Error(`Role bulk "${bulk.app}/${bulk.role}" tidak ada.`);

  const passwordHash = await hashPassword(defaultPassword);

  for (let i = 1; i <= bulk.count; i++) {
    const first = bulk.firstNames[i % bulk.firstNames.length] ?? "Pegawai";
    const last = bulk.lastNames[i % bulk.lastNames.length] ?? "Jambi";
    const seq = String(i).padStart(3, "0");
    const username = `${bulk.usernamePrefix}${seq}`;

    const user = await prisma.user.upsert({
      where: { username },
      update: {},
      create: {
        username,
        email: `${username}@${bulk.emailDomain}`,
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

    await prisma.userAppRole.upsert({
      where: {
        userId_applicationId_roleId: {
          userId: user.id,
          applicationId: target.applicationId,
          roleId: target.roleId,
        },
      },
      update: {},
      create: {
        userId: user.id,
        applicationId: target.applicationId,
        roleId: target.roleId,
      },
    });
  }

  console.log(`✅ ${bulk.count} pegawai massal (${bulk.app}/${bulk.role})`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log("🌱 Seed database SELOKO…\n");

  if (process.argv.includes("--reset")) await resetTables();

  const appsFile = await loadJson<{ applications: ApplicationDef[] }>("applications.json");
  const rolesFile = await loadJson<{
    actionLabels: Record<string, string>;
    actionGroups: Record<string, string[]>;
    roles: RoleDef[];
  }>("roles.json");
  const usersFile = await loadJson<{
    defaultPassword: string;
    users: UserDef[];
    bulk: BulkDef;
  }>("users.json");

  await seedApplications(
    appsFile.applications,
    rolesFile.actionLabels,
    rolesFile.actionGroups,
    rolesFile.roles,
  );

  const roleIndex = await buildRoleIndex();

  console.log("");
  for (const def of usersFile.users) {
    await seedUser(def, usersFile.defaultPassword, roleIndex);
  }
  console.log(`✅ ${usersFile.users.length} akun uji`);

  if (usersFile.bulk?.count > 0) {
    await seedBulkUsers(usersFile.bulk, usersFile.defaultPassword, roleIndex);
  }

  // ── Ringkasan ─────────────────────────────────────────────────────────────
  const [apps, permissions, roles, users, assignments] = await Promise.all([
    prisma.application.count(),
    prisma.permission.count(),
    prisma.role.count(),
    prisma.user.count(),
    prisma.userAppRole.count(),
  ]);

  console.log("\n┌─────────────────────┬────────┐");
  console.log("│ Tabel               │ Jumlah │");
  console.log("├─────────────────────┼────────┤");
  for (const [label, n] of [
    ["applications", apps],
    ["permissions", permissions],
    ["roles", roles],
    ["users", users],
    ["user_app_roles", assignments],
  ] as const) {
    console.log(`│ ${label.padEnd(19)} │ ${String(n).padStart(6)} │`);
  }
  console.log("└─────────────────────┴────────┘");

  console.log(`\n🔑 Password akun uji: ${usersFile.defaultPassword}`);
  console.log("   Superadmin memakai SEED_SUPER_ADMIN_PASSWORD bila diset.");
  console.log("   ⚠️  Kredensial ini hanya untuk development — jangan dipakai di produksi.");
  console.log("\n✅ Seed selesai.");
}

main()
  .catch((err) => {
    console.error("❌ Seed gagal:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
