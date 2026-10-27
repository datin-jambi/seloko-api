/**
 * menus.check.ts — Verifikasi hasil seeder menu terhadap database.
 *
 * Bukan unit test: membaca DB sungguhan dan memastikan pohon sidebar
 * terbentuk benar. Jalankan setelah `npm run db:seed`.
 *   tsx prisma/smoke/menus.check.ts
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
  check("seloko: menu akar", 6, roots);

  const pengguna = await prisma.menuItem.findUniqueOrThrow({
    where: { applicationId_code: { applicationId: seloko.id, code: "pengguna" } },
    select: { path: true, children: { select: { code: true }, orderBy: { sortOrder: "asc" } } },
  });
  check("parent 'pengguna' tanpa path", null, pengguna.path);
  check(
    "anak 'pengguna' urut sortOrder",
    ["pengguna.daftar", "pengguna.tambah"],
    pengguna.children.map((c) => c.code),
  );

  console.log("\n== Tautan permission & role ==");

  const daftar = await prisma.menuItem.findUniqueOrThrow({
    where: { applicationId_code: { applicationId: seloko.id, code: "pengguna.daftar" } },
    select: { permission: { select: { code: true } }, menuRoles: true },
  });
  check("'pengguna.daftar' → user:list", "user:list", daftar.permission?.code);
  check("'pengguna.daftar' dibatasi 1 role", 1, daftar.menuRoles.length);

  const dasbor = await prisma.menuItem.findUniqueOrThrow({
    where: { applicationId_code: { applicationId: seloko.id, code: "dasbor" } },
    select: { permissionId: true },
  });
  check("'dasbor' bebas izin", null, dasbor.permissionId);

  // Nama role memakai slug roles.json, bukan label tampilan. Salah nama =
  // seeder gagal keras, tapi urutannya tetap perlu dipastikan.
  const dasborRoles = await prisma.menuRole.findMany({
    where: { menuItem: { applicationId: seloko.id, code: "dasbor" } },
    select: { role: { select: { name: true } } },
  });
  check(
    "'dasbor' dibatasi superadmin + admin",
    ["admin", "superadmin"],
    dasborRoles.map((r) => r.role.name).sort(),
  );

  const profil = await prisma.menuItem.findUniqueOrThrow({
    where: { applicationId_code: { applicationId: seloko.id, code: "profil" } },
    select: { permissionId: true, menuRoles: true, path: true },
  });
  check("'profil' bebas izin", null, profil.permissionId);
  check("'profil' terbuka untuk semua role", 0, profil.menuRoles.length);
  check("'profil' seloko → /seloko/profile", "/seloko/profile", profil.path);

  console.log("\n== Status Aktif vs Draft ==");

  const nonaktif = await prisma.menuItem.findMany({
    where: { applicationId: seloko.id, isActive: false },
    select: { code: true },
  });
  check("seloko: semua menu Aktif", [], nonaktif.map((m) => m.code));

  const bapenda = await prisma.application.findUniqueOrThrow({
    where: { code: "bapenda-profile" },
    select: { id: true },
  });
  const bapendaAktif = await prisma.menuItem.findMany({
    where: { applicationId: bapenda.id, isActive: true },
    select: { code: true },
    orderBy: { sortOrder: "asc" },
  });
  check(
    "bapenda-profile: hanya Dashboard & Konten yang Aktif",
    ["dasbor", "konten", "konten.berita", "konten.berita.kategori", "konten.galeri"],
    bapendaAktif.map((m) => m.code).sort(),
  );

  const faq = await prisma.menuItem.findUniqueOrThrow({
    where: { applicationId_code: { applicationId: bapenda.id, code: "faq" } },
    select: { isActive: true, permission: { select: { code: true } } },
  });
  check("'faq' berstatus Draft (isActive=false)", false, faq.isActive);
  check("'faq' → faq:list", "faq:list", faq.permission?.code);

  console.log("\n== Lapak: struktur gabungan ==");

  const lapak = await prisma.application.findUniqueOrThrow({
    where: { code: "lapak-jambi-web" },
    select: { id: true },
  });
  const lapakRoots = await prisma.menuItem.findMany({
    where: { applicationId: lapak.id, parentId: null },
    select: { code: true, isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  check(
    "lapak-jambi-web: menu akar urut",
    ["dasbor", "retribusi", "katalog", "transaksi-penerimaan", "konten", "monitoring", "konfigurasi", "profil"],
    lapakRoots.map((m) => m.code),
  );

  // Modul yang sudah jadi wajib tetap terlihat; grup yang belum siap = Draft.
  const transaksiGrup = await prisma.menuItem.findUniqueOrThrow({
    where: { applicationId_code: { applicationId: lapak.id, code: "transaksi-penerimaan" } },
    select: {
      isActive: true,
      children: { select: { code: true, isActive: true }, orderBy: { sortOrder: "asc" } },
    },
  });
  check("grup 'Transaksi & Penerimaan' Aktif (berisi menu jadi)", true, transaksiGrup.isActive);
  check(
    "isi 'Transaksi & Penerimaan' (modul jadi + Draft baru)",
    [
      ["transaksi", false],
      ["transaksi.pesanan", true],
      ["transaksi.pembayaran", true],
      ["transaksi.tiket", true],
      ["penerimaan.retribusi", false],
    ],
    transaksiGrup.children.map((c) => [c.code, c.isActive]),
  );

  const monitoring = await prisma.menuItem.findUniqueOrThrow({
    where: { applicationId_code: { applicationId: lapak.id, code: "monitoring" } },
    select: { children: { select: { code: true, isActive: true }, orderBy: { sortOrder: "asc" } } },
  });
  check(
    "isi 'Monitoring' (grup Draft: Laporan & Audit Log belum tayang)",
    [["laporan.penerimaan", false], ["monitoring.audit", false]],
    monitoring.children.map((c) => [c.code, c.isActive]),
  );

  const konfigurasi = await prisma.menuItem.findUniqueOrThrow({
    where: { applicationId_code: { applicationId: lapak.id, code: "konfigurasi" } },
    select: { isActive: true },
  });
  check("grup 'Konfigurasi' Draft", false, konfigurasi.isActive);

  // Role baru hanya hidup di Lapak dan memegang izin yang benar.
  const roleNames = new Set(
    (
      await prisma.role.findMany({ where: { applicationId: lapak.id }, select: { name: true } })
    ).map((r) => r.name),
  );
  for (const role of ["kasir", "bendahara", "pimpinan", "admin-opd", "manajer-opd", "petugas-lokasi"]) {
    check(`role '${role}' ada di lapak-jambi-web`, true, roleNames.has(role));
  }
  const kasirPerms = (
    await prisma.rolePermission.findMany({
      where: { role: { applicationId: lapak.id, name: "kasir" } },
      select: { permission: { select: { code: true } } },
    })
  ).map((p) => p.permission.code);
  check("kasir boleh payment:approve", true, kasirPerms.includes("payment:approve"));
  check("kasir TIDAK boleh category:create", false, kasirPerms.includes("category:create"));

  const pimpinanPerms = (
    await prisma.rolePermission.findMany({
      where: { role: { applicationId: lapak.id, name: "pimpinan" } },
      select: { permission: { select: { code: true } } },
    })
  ).map((p) => p.permission.code);
  check("pimpinan hanya report/order/product baca", true, pimpinanPerms.every((c) => /^(report|order|product):/.test(c)));

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
  const expected: Record<string, string> = { seloko: "seloko", "bapenda-profile": "bapenda", "lapak-jambi-web": "lapak-jambi" };
  for (const app of prefixed) {
    check(`${app.code}: prefix /${expected[app.code]}`, expected[app.code], app.menuItems[0]?.path?.split("/")[1]);
  }
  const dashboard = await prisma.menuItem.findUniqueOrThrow({
    where: { applicationId_code: { applicationId: seloko.id, code: "dasbor" } },
    select: { path: true },
  });
  check("'dasbor' seloko → /seloko/dashboard", "/seloko/dashboard", dashboard.path);

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

  console.log("\n== Aplikasi portal publik ==");

  // CMS dan portal publik kini aplikasi terpisah: sidebar CMS tidak boleh
  // muncul di aplikasi portal, dan sebaliknya.
  for (const [code, expectMenus] of [
    ["bapenda-portal", 2],
    ["lapak-jambi-app", 2],
  ] as const) {
    const portal = await prisma.menuItem.count({ where: { application: { code } } });
    check(`${code}: jumlah menu`, expectMenus, portal);
  }

  const portalRoot = await prisma.menuItem.findUniqueOrThrow({
    where: { applicationId_code: { applicationId: (await prisma.application.findUniqueOrThrow({ where: { code: "bapenda-portal" }, select: { id: true } })).id, code: "portal" } },
    select: { children: { select: { code: true } } },
  });
  check("bapenda-portal: isi Portal Publik", ["portal.beranda"], portalRoot.children.map((c) => c.code));

  // `warga` hanya hidup di aplikasi PUBLIC — CMS kini INTERNAL dan menolak
  // role PUBLIC saat seed, jadi keberadaannya di sana justru bug.
  for (const [code, expected] of [
    ["bapenda-portal", 1],
    ["lapak-jambi-app", 1],
    ["bapenda-profile", 0],
    ["lapak-jambi-web", 0],
  ] as const) {
    const warga = await prisma.role.count({ where: { application: { code }, name: "warga" } });
    check(`role 'warga' di ${code} = ${expected}`, expected, warga);
  }

  // Kedua CMS wajib INTERNAL: pegawai saja, tanpa akun warga.
  for (const [code, expected] of [
    ["bapenda-profile", "INTERNAL"],
    ["lapak-jambi-web", "INTERNAL"],
    ["bapenda-portal", "PUBLIC"],
    ["lapak-jambi-app", "PUBLIC"],
  ] as const) {
    const app = await prisma.application.findUniqueOrThrow({ where: { code }, select: { audience: true } });
    check(`${code}: audience ${expected}`, expected, app.audience);
  }

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
