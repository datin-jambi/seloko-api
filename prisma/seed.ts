/**
 * prisma/seed.ts — Database Seed Script
 *
 * Mengisi:
 * - Aplikasi terdaftar (seloko, bapenda-profile, lapak-jambi-web, lapak-jambi-app)
 * - Permission per aplikasi (kode + label Indonesia untuk UI CMS)
 * - Role bawaan sistem per aplikasi, lengkap dengan pemetaan permission
 * - Satu user Super Admin
 *
 * Idempoten — aman dijalankan berulang. Jalankan: npm run db:seed
 */
import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";

const prisma = new PrismaClient();

// ─── Definisi Permission ──────────────────────────────────────────────────────
// Satu baris = satu permission. `module` hanya pengelompokan tampilan.
interface PermissionDef {
  module: string;
  entity: string; // dipakai menyusun kode: "<entity>:<action>"
  label: string; // label entitas dalam bahasa Indonesia
  actions: string[];
}

/** Label aksi untuk kolom permissions.name yang dibaca manusia. */
const ACTION_LABELS: Record<string, string> = {
  create: "Menambah",
  read: "Melihat Detail",
  update: "Mengubah",
  delete: "Menghapus",
  list: "Melihat Daftar",
  publish: "Menerbitkan",
  approve: "Menyetujui",
  reject: "Menolak",
  export: "Mengekspor",
  import: "Mengimpor",
};

const CONTENT_ACTIONS = ["create", "read", "update", "delete", "list"];
const PUBLISHABLE_ACTIONS = [...CONTENT_ACTIONS, "publish"];
const VERIFIABLE_ACTIONS = [...CONTENT_ACTIONS, "approve", "reject"];

/** Permission tata kelola pengguna — hanya di aplikasi seloko. */
const selokoPermissions: PermissionDef[] = [
  { module: "Pengguna", entity: "user", label: "Pengguna", actions: CONTENT_ACTIONS },
  { module: "Akses", entity: "role", label: "Role", actions: CONTENT_ACTIONS },
  { module: "Akses", entity: "permission", label: "Permission", actions: ["read", "list"] },
  { module: "Akses", entity: "user-app-role", label: "Penugasan Role", actions: ["create", "list", "delete"] },
  { module: "Sistem", entity: "application", label: "Aplikasi", actions: CONTENT_ACTIONS },
  { module: "Sistem", entity: "audit-log", label: "Log Audit", actions: ["read", "list", "export"] },
];

const bapendaProfilePermissions: PermissionDef[] = [
  { module: "Konten", entity: "article", label: "Artikel", actions: PUBLISHABLE_ACTIONS },
  { module: "Konten", entity: "announcement", label: "Pengumuman", actions: PUBLISHABLE_ACTIONS },
  { module: "Media", entity: "banner", label: "Banner", actions: CONTENT_ACTIONS },
  { module: "Media", entity: "gallery", label: "Galeri", actions: CONTENT_ACTIONS },
];

const lapakWebPermissions: PermissionDef[] = [
  { module: "Mitra", entity: "merchant", label: "Merchant", actions: VERIFIABLE_ACTIONS },
  { module: "Katalog", entity: "product", label: "Produk", actions: VERIFIABLE_ACTIONS },
  { module: "Katalog", entity: "category", label: "Kategori", actions: CONTENT_ACTIONS },
  { module: "Transaksi", entity: "order", label: "Pesanan", actions: ["read", "list", "update", "export"] },
];

// Aplikasi mobile berbagi domain dengan web, tapi tanpa kelola kategori.
const lapakAppPermissions: PermissionDef[] = [
  { module: "Mitra", entity: "merchant", label: "Merchant", actions: ["read", "list", "update"] },
  { module: "Katalog", entity: "product", label: "Produk", actions: CONTENT_ACTIONS },
  { module: "Transaksi", entity: "order", label: "Pesanan", actions: ["read", "list", "update"] },
];

// ─── Definisi Role ────────────────────────────────────────────────────────────
interface RoleDef {
  name: string;
  description: string;
  /** null = seluruh permission aplikasi. Selain itu, daftar aksi yang diizinkan. */
  allowedActions: string[] | null;
}

const DEFAULT_ROLES: RoleDef[] = [
  { name: "superadmin", description: "Akses penuh seluruh fitur aplikasi", allowedActions: null },
  { name: "admin", description: "Kelola konten penuh termasuk hapus dan terbit", allowedActions: null },
  { name: "editor", description: "Membuat dan mengubah konten, tanpa hapus/terbit", allowedActions: ["create", "read", "update", "list"] },
  { name: "verifikator", description: "Memverifikasi pengajuan: setujui atau tolak", allowedActions: ["read", "list", "approve", "reject"] },
  { name: "viewer", description: "Hanya melihat data", allowedActions: ["read", "list", "export"] },
];

// ─── Helper ───────────────────────────────────────────────────────────────────
async function seedPermissions(applicationId: string, defs: PermissionDef[]) {
  for (const def of defs) {
    for (const action of def.actions) {
      const code = `${def.entity}:${action}`;
      const name = `${ACTION_LABELS[action] ?? action} ${def.label}`;
      await prisma.permission.upsert({
        where: { applicationId_code: { applicationId, code } },
        update: { name, module: def.module },
        create: { applicationId, code, name, module: def.module },
      });
    }
  }
}

async function seedRoles(applicationId: string) {
  const allPermissions = await prisma.permission.findMany({
    where: { applicationId },
    select: { id: true, code: true },
  });

  for (const def of DEFAULT_ROLES) {
    const role = await prisma.role.upsert({
      where: { applicationId_name: { applicationId, name: def.name } },
      update: { description: def.description },
      create: {
        applicationId,
        name: def.name,
        description: def.description,
        isSystemRole: true,
        isActive: true,
      },
    });

    const granted = allPermissions.filter((p) => {
      if (def.allowedActions === null) return true;
      const action = p.code.split(":")[1] ?? "";
      return def.allowedActions.includes(action);
    });

    // Sinkron penuh: buang yang tidak lagi berlaku, lalu tambahkan sisanya.
    await prisma.rolePermission.deleteMany({
      where: { roleId: role.id, permissionId: { notIn: granted.map((p) => p.id) } },
    });
    await prisma.rolePermission.createMany({
      data: granted.map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log("🌱 Memulai seed database…");

  const appDefs = [
    { code: "seloko", name: "SELOKO CMS", description: "Konsol manajemen terpusat Bapenda Jambi", permissions: selokoPermissions },
    { code: "bapenda-profile", name: "Bapenda Profile Portal", description: "Portal profil dan informasi publik Bapenda Jambi", permissions: bapendaProfilePermissions },
    { code: "lapak-jambi-web", name: "Lapak Jambi Web", description: "Marketplace UMKM Jambi — antarmuka web", permissions: lapakWebPermissions },
    { code: "lapak-jambi-app", name: "Lapak Jambi Mobile", description: "Marketplace UMKM Jambi — aplikasi mobile", permissions: lapakAppPermissions },
  ];

  for (const def of appDefs) {
    const app = await prisma.application.upsert({
      where: { code: def.code },
      update: { name: def.name, description: def.description },
      create: { code: def.code, name: def.name, description: def.description, isActive: true },
    });

    await seedPermissions(app.id, def.permissions);
    await seedRoles(app.id);
    console.log(`✅ Aplikasi "${def.code}" — permission dan role bawaan siap`);
  }

  // ── Super Admin ───────────────────────────────────────────────────────────
  const superAdminPassword = process.env["SEED_SUPER_ADMIN_PASSWORD"] ?? "SelokoBapenda@2025!";
  const passwordHash = await argon2.hash(superAdminPassword, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const superAdmin = await prisma.user.upsert({
    where: { email: "superadmin@bapenda-jambi.go.id" },
    update: {},
    create: {
      email: "superadmin@bapenda-jambi.go.id",
      username: "superadmin",
      passwordHash,
      fullName: "Super Administrator",
      isSuperAdmin: true,
      isActive: true,
      emailVerifiedAt: new Date(),
    },
  });

  // Tetap beri role superadmin di tiap aplikasi. isSuperAdmin sudah mem-bypass
  // pengecekan permission, tapi penugasan eksplisit membuat UI CMS menampilkan
  // role yang benar dan akun tetap berfungsi bila flag itu dicabut.
  const roles = await prisma.role.findMany({
    where: { name: "superadmin" },
    select: { id: true, applicationId: true },
  });

  for (const role of roles) {
    await prisma.userAppRole.upsert({
      where: {
        userId_applicationId_roleId: {
          userId: superAdmin.id,
          applicationId: role.applicationId,
          roleId: role.id,
        },
      },
      update: {},
      create: { userId: superAdmin.id, applicationId: role.applicationId, roleId: role.id },
    });
  }

  console.log(`✅ Super Admin: ${superAdmin.email} (role di ${roles.length} aplikasi)`);
  console.log("   ⚠️  Password bawaan dipakai. Segera ganti di lingkungan produksi!");
  console.log("\n✅ Seed database selesai.");
}

main()
  .catch((err) => {
    console.error("❌ Seed gagal:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
