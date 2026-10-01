/**
 * prisma/seed.ts — Orkestrator seeder.
 *
 * Berkas ini SENGAJA tidak memuat data apa pun dan tidak menyentuh tabel
 * secara langsung. Data ada di prisma/seed-data/*.json, logikanya di
 * prisma/seed/*.seeder.ts:
 *   applications.json → applications.seeder.ts  (aplikasi, permission, role)
 *   menus.json        → menus.seeder.ts         (sidebar + baseUrl/icon aplikasi)
 *   users.json        → users.seeder.ts         (akun uji, penugasan, massal)
 *
 * Idempoten (semua upsert) — aman dijalankan berulang.
 *   npm run db:seed              → seed/perbarui
 *   npm run db:seed:reset        → kosongkan baris tabel RBAC lebih dulu
 *   npm run db:migrate:reset     → bangun ulang skema dari nol (tanpa seed)
 *   npm run db:migrate:reset:seed → bangun ulang skema lalu seed
 */
import { prisma, loadJson } from "./seed/utils.js";
import { resetTables } from "./seed/reset.js";
import { seedApplications } from "./seed/applications.seeder.js";
import { seedMenus } from "./seed/menus.seeder.js";
import { buildRoleIndex, seedUsers } from "./seed/users.seeder.js";
import type {
  ApplicationsFile,
  MenusFile,
  RolesFile,
  UsersFile,
} from "./seed/types.js";

/** Cetak tabel ringkasan jumlah baris tiap tabel yang disentuh seeder. */
async function printSummary(): Promise<void> {
  const [apps, permissions, roles, users, assignments, menus, menuRoles] =
    await Promise.all([
      prisma.application.count(),
      prisma.permission.count(),
      prisma.role.count(),
      prisma.user.count(),
      prisma.userAppRole.count(),
      prisma.menuItem.count(),
      prisma.menuRole.count(),
    ]);

  const rows = [
    ["applications", apps],
    ["permissions", permissions],
    ["roles", roles],
    ["users", users],
    ["user_app_roles", assignments],
    ["menu_items", menus],
    ["menu_roles", menuRoles],
  ] as const;

  console.log("\n┌─────────────────────┬────────┐");
  console.log("│ Tabel               │ Jumlah │");
  console.log("├─────────────────────┼────────┤");
  for (const [label, n] of rows) {
    console.log(`│ ${label.padEnd(19)} │ ${String(n).padStart(6)} │`);
  }
  console.log("└─────────────────────┴────────┘");
}

async function main(): Promise<void> {
  console.log("🌱 Seed database SELOKO…\n");

  if (process.argv.includes("--reset")) await resetTables();

  const [appsFile, rolesFile, usersFile, menusFile] = await Promise.all([
    loadJson<ApplicationsFile>("applications.json"),
    loadJson<RolesFile>("roles.json"),
    loadJson<UsersFile>("users.json"),
    loadJson<MenusFile>("menus.json"),
  ]);

  // Urutan WAJIB: menu dan user menautkan diri ke permission/role yang dibuat
  // tahap pertama, dicari lewat kode/nama.
  await seedApplications(
    appsFile.applications,
    rolesFile.actionLabels,
    rolesFile.actionGroups,
    rolesFile.roles,
  );

  console.log("");
  await seedMenus(menusFile.applications);

  console.log("");
  await seedUsers(
    usersFile.users,
    usersFile.bulk,
    usersFile.defaultPassword,
    await buildRoleIndex(),
  );

  await printSummary();

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
