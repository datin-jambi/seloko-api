/**
 * menus.check.ts — Verifikasi hasil seeder menu terhadap database.
 *
 * Bukan unit test: membaca DB sungguhan dan memastikan pohon sidebar
 * terbentuk benar. Jalankan setelah `npm run db:seed`.
 *   tsx prisma/seed-data/menus.check.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
let pass = 0;
let fail = 0;

function check(label: string, expected: unknown, actual: unknown): void {
  if (JSON.stringify(expected) === JSON.stringify(actual)) {
    pass++;
    console.log(`  ok    ${label.padEnd(52)} ${JSON.stringify(actual)}`);
  } else {
    fail++;
    console.log(
      `  GAGAL ${label.padEnd(52)} harap ${JSON.stringify(expected)}, dapat ${JSON.stringify(actual)}`,
    );
  }
}

async function main(): Promise<void> {
  console.log("== Struktur pohon ==");

  const seloko = await prisma.application.findUniqueOrThrow({
    where: { code: "seloko" },
    select: { id: true, baseUrl: true, icon: true },
  });

  check("applications.base_url terisi", true, seloko.baseUrl !== null);
  check("applications.icon terisi", "layout-dashboard", seloko.icon);

  const roots = await prisma.menuItem.count({
    where: { applicationId: seloko.id, parentId: null },
  });
  check("seloko: menu akar", 5, roots);

  const pengguna = await prisma.menuItem.findUniqueOrThrow({
    where: { applicationId_code: { applicationId: seloko.id, code: "pengguna" } },
    select: { path: true, children: { select: { code: true }, orderBy: { sortOrder: "asc" } } },
  });
  check("parent 'pengguna' tanpa path", null, pengguna.path);
  check(
    "anak 'pengguna' urut sortOrder",
    ["pengguna.daftar", "pengguna.tambah", "pengguna.penugasan"],
    pengguna.children.map((c) => c.code),
  );

  console.log("\n== Tautan permission & role ==");

  const daftar = await prisma.menuItem.findUniqueOrThrow({
    where: { applicationId_code: { applicationId: seloko.id, code: "pengguna.daftar" } },
    select: { permission: { select: { code: true } }, menuRoles: true },
  });
  check("'pengguna.daftar' → user:list", "user:list", daftar.permission?.code);
  check("'pengguna.daftar' tanpa pembatas role", 0, daftar.menuRoles.length);

  const penugasan = await prisma.menuItem.findUniqueOrThrow({
    where: { applicationId_code: { applicationId: seloko.id, code: "pengguna.penugasan" } },
    select: { menuRoles: { select: { role: { select: { name: true } } } } },
  });
  check(
    "'pengguna.penugasan' dibatasi 3 role",
    ["superadmin", "admin", "operator-pengguna"].sort(),
    penugasan.menuRoles.map((m) => m.role.name).sort(),
  );

  const dasbor = await prisma.menuItem.findUniqueOrThrow({
    where: { applicationId_code: { applicationId: seloko.id, code: "dasbor" } },
    select: { permissionId: true },
  });
  check("'dasbor' bebas izin", null, dasbor.permissionId);

  const tautan = await prisma.menuItem.findUniqueOrThrow({
    where: { applicationId_code: { applicationId: seloko.id, code: "tautan.bapenda" } },
    select: { isExternal: true, path: true },
  });
  check("'tautan.bapenda' eksternal", true, tautan.isExternal);
  check("'tautan.bapenda' path absolut", true, tautan.path?.startsWith("http"));

  console.log("\n== Lingkup aplikasi ==");

  // code yang sama boleh hidup di aplikasi berbeda — unique-nya (app_id, code).
  const dasborCount = await prisma.menuItem.count({ where: { code: "dasbor" } });
  check("code 'dasbor' dipakai >1 aplikasi", true, dasborCount > 1);

  // Path internal tiap aplikasi CMS wajib berprefix sama (/seloko/…, /bapenda/…)
  // supaya satu frontend super app bisa merutekan semua aplikasi tanpa bentrok.
  const prefixed = await prisma.application.findMany({
    where: { code: { in: ["seloko", "bapenda-profile", "lapak-jambi-web"] } },
    select: { code: true, menuItems: { where: { isExternal: false, path: { not: null } }, select: { path: true } } },
  });
  for (const app of prefixed) {
    const prefixes = [...new Set(app.menuItems.map((m) => m.path!.split("/")[1]))];
    check(`${app.code}: semua path berprefix sama`, 1, prefixes.length);
  }
  const expected: Record<string, string> = { seloko: "seloko", "bapenda-profile": "bapenda", "lapak-jambi-web": "lapak" };
  for (const app of prefixed) {
    check(`${app.code}: prefix /${expected[app.code]}`, expected[app.code], app.menuItems[0]?.path?.split("/")[1]);
  }
  const dashboard = await prisma.menuItem.findUniqueOrThrow({
    where: { applicationId_code: { applicationId: seloko.id, code: "dasbor" } },
    select: { path: true },
  });
  check("'dasbor' seloko → /seloko/dashboard", "/seloko/dashboard", dashboard.path);

  const nonaktif = await prisma.menuItem.findFirst({
    where: { code: "menu.nonaktif" },
    select: { isActive: true },
  });
  check("'menu.nonaktif' isActive=false", false, nonaktif?.isActive);

  // Permission menu wajib milik aplikasi menu itu sendiri — izin aplikasi lain
  // yang menyelinap masuk akan membuat sidebar bocor antar aplikasi.
  const silang = await prisma.menuItem.findMany({
    where: { permissionId: { not: null } },
    select: { code: true, applicationId: true, permission: { select: { applicationId: true } } },
  });
  check(
    "tiap permission menu sealiran dengan aplikasinya",
    [],
    silang
      .filter((m) => m.permission && m.permission.applicationId !== m.applicationId)
      .map((m) => m.code),
  );

  // Role pembatas juga harus milik aplikasi yang sama.
  const roleSilang = await prisma.menuRole.findMany({
    select: {
      menuItem: { select: { code: true, applicationId: true } },
      role: { select: { applicationId: true } },
    },
  });
  check(
    "tiap role pembatas sealiran dengan aplikasinya",
    [],
    roleSilang
      .filter((m) => m.role.applicationId !== m.menuItem.applicationId)
      .map((m) => m.menuItem.code),
  );

  console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} ok, ${fail} gagal`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("❌ Check gagal:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
