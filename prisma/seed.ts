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
import { prisma, loadJson } from "./seeds/shared/utils.js";
import { resetTables } from "./seeds/shared/reset.js";
import { seedApplications } from "./seeds/core/applications.seeder.js";
import { seedMenus } from "./seeds/core/menus.seeder.js";
import { seedOrganizations } from "./seeds/core/organizations.seeder.js";
import { buildOrgIndex, buildRoleIndex, seedUsers } from "./seeds/core/users.seeder.js";
import { seedBapendaUptds } from "./seeds/bapenda/uptds.seeder.js";
import { seedBanners } from "./seeds/bapenda/banners.seeder.js";
import { seedNews } from "./seeds/bapenda/news.seeder.js";
import { seedPages } from "./seeds/bapenda/pages.seeder.js";
import type {
  ApplicationsFile,
  MenusFile,
  RolesFile,
  UsersFile,
  BapendaUptdsFile,
  BannersFile,
  NewsFile,
  PagesFile,
  OrganizationsFile,
} from "./seeds/shared/types.js";

/** Cetak tabel ringkasan jumlah baris tiap tabel yang disentuh seeder. */
async function printSummary(): Promise<void> {
  const [
    apps,
    permissions,
    roles,
    users,
    assignments,
    menus,
    menuRoles,
    uptds,
    banners,
    articleCategories,
    articles,
    pages,
    organizations,
  ] = await Promise.all([
    prisma.application.count(),
    prisma.permission.count(),
    prisma.role.count(),
    prisma.user.count(),
    prisma.userAppRole.count(),
    prisma.menuItem.count(),
    prisma.menuRole.count(),
    prisma.bapendaUptd.count(),
    prisma.banner.count(),
    prisma.articleCategory.count(),
    prisma.article.count(),
    prisma.page.count(),
    prisma.organization.count(),
  ]);

  const rows = [
    ["applications", apps],
    ["permissions", permissions],
    ["roles", roles],
    ["users", users],
    ["user_app_roles", assignments],
    ["menu_items", menus],
    ["menu_roles", menuRoles],
    ["bapenda_uptds", uptds],
    ["banners", banners],
    ["article_categories", articleCategories],
    ["articles", articles],
    ["pages", pages],
    ["organizations", organizations],
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

  const [appsFile, rolesFile, usersFile, menusFile, uptdsFile, bannersFile, newsFile, pagesFile, orgsFile] =
    await Promise.all([
      loadJson<ApplicationsFile>("core/applications.json"),
      loadJson<RolesFile>("core/roles.json"),
      loadJson<UsersFile>("core/users.json"),
      loadJson<MenusFile>("core/menus.json"),
      loadJson<BapendaUptdsFile>("bapenda/uptds.json"),
      loadJson<BannersFile>("bapenda/banners.json"),
      loadJson<NewsFile>("bapenda/news.json"),
      loadJson<PagesFile>("bapenda/pages.json"),
      loadJson<OrganizationsFile>("core/organizations.json"),
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

  // Sebelum users: penugasan role berlingkup OPD menautkan ke organisasi.
  console.log("");
  await seedOrganizations(orgsFile.organizations);

  console.log("");
  await seedUsers(
    usersFile.users,
    usersFile.bulk,
    usersFile.defaultPassword,
    await buildRoleIndex(),
    await buildOrgIndex(),
  );

  console.log("");
  await seedBapendaUptds(uptdsFile.uptds);

  console.log("");
  await seedBanners(bannersFile.banners);

  console.log("");
  await seedNews(newsFile);

  console.log("");
  await seedPages(pagesFile.pages);

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
