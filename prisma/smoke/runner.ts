/**
 * prisma/smoke/runner.ts — Unified Smoke Test Runner untuk SELOKO API.
 *
 * Menguji endpoint API sungguhan secara menyeluruh (End-to-End).
 * 100% native TypeScript (Node.js fetch), cross-platform di Windows, Mac, & Linux.
 *
 * Penggunaan:
 *   npm run db:smoke                 → Jalankan semua modul pengujian
 *   npm run db:smoke -- auth         → Hanya uji modul auth & login
 *   npm run db:smoke -- applications → Hanya uji modul aplikasi multi-tenant
 *   npm run db:smoke -- roles        → Hanya uji modul roles
 *   npm run db:smoke -- permissions  → Hanya uji modul permissions
 *   npm run db:smoke -- menus        → Hanya uji struktur sidebar menu
 *   npm run db:smoke -- uptds        → Hanya uji modul Bapenda UPTD Samsat
 */
import { PrismaClient } from "@prisma/client";

const BASE = process.env["API_BASE_URL"] || "http://localhost:3000/api";
const DEFAULT_PASSWORD = process.env["SEED_DEFAULT_PASSWORD"] || "Seloko@2025!";
const SUPERADMIN_PASSWORD = process.env["SEED_SUPER_ADMIN_PASSWORD"] || "SelokoBapenda@2025!";

const prisma = new PrismaClient();

let totalPass = 0;
let totalFail = 0;

function pass(label: string, detail?: string) {
  totalPass++;
  const extra = detail ? ` (${detail})` : "";
  console.log(`  \x1b[32m✓\x1b[0m ${label}${extra}`);
}

function fail(label: string, expected: unknown, actual: unknown) {
  totalFail++;
  console.log(`  \x1b[31m✗\x1b[0m \x1b[1m${label}\x1b[0m — Harap: \x1b[33m${JSON.stringify(expected)}\x1b[0m, Dapat: \x1b[31m${JSON.stringify(actual)}\x1b[0m`);
}

function assert(label: string, condition: boolean, actualVal?: unknown, expectedVal: unknown = true) {
  if (condition) {
    pass(label);
  } else {
    fail(label, expectedVal, actualVal ?? false);
  }
}

// ─── HTTP Client Helper ────────────────────────────────────────────────────────
interface RequestOptions {
  method?: string | undefined;
  token?: string | null | undefined;
  appCode?: string | undefined;
  body?: unknown;
}

async function request(path: string, options: RequestOptions = {}) {
  const { method = "GET", token, appCode = "seloko", body } = options;
  const headers: Record<string, string> = {};

  if (appCode) headers["X-App-Code"] = appCode;
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";

  const init: RequestInit = {
    method,
    headers,
  };
  if (body !== undefined && body !== null) {
    init.body = JSON.stringify(body);
  }

  const response = await fetch(`${BASE}${path}`, init);

  let data: any = null;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  }

  return { status: response.status, data };
}

async function login(identity: string, password = DEFAULT_PASSWORD, appCode = "seloko"): Promise<string | null> {
  const res = await request("/auth/login", {
    method: "POST",
    appCode,
    body: { identity, password },
  });
  return res.data?.data?.accessToken || null;
}

// ─── Test Suite: Auth ─────────────────────────────────────────────────────────
async function runAuthSuite() {
  console.log("\n\x1b[36m▶ [Suite 1: Auth & Multi-Tenancy Guard]\x1b[0m");

  // 1. Superadmin login
  const saToken = await login("superadmin", SUPERADMIN_PASSWORD, "seloko");
  assert("Superadmin login via gateway seloko berhasil (200)", saToken !== null);

  // 2. Admin seloko login
  const adminToken = await login("admin.seloko", DEFAULT_PASSWORD, "seloko");
  assert("Admin pegawai internal login berhasil (200)", adminToken !== null);

  // 3. User nonaktif
  const nonaktifRes = await request("/auth/login", {
    method: "POST",
    appCode: "seloko",
    body: { identity: "nonaktif", password: DEFAULT_PASSWORD },
  });
  assert("User nonaktif (isActive=false) ditolak (401)", nonaktifRes.status === 401, nonaktifRes.status, 401);

  // 4. Password salah
  const wrongPassRes = await request("/auth/login", {
    method: "POST",
    appCode: "seloko",
    body: { identity: "admin.seloko", password: "PasswordSalah@123" },
  });
  assert("Password salah ditolak (401)", wrongPassRes.status === 401, wrongPassRes.status, 401);

  // 5. Tanpa X-App-Code header
  const noAppCodeRes = await fetch(`${BASE}/users`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert("Request tanpa header X-App-Code ditolak (400)", noAppCodeRes.status === 400, noAppCodeRes.status, 400);

  // 6. Inspect /auth/me
  const meRes = await request("/auth/me", { token: adminToken || undefined });
  assert("Endpoint /auth/me mengembalikan data profil user (200)", meRes.status === 200, meRes.status, 200);
  assert("Profile membawa informasi roles array", Array.isArray(meRes.data?.data?.roles));
}

// ─── Test Suite: Applications ─────────────────────────────────────────────────
async function runApplicationsSuite() {
  console.log("\n\x1b[36m▶ [Suite 2: Manajemen Aplikasi (Multi-Tenant)]\x1b[0m");

  const saToken = await login("superadmin", SUPERADMIN_PASSWORD, "seloko");
  const viewerToken = await login("viewer.only", DEFAULT_PASSWORD, "seloko");

  // 1. List applications
  const listRes = await request("/applications", { token: saToken || undefined });
  assert("List applications dapat diakses oleh superadmin (200)", listRes.status === 200, listRes.status, 200);
  assert("Membawa minimal 4 aplikasi seed", (listRes.data?.meta?.totalItems ?? listRes.data?.meta?.total) >= 4);

  // 2. Detail application seloko (by UUID)
  const selokoApp = listRes.data?.data?.find((a: any) => a.code === "seloko");
  const detailRes = await request(`/applications/${selokoApp?.id}`, { token: saToken || undefined });
  assert("Detail aplikasi 'seloko' berhasil diambil (200)", detailRes.status === 200, detailRes.status, 200);

  // 3. Viewer mencoba membuat aplikasi baru -> 403
  const forbiddenRes = await request("/applications", {
    method: "POST",
    token: viewerToken || undefined,
    body: { code: "test-forbidden", name: "Test App", audience: "INTERNAL" },
  });
  assert("Role viewer tanpa permission ditolak membuat aplikasi (403)", forbiddenRes.status === 403, forbiddenRes.status, 403);
}

// ─── Test Suite: Roles & Permissions ──────────────────────────────────────────
async function runRolesPermissionsSuite() {
  console.log("\n\x1b[36m▶ [Suite 3: Roles & Permissions (RBAC)]\x1b[0m");

  const saToken = await login("superadmin", SUPERADMIN_PASSWORD, "seloko");

  // 1. List roles
  const rolesRes = await request("/roles?limit=50", { token: saToken || undefined });
  assert("List roles berhasil diambil (200)", rolesRes.status === 200, rolesRes.status, 200);
  assert("Jumlah roles terdaftar > 0", rolesRes.data?.data?.length > 0);

  // 2. List permissions
  const permsRes = await request("/permissions?limit=100", { token: saToken || undefined });
  assert("List permissions berhasil diambil (200)", permsRes.status === 200, permsRes.status, 200);
  assert("Jumlah permissions terdaftar > 0", permsRes.data?.data?.length > 0);

  // 3. User permission check
  const adminToken = await login("admin.seloko", DEFAULT_PASSWORD, "seloko");
  const appRes = await request("/applications/seloko", { token: saToken || undefined });
  const selokoId = appRes.data?.data?.id;

  if (selokoId) {
    const mePermsRes = await request(`/permissions/${selokoId}/me`, { token: adminToken || undefined });
    assert("Endpoint /permissions/:appId/me merespons izin user saat ini (200)", mePermsRes.status === 200);
  }
}

// ─── Test Suite: Menus ────────────────────────────────────────────────────────
async function runMenusSuite() {
  console.log("\n\x1b[36m▶ [Suite 4: Sidebar Menu Hierarchy & Integrity]\x1b[0m");

  const selokoApp = await prisma.application.findUnique({
    where: { code: "seloko" },
    include: { menuItems: true },
  });

  assert("Aplikasi 'seloko' ditemukan di database", selokoApp !== null);
  assert("Aplikasi 'seloko' memiliki menu items terdaftar", (selokoApp?.menuItems?.length || 0) > 0);

  const rootMenus = selokoApp?.id
    ? await prisma.menuItem.count({
        where: { applicationId: selokoApp.id, parentId: null },
      })
    : 0;
  assert("Menu level akar (root menus) terbentuk dengan benar", rootMenus > 0, rootMenus);

  const totalMenus = await prisma.menuItem.count();
  assert("Total seluruh item menu terisi (> 20)", totalMenus > 20, totalMenus);
}

// ─── Test Suite: Bapenda UPTD Samsat ──────────────────────────────────────────
async function runUptdsSuite() {
  console.log("\n\x1b[36m▶ [Suite 5: Domain Bapenda - UPTD Samsat Jambi]\x1b[0m");

  // 1. Public list UPTD
  const publicListRes = await request("/bapenda/uptds/public", { appCode: "bapenda-profile" });
  assert("Direktori publik UPTD Samsat merespons sukses (200)", publicListRes.status === 200, publicListRes.status, 200);
  assert("Data publik UPTD Samsat memuat minimal 11 kantor Samsat", (publicListRes.data?.data?.length || 0) >= 11);

  // 2. Public detail by code
  const publicDetailRes = await request("/bapenda/uptds/public/UPTD-001", { appCode: "bapenda-profile" });
  assert("Detail UPTD Kota Jambi (UPTD-001) merespons sukses (200)", publicDetailRes.status === 200, publicDetailRes.status, 200);
  assert("Nama kantor sesuai 'UPTD Samsat Kota Jambi'", publicDetailRes.data?.data?.name === "UPTD Samsat Kota Jambi");
  assert("Latitude & longitude geolokasi terisi", publicDetailRes.data?.data?.latitude !== null && publicDetailRes.data?.data?.longitude !== null);

  // 3. Filter berdasarkan kota
  const filterCityRes = await request("/bapenda/uptds/public?city=Kota%20Jambi", { appCode: "bapenda-profile" });
  assert("Filter UPTD berdasarkan nama kota bekerja (200)", filterCityRes.status === 200);
  assert("Hasil filter hanya menampilkan kantor di Kota Jambi", filterCityRes.data?.data?.every((u: any) => u.city?.includes("Kota Jambi")));

  // 4. CMS Endpoint (Terautentikasi)
  const saToken = await login("superadmin", SUPERADMIN_PASSWORD, "seloko");
  const cmsListRes = await request("/bapenda/uptds?page=1&limit=5", {
    token: saToken || undefined,
    appCode: "seloko",
  });
  assert("CMS endpoint /api/bapenda/uptds dapat diakses admin (200)", cmsListRes.status === 200, cmsListRes.status, 200);
  assert("Membawa pagination meta (page=1, limit=5)", cmsListRes.data?.meta?.page === 1 && cmsListRes.data?.meta?.limit === 5);
}

// ─── Test Suite: Bapenda Banners ──────────────────────────────────────────────
async function runBannersSuite() {
  console.log("\n\x1b[36m▶ [Suite 6: Domain Bapenda - Banners & Media Verification]\x1b[0m");

  // 1. Public list Banners
  const publicListRes = await request("/bapenda/banners/public?limit=10", {
    appCode: "bapenda-profile",
  });
  assert("Direktori publik Banner merespons sukses (200)", publicListRes.status === 200, publicListRes.status, 200);
  assert("Data publik Banner memuat minimal 3 banner aktif ter-seed", (publicListRes.data?.data?.length || 0) >= 3);
  assert("Setiap banner publik memiliki title & imageUrl valid", publicListRes.data?.data?.every((b: any) => Boolean(b.title && b.imageUrl)));

  // 2. CMS List Banners (Terautentikasi Superadmin)
  const saToken = await login("superadmin", SUPERADMIN_PASSWORD, "seloko");
  const cmsListRes = await request("/bapenda/banners?page=1&limit=5", {
    token: saToken || undefined,
    appCode: "seloko",
  });
  assert("CMS endpoint /api/bapenda/banners dapat diakses admin (200)", cmsListRes.status === 200, cmsListRes.status, 200);
  assert("Membawa pagination meta (page=1, limit=5)", cmsListRes.data?.meta?.page === 1 && cmsListRes.data?.meta?.limit === 5);

  // 3. Storage Get Detail Check (ImageKit /:fileId)
  const storageDetailRes = await request("/storage/ik_non_existent_id_test_9999", {
    token: saToken || undefined,
    appCode: "seloko",
  });
  assert("Storage GET /api/storage/:fileId menolak file yang tidak ada (404)", storageDetailRes.status === 404, storageDetailRes.status, 404);

  // 4. Validasi banner active menolak fileId yang tidak ada di ImageKit
  const invalidCreateRes = await request("/bapenda/banners", {
    method: "POST",
    token: saToken || undefined,
    appCode: "seloko",
    body: {
      title: "Banner Test Invalid FileId",
      imageUrl: "https://example.com/test.jpg",
      imageFileId: "invalid_file_id_not_found_12345",
      isActive: true,
      sortOrder: 99,
    },
  });
  assert("Membuat banner aktif dengan imageFileId palsu ditolak validasi (400)", invalidCreateRes.status === 400, invalidCreateRes.status, 400);

  // 5. CMS Create Banner (Sukses jika tanpa imageFileId atau isActive false)
  const createRes = await request("/bapenda/banners", {
    method: "POST",
    token: saToken || undefined,
    appCode: "seloko",
    body: {
      title: "Smoke Test Temporary Banner",
      description: "Banner untuk pengujian otomatis end-to-end",
      imageUrl: "https://example.com/banner-smoke-test.webp",
      buttonText: "Klik Disini",
      buttonUrl: "https://bapenda.jambiprov.go.id",
      sortOrder: 99,
      isActive: false,
    },
  });
  assert("Menambah banner baru untuk testing berhasil (201)", createRes.status === 201, createRes.status, 201);
  const createdId = createRes.data?.data?.id;

  if (createdId) {
    // 6. CMS Get Detail Banner by ID
    const detailRes = await request(`/bapenda/banners/${createdId}`, {
      token: saToken || undefined,
      appCode: "seloko",
    });
    assert("Detail banner berdasarkan ID berhasil diambil (200)", detailRes.status === 200, detailRes.status, 200);
    assert("Judul banner sesuai", detailRes.data?.data?.title === "Smoke Test Temporary Banner");

    // 7. CMS Toggle Active Banner
    const patchActiveRes = await request(`/bapenda/banners/${createdId}/active`, {
      method: "PATCH",
      token: saToken || undefined,
      appCode: "seloko",
      body: { isActive: true },
    });
    assert("Toggle status banner berhasil (200)", patchActiveRes.status === 200, patchActiveRes.status, 200);
    assert("Status berubah menjadi aktif", patchActiveRes.data?.data?.isActive === true);

    // 8. CMS Reorder Banners
    const reorderRes = await request("/bapenda/banners/reorder", {
      method: "PATCH",
      token: saToken || undefined,
      appCode: "seloko",
      body: {
        items: [{ id: createdId, sortOrder: 10 }],
      },
    });
    assert("Reorder urutan sortOrder banner massal berhasil (200)", reorderRes.status === 200, reorderRes.status, 200);

    // 9. CMS Soft-Delete Banner
    const deleteRes = await request(`/bapenda/banners/${createdId}`, {
      method: "DELETE",
      token: saToken || undefined,
      appCode: "seloko",
    });
    assert("Hapus (soft-delete) banner berhasil (200)", deleteRes.status === 200, deleteRes.status, 200);
    assert("Properti deleted: true dikembalikan", deleteRes.data?.data?.deleted === true);
  }
}

// ─── Main Orchestrator ────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const targetModule = args[0]?.toLowerCase().trim();

  console.log("╔═══════════════════════════════════════════════════════════════╗");
  console.log("║           🚀 SELOKO API — UNIFIED SMOKE TEST RUNNER           ║");
  console.log("╚═══════════════════════════════════════════════════════════════╝");
  console.log(` Target Server : \x1b[33m${BASE}\x1b[0m`);
  console.log(` Filter Modul  : \x1b[35m${targetModule ? targetModule : "SEMUA MODUL"}\x1b[0m\n`);

  // Health check: cek apakah server sedang aktif
  try {
    const healthCheck = await fetch(`${BASE}/bapenda/uptds/public`, {
      headers: { "X-App-Code": "bapenda-profile" },
    });
    if (!healthCheck.ok && healthCheck.status >= 500) {
      throw new Error(`Server merespons status ${healthCheck.status}`);
    }
  } catch (err: any) {
    console.error(`\x1b[31m❌ Gagal terhubung ke server API di ${BASE}.\x1b[0m`);
    console.error(`   Pastikan server backend sedang menyala via: \x1b[33mnpm run dev\x1b[0m`);
    console.error(`   Detail error: ${err.message}\n`);
    process.exit(1);
  }

  const startTime = Date.now();

  try {
    if (!targetModule || targetModule === "auth") {
      await runAuthSuite();
    }
    if (!targetModule || targetModule === "applications" || targetModule === "apps") {
      await runApplicationsSuite();
    }
    if (!targetModule || targetModule === "roles" || targetModule === "permissions" || targetModule === "rbac") {
      await runRolesPermissionsSuite();
    }
    if (!targetModule || targetModule === "menus" || targetModule === "menu") {
      await runMenusSuite();
    }
    if (!targetModule || targetModule === "uptds" || targetModule === "uptd" || targetModule === "bapenda") {
      await runUptdsSuite();
    }
    if (!targetModule || targetModule === "banners" || targetModule === "banner") {
      await runBannersSuite();
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log("\n─────────────────────────────────────────────────────────────────");
    console.log(` Hasil Smoke Test (${duration}s):`);
    console.log(`   \x1b[32m✓ Lolos : ${totalPass}\x1b[0m`);
    if (totalFail > 0) {
      console.log(`   \x1b[31m✗ Gagal : ${totalFail}\x1b[0m`);
    } else {
      console.log(`   \x1b[32mSemua pengujian lolos tanpa hambatan!\x1b[0m`);
    }
    console.log("─────────────────────────────────────────────────────────────────\n");

    if (totalFail > 0) {
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Terjadi error fatal saat menjalankan smoke test:", err);
  process.exit(1);
});
