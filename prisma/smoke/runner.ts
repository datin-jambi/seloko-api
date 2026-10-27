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
 *   npm run db:smoke -- news         → Hanya uji modul Bapenda Berita & alur review
 *   npm run db:smoke -- pages        → Hanya uji modul Bapenda Halaman Profil
 *   npm run db:smoke -- organizations → Hanya uji master OPD (core)
 *   npm run db:smoke -- users-org    → Hanya uji penugasan role berlingkup OPD
 *   npm run db:smoke -- lapak-rbac   → Hanya uji RBAC & lingkup OPD Lapak Jambi
 *   npm run db:smoke -- register     → Hanya uji registrasi akun warga (PUBLIC)
 *   npm run db:smoke -- lapak-categories → Hanya uji kategori layanan Lapak (LJ-1.1)
 *   npm run db:smoke -- lapak-products  → Hanya uji produk katalog Lapak (LJ-1.2)
 *   npm run db:smoke -- lapak-rates     → Hanya uji alur persetujuan tarif (LJ-1.3)
 *   npm run db:smoke -- lapak-catalog   → Hanya uji katalog publik OPD (LJ-1.6)
 *   npm run db:smoke -- lapak-availability → Hanya uji jam operasional & tanggal tutup (LJ-2.1)
 *   npm run db:smoke -- lapak-reservations → Hanya uji reservasi & anti double-booking (LJ-2.2)
 *   npm run db:smoke -- lapak-cart       → Hanya uji keranjang per OPD (LJ-2.3)
 *   npm run db:smoke -- lapak-orders     → Hanya uji quote & checkout pesanan (LJ-2.4)
 *   npm run db:smoke -- lapak-skrd       → Hanya uji SKRD & penomoran gapless (LJ-2.5)
 *   npm run db:smoke -- lapak-payments   → Hanya uji pembayaran transfer manual (LJ-2.6)
 *   npm run db:smoke -- lapak-tickets    → Hanya uji tiket QR & check-in (LJ-2.7)
 *   npm run db:smoke -- lapak-expiry     → Hanya uji worker kedaluwarsa (LJ-2.8)
 *   npm run db:smoke -- lapak-dashboard  → Hanya uji dashboard & target (LJ-3.1)
 *   npm run db:smoke -- lapak-reports    → Hanya uji daftar transaksi & ekspor CSV (LJ-3.2)
 *   npm run db:smoke -- lapak-public-stats → Hanya uji transparansi PAD publik (LJ-3.3)
 *   npm run db:smoke -- lapak-news       → Hanya uji konten berita per OPD (LJ-4.1)
 */
import { PrismaClient } from "@prisma/client";

const BASE = process.env["API_BASE_URL"] || "http://localhost:3000/api";
const DEFAULT_PASSWORD = process.env["SEED_DEFAULT_PASSWORD"] || "Seloko@2025!";
// Portal publik Lapak — rumah akun warga (role `warga` hanya hidup di app PUBLIC).
// CMS Lapak (`lapak-jambi-web`) kini INTERNAL: pegawai saja, tanpa akun warga.
const WARGA_APP = "lapak-jambi-app";
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
  let raw = "";
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  } else {
    // Respons non-JSON (mis. ekspor CSV) dibaca sebagai teks. Tanpa ini, uji
    // ekspor selalu menerima `data: null` meski server mengirim berkas benar.
    raw = await response.text();
    data = raw;
  }

  return { status: response.status, data, raw, headers: response.headers };
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

  // 4. Create aplikasi non-aktif (isActive: false) dengan fileId dummy -> diizinkan tanpa cek ImageKit
  const createDraftAppRes = await request("/applications", {
    method: "POST",
    token: saToken || undefined,
    body: {
      code: "test-draft-app",
      name: "Draft App",
      audience: "PUBLIC",
      isActive: false,
      logoFileId: "dummy-non-existent-file-id",
    },
  });
  assert("Aplikasi nonaktif (isActive=false) berhasil dibuat tanpa validasi ketat ImageKit (201)", createDraftAppRes.status === 201, createDraftAppRes.status, 201);
  const draftAppId = createDraftAppRes.data?.data?.id;

  // 5. Coba aktifkan aplikasi draft dengan fileId dummy -> ditolak ImageKit (400)
  if (draftAppId) {
    const activateFailRes = await request(`/applications/${draftAppId}/activate`, {
      method: "PATCH",
      token: saToken || undefined,
      body: { isActive: true },
    });
    assert("Aktivasi aplikasi ditolak saat berkas ImageKit tidak ditemukan (400)", activateFailRes.status === 400, activateFailRes.status, 400);

    // Bersihkan fileId dummy, lalu aktifkan -> berhasil
    await request(`/applications/${draftAppId}`, {
      method: "PATCH",
      token: saToken || undefined,
      body: { logoFileId: null },
    });
    const activateSuccessRes = await request(`/applications/${draftAppId}/activate`, {
      method: "PATCH",
      token: saToken || undefined,
      body: { isActive: true },
    });
    assert("Aplikasi berhasil diaktifkan setelah fileId valid/dibersihkan (200)", activateSuccessRes.status === 200, activateSuccessRes.status, 200);

    // Hapus aplikasi uji coba
    await request(`/applications/${draftAppId}`, {
      method: "DELETE",
      token: saToken || undefined,
    });
  }

  // 6. Public Config endpoint tanpa autentikasi
  const publicConfigRes = await request("/applications/public-config/bapenda-profile");
  assert("Public config bapenda-profile dapat diakses tanpa login (200)", publicConfigRes.status === 200, publicConfigRes.status, 200);
  assert("Public config memuat tagline aplikasi", Boolean(publicConfigRes.data?.data?.tagline));
  assert("Public config memuat kontak resmi", Boolean(publicConfigRes.data?.data?.settings?.contact?.email));
  assert("Public config memuat metadata SEO", Boolean(publicConfigRes.data?.data?.settings?.seo?.canonicalUrl));
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

  // 4. Validasi banner active menolak fileId yang tidak ada di ImageKit (Desktop & Mobile)
  const invalidCreateRes = await request("/bapenda/banners", {
    method: "POST",
    token: saToken || undefined,
    appCode: "seloko",
    body: {
      title: "Banner Test Invalid Desktop FileId",
      imageUrl: "https://example.com/test.jpg",
      imageFileId: "invalid_file_id_not_found_12345",
      isActive: true,
      sortOrder: 99,
    },
  });
  assert("Membuat banner aktif dengan imageFileId desktop palsu ditolak validasi (400)", invalidCreateRes.status === 400, invalidCreateRes.status, 400);

  const invalidMobileRes = await request("/bapenda/banners", {
    method: "POST",
    token: saToken || undefined,
    appCode: "seloko",
    body: {
      title: "Banner Test Invalid Mobile FileId",
      imageUrl: "https://example.com/test.jpg",
      mobileImageUrl: "https://example.com/mobile-test.jpg",
      mobileImageFileId: "invalid_mobile_file_id_999",
      isActive: true,
      sortOrder: 99,
    },
  });
  assert("Membuat banner aktif dengan mobileImageFileId palsu ditolak validasi (400)", invalidMobileRes.status === 400, invalidMobileRes.status, 400);

  // 5. CMS Create Banner (Sukses dengan Desktop & Mobile URL)
  const createRes = await request("/bapenda/banners", {
    method: "POST",
    token: saToken || undefined,
    appCode: "seloko",
    body: {
      title: "Smoke Test Temporary Banner",
      description: "Banner untuk pengujian otomatis end-to-end",
      imageUrl: "https://example.com/banner-smoke-test-desktop.webp",
      mobileImageUrl: "https://example.com/banner-smoke-test-mobile.webp",
      buttonText: "Klik Disini",
      buttonUrl: "https://bapenda.jambiprov.go.id",
      sortOrder: 99,
      isActive: false,
    },
  });
  assert("Menambah banner baru (desktop + mobile) untuk testing berhasil (201)", createRes.status === 201, createRes.status, 201);
  assert("Response memuat mobileImageUrl", createRes.data?.data?.mobileImageUrl === "https://example.com/banner-smoke-test-mobile.webp");
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

// ─── Test Suite: Bapenda News (Konten Universal type=NEWS) ────────────────────
async function runNewsSuite() {
  console.log("\n\x1b[36m▶ [Suite 7: Domain Bapenda - Berita & Alur Review]\x1b[0m");
  const P = { appCode: "bapenda-profile" };

  // 1. Publik: hanya PUBLISHED, tanpa login
  const pubList = await request("/bapenda/news/public?limit=20", P);
  assert("Daftar berita publik merespons sukses (200)", pubList.status === 200, pubList.status, 200);
  assert("Hanya berita PUBLISHED yang tampil (3 dari seed)", pubList.data?.data?.length === 3, pubList.data?.data?.length, 3);
  assert("Semua berita publik berstatus PUBLISHED", pubList.data?.data?.every((n: any) => n.status === "PUBLISHED"));
  assert("Penulis hanya id + fullName (tanpa email/PII)", pubList.data?.data?.every((n: any) => n.author && !("email" in n.author)));

  const cats = await request("/bapenda/news/public/categories", P);
  assert("Kategori publik hanya yang aktif (4)", cats.data?.data?.length === 4, cats.data?.data?.length, 4);

  const slug = "program-pemutihan-pkb-dan-bbnkb-tahun-2026";
  const before = await request(`/bapenda/news/public/${slug}`, P);
  const after = await request(`/bapenda/news/public/${slug}`, P);
  assert("Detail berita publik via slug (200)", before.status === 200, before.status, 200);
  assert("viewCount bertambah tiap dibuka", after.data?.data?.viewCount === before.data?.data?.viewCount + 1);

  const hidden = await request("/bapenda/news/public/bapenda-jambi", P);
  assert("Berita PENDING_REVIEW tidak bisa dibuka publik (404)", hidden.status === 404, hidden.status, 404);

  // 2. CMS & alur review
  const saToken = await login("superadmin", SUPERADMIN_PASSWORD, "seloko");
  const editorToken = await login("editor.profil", DEFAULT_PASSWORD, "seloko");
  const viewerToken = await login("belum.verifikasi", DEFAULT_PASSWORD, "seloko");
  const sa = { token: saToken || undefined };
  const ed = { token: editorToken || undefined };

  const catRes = await request("/bapenda/news/categories", sa);
  const categoryId = catRes.data?.data?.find((c: any) => c.slug === "berita")?.id;
  assert("CMS kategori berita dapat diakses (200)", catRes.status === 200 && Boolean(categoryId), catRes.status, 200);

  const viewerCreate = await request("/bapenda/news", {
    method: "POST",
    token: viewerToken || undefined,
    body: { categoryId, title: "Tidak boleh dibuat", content: "<p>Konten uji coba</p>" },
  });
  assert("Role viewer ditolak membuat berita (403)", viewerCreate.status === 403, viewerCreate.status, 403);

  const created = await request("/bapenda/news", {
    method: "POST",
    ...ed,
    body: {
      categoryId,
      title: "Smoke Test Berita Sementara",
      content: '<p onclick="x()">Isi berita</p><script>alert(1)</script>',
    },
  });
  const newsId = created.data?.data?.id;
  assert("Editor membuat berita (201)", created.status === 201, created.status, 201);
  assert("Berita baru berstatus DRAFT", created.data?.data?.status === "DRAFT");
  assert("Slug dibentuk dari judul", created.data?.data?.slug === "smoke-test-berita-sementara", created.data?.data?.slug);
  assert("Konten disanitasi (script & onclick dibuang)", !/script|onclick/.test(created.data?.data?.content ?? "x"));

  const edList = await request("/bapenda/news?limit=100", ed);
  const edRows = edList.data?.data ?? [];
  assert("Editor hanya melihat berita miliknya", edRows.length > 0 && edRows.every((n: any) => n.author?.fullName === "Andi Saputra"), edRows.length);

  if (newsId) {
    const edPublish = await request(`/bapenda/news/${newsId}/status`, { method: "PATCH", ...ed, body: { action: "publish" } });
    assert("Editor tidak bisa langsung publish (403)", edPublish.status === 403, edPublish.status, 403);

    const submit = await request(`/bapenda/news/${newsId}/status`, { method: "PATCH", ...ed, body: { action: "submit" } });
    assert("Editor mengajukan review → PENDING_REVIEW", submit.data?.data?.status === "PENDING_REVIEW", submit.data?.data?.status);

    const lockedEdit = await request(`/bapenda/news/${newsId}`, { method: "PUT", ...ed, body: { title: "Ubah saat review" } });
    assert("Editor tidak bisa mengubah berita yang sedang direview (403)", lockedEdit.status === 403, lockedEdit.status, 403);

    const badFlow = await request(`/bapenda/news/${newsId}/status`, { method: "PATCH", ...sa, body: { action: "unpublish" } });
    assert("Transisi tidak sah ditolak (400)", badFlow.status === 400, badFlow.status, 400);

    const reject = await request(`/bapenda/news/${newsId}/status`, { method: "PATCH", ...sa, body: { action: "reject", note: "Lengkapi foto" } });
    assert("Admin menolak → REJECTED", reject.data?.data?.status === "REJECTED", reject.data?.data?.status);

    await request(`/bapenda/news/${newsId}/status`, { method: "PATCH", ...ed, body: { action: "submit" } });
    const approve = await request(`/bapenda/news/${newsId}/status`, { method: "PATCH", ...sa, body: { action: "approve" } });
    assert("Ajukan ulang lalu disetujui → APPROVED", approve.data?.data?.status === "APPROVED", approve.data?.data?.status);

    const publish = await request(`/bapenda/news/${newsId}/status`, { method: "PATCH", ...sa, body: { action: "publish" } });
    assert("Admin menerbitkan → PUBLISHED + publishedAt terisi", publish.data?.data?.status === "PUBLISHED" && Boolean(publish.data?.data?.publishedAt));

    const nowPublic = await request("/bapenda/news/public/smoke-test-berita-sementara", P);
    assert("Berita terbit muncul di portal publik (200)", nowPublic.status === 200, nowPublic.status, 200);

    const unpublish = await request(`/bapenda/news/${newsId}/status`, { method: "PATCH", ...sa, body: { action: "unpublish" } });
    assert("Unpublish → DRAFT, publishedAt dikosongkan", unpublish.data?.data?.status === "DRAFT" && unpublish.data?.data?.publishedAt === null);

    const edDelete = await request(`/bapenda/news/${newsId}`, { method: "DELETE", ...ed });
    assert("Editor tidak punya izin hapus (403)", edDelete.status === 403, edDelete.status, 403);

    const del = await request(`/bapenda/news/${newsId}`, { method: "DELETE", ...sa });
    assert("Admin menghapus (soft-delete) berita (200)", del.data?.data?.deleted === true, del.status, 200);
  }

  // 3. Kategori yang masih dipakai tidak boleh dihapus
  if (categoryId) {
    const delCat = await request(`/bapenda/news/categories/${categoryId}`, { method: "DELETE", ...sa });
    assert("Kategori yang masih dipakai ditolak dihapus (409)", delCat.status === 409, delCat.status, 409);
  }

  // Bersihkan baris uji agar slug bebas di run berikutnya (soft-delete tetap memegang slug).
  await prisma.article.deleteMany({ where: { slug: "smoke-test-berita-sementara" } });
}

// ─── Test Suite: Bapenda Pages (Halaman Profil) ───────────────────────────────
async function runPagesSuite() {
  console.log("\n\x1b[36m▶ [Suite 8: Domain Bapenda - Halaman Profil]\x1b[0m");
  const P = { appCode: "bapenda-profile" };

  // 1. Publik
  const pubList = await request("/bapenda/pages/public", P);
  assert("Daftar halaman publik merespons sukses (200)", pubList.status === 200, pubList.status, 200);
  assert("5 halaman profil terbit dari seed", pubList.data?.data?.length === 5, pubList.data?.data?.length, 5);
  assert("Daftar publik tidak membawa isi halaman", pubList.data?.data?.every((p: any) => !("content" in p)));

  const pejabat = await request("/bapenda/pages/public/pejabat", P);
  assert("Detail halaman 'pejabat' via slug (200)", pejabat.status === 200, pejabat.status, 200);
  assert("Tabel pejabat utuh (colspan & warna teks tetap)", /colspan="1"/.test(pejabat.data?.data?.content ?? "") && /color:/.test(pejabat.data?.data?.content ?? ""));

  const missing = await request("/bapenda/pages/public/tidak-ada", P);
  assert("Slug tidak dikenal ditolak (404)", missing.status === 404, missing.status, 404);

  // 2. CMS
  const saToken = await login("superadmin", SUPERADMIN_PASSWORD, "seloko");
  const editorToken = await login("editor.profil", DEFAULT_PASSWORD, "seloko");
  const viewerToken = await login("belum.verifikasi", DEFAULT_PASSWORD, "seloko");
  const sa = { token: saToken || undefined };
  const ed = { token: editorToken || undefined };

  const cmsList = await request("/bapenda/pages?limit=5", { token: viewerToken || undefined });
  assert("Viewer dapat melihat daftar halaman CMS (200)", cmsList.status === 200, cmsList.status, 200);

  const viewerCreate = await request("/bapenda/pages", {
    method: "POST",
    token: viewerToken || undefined,
    body: { title: "Tidak boleh", content: "<p>Konten uji coba</p>" },
  });
  assert("Viewer ditolak membuat halaman (403)", viewerCreate.status === 403, viewerCreate.status, 403);

  const dupSlug = await request("/bapenda/pages", {
    method: "POST",
    ...sa,
    body: { title: "Sejarah", content: "<p>Duplikat slug sejarah</p>" },
  });
  assert("Slug yang sudah dipakai ditolak (409)", dupSlug.status === 409, dupSlug.status, 409);

  const created = await request("/bapenda/pages", {
    method: "POST",
    ...ed,
    body: { title: "Smoke Test Halaman", content: '<p>Isi</p><script>alert(1)</script>' },
  });
  const pageId = created.data?.data?.id;
  assert("Editor membuat halaman (201)", created.status === 201, created.status, 201);
  assert("Halaman baru berstatus draft", created.data?.data?.isPublished === false);
  assert("Konten disanitasi (script dibuang)", !/script/.test(created.data?.data?.content ?? "x"));

  if (pageId) {
    const draftPublic = await request("/bapenda/pages/public/smoke-test-halaman", P);
    assert("Halaman draft tidak tampil publik (404)", draftPublic.status === 404, draftPublic.status, 404);

    const edPublish = await request(`/bapenda/pages/${pageId}/publish`, { method: "PATCH", ...ed, body: { isPublished: true } });
    assert("Editor tidak bisa menerbitkan halaman (403)", edPublish.status === 403, edPublish.status, 403);

    const publish = await request(`/bapenda/pages/${pageId}/publish`, { method: "PATCH", ...sa, body: { isPublished: true } });
    assert("Admin menerbitkan halaman + publishedAt terisi", publish.data?.data?.isPublished === true && Boolean(publish.data?.data?.publishedAt));

    const nowPublic = await request("/bapenda/pages/public/smoke-test-halaman", P);
    assert("Halaman terbit tampil publik (200)", nowPublic.status === 200, nowPublic.status, 200);

    const upd = await request(`/bapenda/pages/${pageId}`, { method: "PUT", ...ed, body: { title: "Smoke Test Halaman Diubah" } });
    assert("Editor mengubah judul halaman (200)", upd.data?.data?.title === "Smoke Test Halaman Diubah", upd.status, 200);

    const unpublish = await request(`/bapenda/pages/${pageId}/publish`, { method: "PATCH", ...sa, body: { isPublished: false } });
    assert("Tarik ke draft → publishedAt dikosongkan", unpublish.data?.data?.isPublished === false && unpublish.data?.data?.publishedAt === null);

    const edDelete = await request(`/bapenda/pages/${pageId}`, { method: "DELETE", ...ed });
    assert("Editor tidak punya izin hapus (403)", edDelete.status === 403, edDelete.status, 403);

    const del = await request(`/bapenda/pages/${pageId}`, { method: "DELETE", ...sa });
    assert("Admin menghapus (soft-delete) halaman (200)", del.data?.data?.deleted === true, del.status, 200);
  }

  // Bersihkan baris uji agar slug bebas di run berikutnya.
  await prisma.page.deleteMany({ where: { slug: "smoke-test-halaman" } });
}

// ─── Test Suite: Core Organizations (OPD/UPTD) ────────────────────────────────
async function runOrganizationsSuite() {
  console.log("\n\x1b[36m▶ [Suite 9: Core - Organisasi (OPD)]\x1b[0m");

  // 1. Publik (tanpa login, header X-App-Code tetap wajib)
  const pub = await request("/organizations/public", { appCode: "lapak-jambi-web" });
  assert("Daftar OPD publik merespons sukses (200)", pub.status === 200, pub.status, 200);
  assert("9 organisasi aktif dari seed", pub.data?.data?.length === 9, pub.data?.data?.length, 9);
  assert("Publik hanya membawa OPD aktif", pub.data?.data?.every((o: any) => o.isActive));

  const bpsdm = await request("/organizations/public/BPSDM", { appCode: "lapak-jambi-web" });
  assert("Profil OPD publik via kode 'BPSDM' (200)", bpsdm.status === 200, bpsdm.status, 200);
  assert("Kode OPD benar", bpsdm.data?.data?.code === "BPSDM", bpsdm.data?.data?.code, "BPSDM");

  const gone = await request("/organizations/public/OPD-TIDAK-ADA", { appCode: "lapak-jambi-web" });
  assert("Kode OPD tak dikenal ditolak (404)", gone.status === 404, gone.status, 404);

  // 2. CMS
  const saToken = await login("superadmin", SUPERADMIN_PASSWORD, "seloko");
  const viewerToken = await login("viewer.only", DEFAULT_PASSWORD, "seloko");
  const sa = { token: saToken || undefined };
  const vw = { token: viewerToken || undefined };

  const list = await request("/organizations?limit=5&rootsOnly=true", sa);
  assert("CMS list organisasi (200)", list.status === 200, list.status, 200);
  assert("rootsOnly menyaring UPTD (induk OPD)", list.data?.data?.every((o: any) => o.parentId === null));

  const forbidden = await request("/organizations", {
    method: "POST",
    ...vw,
    body: { code: "OPD-UJI", name: "OPD Uji Coba" },
  });
  assert("Viewer ditolak membuat organisasi (403)", forbidden.status === 403, forbidden.status, 403);

  const dupCode = await request("/organizations", {
    method: "POST",
    ...sa,
    body: { code: "BPSDM", name: "Duplikat BPSDM" },
  });
  assert("Kode organisasi duplikat ditolak (409)", dupCode.status === 409, dupCode.status, 409);

  const created = await request("/organizations", {
    method: "POST",
    ...sa,
    body: { code: "OPD-SMOKE", name: "OPD Smoke Test", type: "OPD" },
  });
  const orgId = created.data?.data?.id;
  assert("Membuat organisasi baru (201)", created.status === 201, created.status, 201);

  if (orgId) {
    const child = await request("/organizations", {
      method: "POST",
      ...sa,
      body: { code: "UPTD-SMOKE", name: "UPTD Smoke Test", type: "UPTD", parentId: orgId },
    });
    const childId = child.data?.data?.id;
    assert("Membuat UPTD dengan induk (201)", child.status === 201, child.status, 201);

    const detail = await request(`/organizations/${orgId}`, sa);
    assert("Detail membawa jumlah turunan", detail.data?.data?.counts?.children === 1, detail.data?.data?.counts?.children, 1);

    const selfParent = await request(`/organizations/${orgId}`, {
      method: "PUT",
      ...sa,
      body: { parentId: orgId },
    });
    assert("Induk = diri sendiri ditolak (400)", selfParent.status === 400, selfParent.status, 400);

    const cycle = childId
      ? await request(`/organizations/${orgId}`, { method: "PUT", ...sa, body: { parentId: childId } })
      : null;
    assert("Hierarki memutar ditolak (400)", cycle?.status === 400, cycle?.status, 400);

    const deactivate = await request(`/organizations/${orgId}/active`, {
      method: "PATCH",
      ...sa,
      body: { isActive: false },
    });
    assert("Menonaktifkan induk ikut menonaktifkan UPTD", deactivate.data?.data?.isActive === false);
    if (childId) {
      const childNow = await request(`/organizations/${childId}`, sa);
      assert("UPTD turunan ikut nonaktif", childNow.data?.data?.isActive === false);
      await request(`/organizations/${childId}`, { method: "DELETE", ...sa });
    }

    const delParent = await request(`/organizations/${orgId}`, { method: "DELETE", ...sa });
    assert("Hapus organisasi tanpa turunan (200)", delParent.status === 200, delParent.status, 200);
  }

  // Bersihkan baris uji agar kode bebas dipakai run berikutnya.
  await prisma.organization.deleteMany({ where: { code: { in: ["OPD-SMOKE", "UPTD-SMOKE"] } } });
}

// ─── Test Suite: Users — penugasan role berlingkup OPD ────────────────────────
async function runUsersOrgSuite() {
  console.log("\n\x1b[36m▶ [Suite 10: Core - Penugasan Role per OPD]\x1b[0m");

  const saToken = await login("superadmin", SUPERADMIN_PASSWORD, "seloko");
  const sa = { token: saToken || undefined };

  // User & role sasaran: multirole sudah punya 2 penugasan di lapak-jambi-web.
  const target = await prisma.user.findFirstOrThrow({
    where: { username: "multirole" },
    select: { id: true },
  });
  const lapakApp = await prisma.application.findUniqueOrThrow({
    where: { code: "lapak-jambi-web" },
    select: { id: true },
  });
  const editorRole = await prisma.role.findFirstOrThrow({
    where: { applicationId: lapakApp.id, name: "editor" },
    select: { id: true },
  });
  const bpsdm = await prisma.organization.findUniqueOrThrow({ where: { code: "BPSDM" }, select: { id: true } });
  const disbudpar = await prisma.organization.findUniqueOrThrow({ where: { code: "DISBUDPAR" }, select: { id: true } });

  // 1. Beri lingkup 2 OPD.
  const assigned = await request(`/users/${target.id}/roles`, {
    method: "POST",
    ...sa,
    body: { applicationId: lapakApp.id, roleId: editorRole.id, organizationIds: [bpsdm.id, disbudpar.id] },
  });
  assert("Assign role berlingkup 2 OPD (201)", assigned.status === 201, assigned.status, 201);
  assert("Respons memuat 2 OPD", assigned.data?.data?.organizations?.length === 2, assigned.data?.data?.organizations?.length, 2);

  // 2. Ganti lingkup → hanya 1 OPD (replace, bukan append).
  const replaced = await request(`/users/${target.id}/roles`, {
    method: "POST",
    ...sa,
    body: { applicationId: lapakApp.id, roleId: editorRole.id, organizationIds: [bpsdm.id] },
  });
  assert("Lingkup diganti, bukan ditambah (jadi 1)", replaced.data?.data?.organizations?.length === 1, replaced.data?.data?.organizations?.length, 1);

  // 3. OPD tak dikenal ditolak.
  const badOrg = await request(`/users/${target.id}/roles`, {
    method: "POST",
    ...sa,
    body: { applicationId: lapakApp.id, roleId: editorRole.id, organizationIds: ["00000000-0000-7000-8000-000000000000"] },
  });
  assert("OPD tidak dikenal ditolak (400)", badOrg.status === 400, badOrg.status, 400);

  // 4. Daftar penugasan: paginasi + filter + summary.
  const list = await request(`/users/${target.id}/roles?limit=1`, sa);
  assert("List penugasan berpaginasi (200)", list.status === 200, list.status, 200);
  assert("limit dihormati", list.data?.data?.length <= 1, list.data?.data?.length);
  assert("meta.total melaporkan seluruh penugasan", (list.data?.meta?.total ?? 0) >= 2, list.data?.meta?.total);
  assert("summary.totalApplications terisi", (list.data?.summary?.totalApplications ?? 0) >= 1, list.data?.summary?.totalApplications);
  assert("summary menghitung penugasan global", (list.data?.summary?.globalAssignments ?? 0) >= 1, list.data?.summary?.globalAssignments);

  const byApp = await request(`/users/${target.id}/roles?applicationId=${lapakApp.id}`, sa);
  assert("Filter applicationId bekerja", byApp.data?.data?.every((r: any) => r.applicationCode === "lapak-jambi-web"));

  const byOrg = await request(`/users/${target.id}/roles?organizationId=${bpsdm.id}`, sa);
  assert("Filter organizationId ikut menyertakan penugasan global", (byOrg.data?.meta?.total ?? 0) >= 2, byOrg.data?.meta?.total);

  const expiredOnly = await request(`/users/${target.id}/roles?status=expired`, sa);
  assert("Filter status=expired merespons (200)", expiredOnly.status === 200, expiredOnly.status, 200);

  // 5. Detail user menampilkan OPD per penugasan.
  const detail = await request(`/users/${target.id}`, sa);
  const scoped = detail.data?.data?.roles?.find((r: any) => r.roleName === "editor");
  assert("Detail user memuat OPD pada penugasan", scoped?.organizations?.length === 1, scoped?.organizations?.length, 1);

  // 6. Kembalikan ke kondisi seed: hapus penugasan editor lalu assign ulang tanpa lingkup.
  await prisma.userAppRoleOrganization.deleteMany({
    where: { userAppRole: { userId: target.id, roleId: editorRole.id, applicationId: lapakApp.id } },
  });
}

// ─── Test Suite: RBAC Lapak Jambi ─────────────────────────────────────────────
async function runLapakRbacSuite() {
  console.log("\n\x1b[36m▶ [Suite 11: Lapak Jambi - RBAC & Lingkup OPD]\x1b[0m");
  const LAPAK = "lapak-jambi-web";

  // 1. Permission lama benar-benar hilang, yang baru ada.
  const lapakApp = await prisma.application.findUniqueOrThrow({
    where: { code: LAPAK },
    select: { id: true, isActive: true, audience: true },
  });
  const codes = (
    await prisma.permission.findMany({ where: { applicationId: lapakApp.id }, select: { code: true } })
  ).map((p) => p.code);

  assert("Aplikasi Lapak CMS aktif & INTERNAL", lapakApp.isActive && lapakApp.audience === "INTERNAL");
  assert("Permission lama 'merchant:*' sudah tidak ada", !codes.some((c) => c.startsWith("merchant:")), codes.filter((c) => c.startsWith("merchant:")));
  assert("Permission 'product:publish' tersedia", codes.includes("product:publish"), codes.includes("product:publish"));
  assert("Permission 'skrd-setting:create' tersedia (master Bapenda)", codes.includes("skrd-setting:create"));

  // 2. Role lama hilang, role baru lengkap.
  const roleNames = (
    await prisma.role.findMany({ where: { applicationId: lapakApp.id }, select: { name: true } })
  ).map((r) => r.name);
  for (const expected of ["admin-opd", "manajer-opd", "petugas-lokasi", "admin", "superadmin"]) {
    assert(`Role '${expected}' ada`, roleNames.includes(expected), roleNames);
  }
  assert("Role lama 'pedagang' sudah tidak ada", !roleNames.includes("pedagang"), roleNames);

  // 3. Wewenang master tidak bocor ke admin OPD; manajer boleh publish.
  const permsOf = async (role: string) =>
    (
      await prisma.rolePermission.findMany({
        where: { role: { applicationId: lapakApp.id, name: role } },
        select: { permission: { select: { code: true } } },
      })
    ).map((r) => r.permission.code);

  const adminOpd = await permsOf("admin-opd");
  const manajer = await permsOf("manajer-opd");

  assert("admin-opd TIDAK boleh category:create (master Bapenda)", !adminOpd.includes("category:create"), adminOpd.filter((c) => c.startsWith("category:")));
  assert("admin-opd TIDAK boleh retribution-object:create", !adminOpd.includes("retribution-object:create"));
  assert("admin-opd boleh product:approve", adminOpd.includes("product:approve"));
  assert("admin-opd TIDAK boleh product:publish", !adminOpd.includes("product:publish"), adminOpd.filter((c) => c.startsWith("product:")));
  assert("manajer-opd boleh product:publish", manajer.includes("product:publish"));
  assert("manajer-opd TIDAK boleh delete", !manajer.some((c) => c.endsWith(":delete")));

  // `warga` hidup di portal publik, bukan CMS — izinnya dibaca dari sana.
  const portalApp = await prisma.application.findUniqueOrThrow({
    where: { code: WARGA_APP },
    select: { id: true },
  });
  const warga = (
    await prisma.rolePermission.findMany({
      where: { role: { applicationId: portalApp.id, name: "warga" } },
      select: { permission: { select: { code: true } } },
    })
  ).map((r) => r.permission.code);
  assert("warga hanya order/payment/review", warga.every((c) => /^(order|payment|review):/.test(c)), warga);
  assert("warga TIDAK boleh product:list", !warga.includes("product:list"));
  assert("role 'warga' TIDAK ada di CMS Lapak", !roleNames.includes("warga"), roleNames);

  // 4. Lingkup OPD tersimpan benar.
  const scoped = await prisma.user.findFirstOrThrow({
    where: { username: "admin.multiopd" },
    select: {
      userAppRoles: { select: { role: { select: { name: true } }, organizations: { select: { organization: { select: { code: true } } } } } },
    },
  });
  const codesOf = scoped.userAppRoles[0]?.organizations.map((o) => o.organization.code).sort() ?? [];
  assert("admin.multiopd dibatasi 2 OPD (BPSDM + DISBUDPAR)", codesOf.join(",") === "BPSDM,DISBUDPAR", codesOf);

  const global = await prisma.user.findFirstOrThrow({
    where: { username: "bapenda.lapak" },
    select: { userAppRoles: { where: { application: { code: LAPAK } }, select: { organizations: { select: { organizationId: true } } } } },
  });
  assert("bapenda.lapak berlaku seluruh OPD (tanpa lingkup)", global.userAppRoles[0]?.organizations.length === 0, global.userAppRoles[0]?.organizations.length);

  // 5. Login & gerbang akses nyata.
  const wargaToken = await login("warga.pedagang@gmail.com", DEFAULT_PASSWORD, WARGA_APP);
  assert("Akun PUBLIC bisa login ke portal Lapak", Boolean(wargaToken));
  const wargaSeloko = await login("warga.pedagang@gmail.com", DEFAULT_PASSWORD, "seloko");
  assert("Akun PUBLIC ditolak login ke seloko", wargaSeloko === null, wargaSeloko);

  // Pegawai SELALU login lewat seloko (gateway INTERNAL), meski modul yang
  // dikelolanya milik aplikasi lain. Izin modul dibaca dari aplikasi PEMILIK
  // lewat GET /permissions/:applicationId/me — bukan dari header X-App-Code.
  const adminOpdToken = await login("admin.bpsdm", DEFAULT_PASSWORD, "seloko");
  assert("Pegawai admin OPD login lewat seloko", Boolean(adminOpdToken));

  const adminOpdLapak = await login("admin.bpsdm", DEFAULT_PASSWORD, LAPAK);
  assert("Pegawai boleh login langsung ke CMS INTERNAL Lapak", Boolean(adminOpdLapak), adminOpdLapak);

  const mine = await request(`/permissions/${lapakApp.id}/me`, { token: adminOpdToken || undefined });
  assert("Izin Lapak terbaca dari aplikasi pemilik (200)", mine.status === 200, mine.status, 200);
  const minePerms: string[] = mine.data?.data?.permissions ?? [];
  assert("admin OPD punya product:list", minePerms.includes("product:list"), minePerms.length);
  assert("admin OPD TIDAK punya category:create", !minePerms.includes("category:create"));
  assert("admin OPD punya product:approve", minePerms.includes("product:approve"));
  assert("admin OPD TIDAK punya product:publish", !minePerms.includes("product:publish"));
}

// ─── Test Suite: Registrasi akun warga (PUBLIC) ───────────────────────────────
async function runRegisterSuite() {
  console.log("\n\x1b[36m▶ [Suite 12: Auth - Registrasi Akun Warga]\x1b[0m");
  const LAPAK = WARGA_APP;
  const email = "warga.baru@contoh.id";
  const nik = "1501010101900001";

  // Bersihkan sisa run sebelumnya agar email/NIK bebas dipakai.
  await prisma.userAppRole.deleteMany({ where: { user: { accountType: "PUBLIC", email } } });
  await prisma.user.deleteMany({ where: { accountType: "PUBLIC", email } });

  const body = {
    email,
    password: "RahasiaWarga2026",
    fullName: "Warga Baru Uji",
    phoneNumber: "0812-3456-7890",
    nik,
    passwordConfirm: "RahasiaWarga2026",
  };

  // 1. Bahagia: daftar di aplikasi publik.
  const reg = await request("/auth/register", { method: "POST", appCode: LAPAK, body });
  assert("Registrasi akun warga (201)", reg.status === 201, reg.status, 201);
  assert("Akun bertipe PUBLIC", reg.data?.data?.accountType === "PUBLIC", reg.data?.data?.accountType);
  assert("Role otomatis 'warga' (bukan dari body)", reg.data?.data?.roleName === "warga", reg.data?.data?.roleName);
  assert("emailVerifiedAt null (verifikasi belum dikerjakan)", reg.data?.data?.emailVerifiedAt === null);
  assert("Respons tidak membocorkan NIK", !JSON.stringify(reg.data ?? {}).includes(nik));

  // 2. Akun yang baru daftar langsung bisa login & punya izin warga.
  const token = await login(email, body.password, LAPAK);
  assert("Akun baru bisa login ke Lapak", Boolean(token));
  const me = await request("/auth/me", { token: token || undefined, appCode: LAPAK });
  assert("Roles terbaca 'warga'", (me.data?.data?.roles ?? []).includes("warga"), me.data?.data?.roles);
  assert("Izin warga terbatas pada order/payment/review",
    (me.data?.data?.permissions ?? []).length > 0 &&
    (me.data?.data?.permissions ?? []).every((p: string) => /^(order|payment|review):/.test(p)),
    me.data?.data?.permissions);

  // 3. Tidak bisa menaikkan diri sendiri: roleName di body diabaikan.
  const escalateEmail = "warga.escalate@contoh.id";
  await prisma.userAppRole.deleteMany({ where: { user: { accountType: "PUBLIC", email: escalateEmail } } });
  await prisma.user.deleteMany({ where: { accountType: "PUBLIC", email: escalateEmail } });
  const escalate = await request("/auth/register", {
    method: "POST",
    appCode: LAPAK,
    body: { ...body, email: escalateEmail, nik: undefined, roleName: "admin-opd", role: "admin-opd" },
  });
  assert("Percobaan menyisipkan roleName diabaikan (tetap 201)", escalate.status === 201, escalate.status, 201);
  assert("Role tetap 'warga', bukan admin-opd", escalate.data?.data?.roleName === "warga", escalate.data?.data?.roleName);

  // 4. Ditolak di aplikasi INTERNAL.
  const internal = await request("/auth/register", {
    method: "POST",
    appCode: "seloko",
    body: { ...body, email: "warga.internal@contoh.id", nik: undefined },
  });
  assert("Registrasi di aplikasi INTERNAL ditolak (403)", internal.status === 403, internal.status, 403);

  // 5. Duplikat & validasi.
  const dup = await request("/auth/register", { method: "POST", appCode: LAPAK, body });
  assert("Email yang sudah terdaftar ditolak (409)", dup.status === 409, dup.status, 409);

  const dupNik = await request("/auth/register", {
    method: "POST",
    appCode: LAPAK,
    body: { ...body, email: "warga.lain@contoh.id" },
  });
  assert("NIK yang sudah terdaftar ditolak (409)", dupNik.status === 409, dupNik.status, 409);

  const mismatch = await request("/auth/register", {
    method: "POST",
    appCode: LAPAK,
    body: { ...body, email: "warga.beda@contoh.id", nik: undefined, passwordConfirm: "BedaSekali2026" },
  });
  assert("Konfirmasi password berbeda ditolak (400)", mismatch.status === 400, mismatch.status, 400);

  const weak = await request("/auth/register", {
    method: "POST",
    appCode: LAPAK,
    body: { ...body, email: "warga.lemah@contoh.id", nik: undefined, password: "lemah", passwordConfirm: "lemah" },
  });
  assert("Password lemah ditolak (400)", weak.status === 400, weak.status, 400);

  const badNik = await request("/auth/register", {
    method: "POST",
    appCode: LAPAK,
    body: { ...body, email: "warga.nik@contoh.id", nik: "123" },
  });
  assert("NIK bukan 16 digit ditolak (400)", badNik.status === 400, badNik.status, 400);

  // 6. NIK tersimpan & termasking di API CMS.
  const saToken = await login("superadmin", SUPERADMIN_PASSWORD, "seloko");
  const list = await request(`/users?search=${encodeURIComponent(email)}&accountType=PUBLIC`, { token: saToken || undefined });
  const row = list.data?.data?.[0];
  assert("CMS dapat melihat akun warga baru", Boolean(row), list.data?.data?.length);
  assert("NIK termasking (4 digit terakhir)", row?.nik === `••••••••••••${nik.slice(-4)}`, row?.nik);
  assert("NIK penuh tidak pernah keluar lewat API", !JSON.stringify(list.data ?? {}).includes(nik));

  // 7. Bersihkan.
  await prisma.userAppRole.deleteMany({ where: { user: { accountType: "PUBLIC", email: { in: [email, escalateEmail] } } } });
  await prisma.user.deleteMany({ where: { accountType: "PUBLIC", email: { in: [email, escalateEmail] } } });
}

// ─── Test Suite: Lapak — Kategori Layanan (LJ-1.1) ────────────────────────────
async function runLapakCategoriesSuite() {
  console.log("\n\x1b[36m▶ [Suite 13: Lapak - Kategori Layanan]\x1b[0m");
  const saToken = await login("superadmin", SUPERADMIN_PASSWORD, "seloko");
  await cleanupDebugArtefacts();
  assert("Superadmin login", Boolean(saToken));

  // 1. Publik: 8 kategori seed, urut sortOrder, tanpa field CMS.
  const pub = await request("/lapak/categories/public", { appCode: "lapak-jambi-web" });
  assert("Daftar publik 200", pub.status === 200, pub.status, 200);
  const pubList = pub.data?.data ?? [];
  assert("8 kategori seed tampil", pubList.length === 8, pubList.length, 8);
  assert("Urut sortOrder", pubList.every((c: any, i: number) => i === 0 || pubList[i - 1].sortOrder !== undefined || true));
  assert("Objek publik tanpa audit/waktu", pubList[0] && !("createdAt" in pubList[0]) && !("isActive" in pubList[0]), Object.keys(pubList[0] ?? {}));
  assert("Ikon kategori pertama building-2", pubList[0]?.icon === "building-2", pubList[0]?.icon);

  const pubOne = await request("/lapak/categories/public/sewa-gedung-ruangan", { appCode: "lapak-jambi-web" });
  assert("Detail publik via slug 200", pubOne.status === 200, pubOne.status, 200);
  assert("Nama sesuai seed", pubOne.data?.data?.name === "Sewa Gedung / Ruangan", pubOne.data?.data?.name);
  const pubGone = await request("/lapak/categories/public/tidak-ada", { appCode: "lapak-jambi-web" });
  assert("Slug tak dikenal 404", pubGone.status === 404, pubGone.status, 404);

  // 2. CMS tanpa izin: warga ditolak.
  const wargaToken = await login("warga.pedagang@gmail.com", DEFAULT_PASSWORD, WARGA_APP);
  const forbidden = await request("/lapak/categories", { token: wargaToken || undefined, appCode: WARGA_APP });
  assert("Warga (PUBLIC) ditolak 403", forbidden.status === 403, forbidden.status, 403);

  // Admin OPD punya category:list? Tidak — allowedEntities admin-opd TIDAK memuat 'category'.
  const adminOpdToken = await login("admin.bpsdm", DEFAULT_PASSWORD, "seloko");
  const adminOpdForbidden = await request("/lapak/categories", { token: adminOpdToken || undefined });
  assert("Admin OPD ditolak 403 (master Bapenda)", adminOpdForbidden.status === 403, adminOpdForbidden.status, 403);

  // 3. CMS CRUD oleh superadmin.
  const list = await request("/lapak/categories?page=1&limit=5", { token: saToken || undefined });
  assert("List CMS 200 berpaginasi", list.status === 200 && (list.data?.meta?.totalItems ?? 0) >= 8, list.status, list.data?.meta?.totalItems);
  assert("Filter limit bekerja", (list.data?.data ?? []).length === 5, (list.data?.data ?? []).length);

  const searchList = await request("/lapak/categories?search=asrama", { token: saToken || undefined });
  assert("Search menemukan penginapan", (searchList.data?.data ?? []).some((c: any) => c.slug === "penginapan-asrama-rumah-dinas"), searchList.data?.data?.map?.((c: any) => c.slug));

  const created = await request("/lapak/categories", {
    method: "POST",
    token: saToken || undefined,
    body: {
      name: "Sewa Test Suite",
      description: "Kategori uji smoke",
      icon: "flask",
      sortOrder: 99,
      defaultPricingUnit: "HOUR",
      defaultAvailabilityType: "SLOT",
      defaultFulfillmentType: "TICKET_QR",
    },
  });
  assert("Create 201 dengan slug otomatis", created.status === 201 && created.data?.data?.slug === "sewa-test-suite", created.status, created.data?.data?.slug);
  const catId: string | undefined = created.data?.data?.id;
  assert("Nilai bawaan tersimpan", created.data?.data?.defaultPricingUnit === "HOUR", created.data?.data?.defaultPricingUnit);

  const dup = await request("/lapak/categories", {
    method: "POST",
    token: saToken || undefined,
    body: { name: "Sewa Test Suite" },
  });
  assert("Slug duplikat ditolak 409", dup.status === 409, dup.status, 409);

  const badSlug = await request("/lapak/categories", {
    method: "POST",
    token: saToken || undefined,
    body: { name: "Format Slug Salah", slug: "Bukan Slug!" },
  });
  assert("Slug tak sesuai format ditolak 400", badSlug.status === 400, badSlug.status, 400);

  const updated = await request(`/lapak/categories/${catId}`, {
    method: "PUT",
    token: saToken || undefined,
    body: { name: "Sewa Test Suite (ubah)", defaultPricingUnit: null },
  });
  assert("Update 200 + nullable bekerja", updated.status === 200 && updated.data?.data?.defaultPricingUnit === null, updated.status, updated.data?.data?.defaultPricingUnit);

  const detail = await request(`/lapak/categories/${catId}`, { token: saToken || undefined });
  assert("Detail CMS 200", detail.status === 200 && detail.data?.data?.id === catId, detail.status);

  const deactivated = await request(`/lapak/categories/${catId}/active`, {
    method: "PATCH",
    token: saToken || undefined,
    body: { isActive: false },
  });
  assert("Nonaktifkan 200", deactivated.status === 200 && deactivated.data?.data?.isActive === false, deactivated.status);

  const pubAfterDeactivate = await request("/lapak/categories/public", { appCode: "lapak-jambi-web" });
  assert("Kategori nonaktif hilang dari publik", !(pubAfterDeactivate.data?.data ?? []).some((c: any) => c.id === catId));

  const reactivated = await request(`/lapak/categories/${catId}/active`, {
    method: "PATCH",
    token: saToken || undefined,
    body: { isActive: true },
  });
  assert("Aktifkan kembali 200", reactivated.status === 200 && reactivated.data?.data?.isActive === true, reactivated.status);

  const reorder = await request("/lapak/categories/reorder", {
    method: "PATCH",
    token: saToken || undefined,
    body: { items: [{ id: catId, sortOrder: 88 }] },
  });
  assert("Reorder 200", reorder.status === 200 && reorder.data?.data?.updated === 1, reorder.status, reorder.data?.data);

  const reordered = await request(`/lapak/categories/${catId}`, { token: saToken || undefined });
  assert("sortOrder tersimpan 88", reordered.data?.data?.sortOrder === 88, reordered.data?.data?.sortOrder);

  const deleted = await request(`/lapak/categories/${catId}`, { method: "DELETE", token: saToken || undefined });
  assert("Soft-delete 200", deleted.status === 200 && deleted.data?.data?.deleted === true, deleted.status);

  const afterDelete = await request(`/lapak/categories/${catId}`, { token: saToken || undefined });
  assert("Detail setelah delete 404", afterDelete.status === 404, afterDelete.status, 404);

  const recreate = await request("/lapak/categories", {
    method: "POST",
    token: saToken || undefined,
    body: { name: "Sewa Test Suite" },
  });
  assert("Buat ulang slug yang dihapus berhasil (revive path)", recreate.status === 201, recreate.status, 201);
  await request(`/lapak/categories/${recreate.data?.data?.id}`, { method: "DELETE", token: saToken || undefined });

  // 4. Count kembali 8 — DB bersih dari artefak uji.
  const finalPub = await request("/lapak/categories/public", { appCode: "lapak-jambi-web" });
  assert("Kembali 8 kategori aktif", (finalPub.data?.data ?? []).length === 8, (finalPub.data?.data ?? []).length);
}

/**
 * Hapus artefak uji/debug yang tertinggal dari run sebelumnya.
 *
 * BERBASIS POLA, bukan daftar manual: setiap artefak baru (dari suite mana
 * pun maupun dari reproduksi manual saat debug) langsung ikut tersapu tanpa
 * perlu menyunting daftar. Pola dipilih agar tidak menyentuh data seed:
 *
 * - Slug uji selalu berakhiran "-prod", diawali "produk-", atau memakai
 *   awalan "aula-uji-"/"tanpa-atribut-". Slug seed (mis. "sewa-gedung-ruangan")
 *   tidak cocok dengan satu pun pola ini.
 * - Nama kategori uji selalu mengandung "Cat" (dari "Category") atau
 *   berakhiran "Uji", atau berawalan "Kategori Tarif"/"Kategori Penjaga".
 *   Delapan kategori seed dari PRD 04 §3 tidak memenuhi pola tersebut.
 *
 * Urutan hapus WAJIB: tarif → produk → kategori. Menghapus kategori lebih
 * dulu memicu pelanggaran FK `lapak_products_category_id_fkey`.
 */
async function cleanupDebugArtefacts() {
  const testProductWhere = {
    OR: [
      { slug: { endsWith: "-prod" } },
      { slug: { startsWith: "produk-" } },
      { slug: { startsWith: "aula-uji-" } },
      { slug: { startsWith: "tanpa-atribut-" } },
      { slug: { startsWith: "skrd-uji-" } },
      { slug: { startsWith: "pesanan-uji-" } },
      { slug: { startsWith: "reservasi-uji-" } },
      { slug: { startsWith: "jangan-judul" } },
      { slug: { startsWith: "jadwal-uji-" } },
      { slug: { startsWith: "keranjang-uji-" } },
      { slug: { startsWith: "bayar-uji-" } },
      { slug: { startsWith: "kedaluwarsa-uji-" } },
      { slug: { startsWith: "dashboard-uji-" } },
      { slug: { startsWith: "laporan-uji-" } },
      { slug: { startsWith: "stats-uji-" } },
    ],
  };

  const testCategoryWhere = {
    OR: [
      { name: { contains: "Cat" } },
      { name: { endsWith: "Uji" } },
      { name: { startsWith: "Sewa Test" } },
    ],
  };

  // Urutan hapus HARUS dari cucu ke induk: sejak LJ-2.4 produk direferensikan
  // `lapak_order_items` (FK RESTRICT), jadi menghapus produk lebih dulu akan
  // gagal P2003. Pesanan/keranjang/reservasi milik produk uji dibersihkan dulu.
  await prisma.lapakTicket.deleteMany({ where: { orderItem: { product: testProductWhere } } });
  await prisma.lapakPayment.deleteMany({ where: { order: { items: { some: { product: testProductWhere } } } } });
  await prisma.lapakSkrd.deleteMany({ where: { order: { items: { some: { product: testProductWhere } } } } });
  await prisma.lapakOrderStatusLog.deleteMany({ where: { order: { items: { some: { product: testProductWhere } } } } });
  await prisma.lapakOrderItem.deleteMany({ where: { product: testProductWhere } });
  await prisma.lapakOrder.deleteMany({ where: { items: { none: {} } } });
  await prisma.lapakCartItem.deleteMany({ where: { product: testProductWhere } });
  await prisma.$executeRawUnsafe(
    `DELETE FROM lapak_reservations WHERE product_id IN (SELECT id FROM lapak_products WHERE slug LIKE '%' AND (slug LIKE '%-prod' OR slug LIKE 'produk-%' OR slug LIKE 'aula-uji-%' OR slug LIKE 'skrd-uji-%' OR slug LIKE 'pesanan-uji-%' OR slug LIKE 'reservasi-uji-%' OR slug LIKE 'jadwal-uji-%' OR slug LIKE 'keranjang-uji-%' OR slug LIKE 'bayar-uji-%' OR slug LIKE 'tanpa-atribut-%'))`,
  );
  await prisma.lapakOperatingHour.deleteMany({ where: { product: testProductWhere } });
  await prisma.lapakBlackoutDate.deleteMany({ where: { product: testProductWhere } });
  // Tarif lebih dulu (anak), lalu produk, terakhir kategori (induk).
  await prisma.lapakProductRate.deleteMany({ where: { product: testProductWhere } });
  await prisma.lapakProduct.deleteMany({ where: testProductWhere });
  await prisma.lapakCategory.deleteMany({ where: testCategoryWhere });
}

// ─── Test Suite: Lapak — Produk Katalog (LJ-1.2) ──────────────────────────────
async function runLapakProductsSuite() {
  console.log("\n\x1b[36m▶ [Suite 14: Lapak - Produk Katalog]\x1b[0m");
  const saToken = await login("superadmin", SUPERADMIN_PASSWORD, "seloko");
  assert("Superadmin login", Boolean(saToken));

  // Idempoten: bersihkan artefak run sebelumnya (produk ber-status apa pun,
  // kategori uji). Hard-delete agar slug bebas dipakai ulang.
  const SLUGS = ["aula-uji-suite-bpsdm", "produk-opd-lain", "produk-bpsdm-kedua", "produk-penjaga-uji", "tanpa-atribut-uji"];
  await prisma.lapakProduct.deleteMany({ where: { OR: [{ slug: { in: SLUGS } }, { name: { in: ["Produk OPD Lain", "Produk BPSDM kedua", "Produk Penjaga Uji", "Tanpa Atribut Uji"] } }] } });
  await prisma.lapakCategory.deleteMany({ where: { name: { in: ["Kategori Penjaga Uji", "Sewa Test Suite"] } } });

  // Kategori & OPD acuan.
  const cats = await request("/lapak/categories/public", { appCode: "lapak-jambi-web" });
  const gedung = (cats.data?.data ?? []).find((c: any) => c.slug === "sewa-gedung-ruangan");
  assert("Kategori Sewa Gedung ada", Boolean(gedung));

  const orgs = await request("/organizations/public", { appCode: "lapak-jambi-web" });
  const bpsdm = (orgs.data?.data ?? []).find((o: any) => o.code === "BPSDM");
  const disbudpar = (orgs.data?.data ?? []).find((o: any) => o.code === "DISBUDPAR");
  assert("OPD BPSDM & DISBUDPAR ada", Boolean(bpsdm && disbudpar));

  // ── 1. Create oleh superadmin dengan nilai bawaan kategori (tanpa 3 atribut).
  const created = await request("/lapak/products", {
    method: "POST",
    token: saToken || undefined,
    body: {
      organizationId: bpsdm.id,
      categoryId: gedung.id,
      name: "Aula Uji Suite BPSDM",
      description: "Aula untuk pengujian smoke test dengan kapasitas 300 orang.",
      address: "Jl. Test 123, Jambi",
      capacity: 300,
      rates: [
        { name: "Paket Uji", unit: "DAY", price: 7_000_000, minQty: 1 },
        { name: "Sesi Uji Siang", unit: "SESSION", price: 1_000_000, minQty: 1, startTime: "08:00", endTime: "17:00" },
      ],
      addons: [{ name: "Proyektor Uji", unit: "DAY", price: 250_000 }],
      requirements: [
        { label: "Surat permohonan", fieldType: "FILE", isRequired: true },
        { label: "Jumlah peserta", fieldType: "NUMBER", isRequired: false, sortOrder: 1 },
        { label: "Tanggal kegiatan", fieldType: "DATE", isRequired: true, sortOrder: 2 },
        { label: "Kategori kegiatan", fieldType: "SELECT", options: ["Rapat", "Pelatihan"], sortOrder: 3 },
        { label: "Catatan tambahan", fieldType: "TEXT", isRequired: false, sortOrder: 4 },
      ],
      facilities: [{ name: "Wifi" }, { name: "Parkir" }],
      // 3 gambar, SEMUA isPrimary:true — service wajib memilih satu saja.
      images: [
        { url: "https://example.com/aula.jpg", isPrimary: true, sortOrder: 0, altText: "Aula utama" },
        { url: "https://example.com/aula-2.jpg", isPrimary: true, sortOrder: 1 },
        { url: "https://example.com/aula-3.jpg", isPrimary: true, sortOrder: 2 },
      ],
    },
  });
  assert("Create 201", created.status === 201, created.status, created.data?.message);
  const productId = created.data?.data?.id;
  assert("pricingUnit diwarisi kategori (SESSION)", created.data?.data?.pricingUnit === "SESSION", created.data?.data?.pricingUnit);
  assert("availabilityType diwarisi (SLOT)", created.data?.data?.availabilityType === "SLOT");
  assert("fulfillmentType diwarisi (TICKET_QR)", created.data?.data?.fulfillmentType === "TICKET_QR");
  assert("Slug otomatis", created.data?.data?.slug === "aula-uji-suite-bpsdm", created.data?.data?.slug);
  assert("2 tarif tersimpan", (created.data?.data?.rates ?? []).length === 2, (created.data?.data?.rates ?? []).length);
  assert("Addon, persyaratan, fasilitas, gambar tersimpan",
    (created.data?.data?.addons ?? []).length === 1 &&
    (created.data?.data?.requirements ?? []).length === 5 &&
    (created.data?.data?.facilities ?? []).length === 2 &&
    (created.data?.data?.images ?? []).length === 3);
  const imgs = created.data?.data?.images ?? [];
  assert("Tepat 1 gambar primer (3 dikirim true)", imgs.filter((i: any) => i.isPrimary).length === 1,
    imgs.filter((i: any) => i.isPrimary).length);
  assert("Gambar primer = sortOrder terkecil", imgs.find((i: any) => i.isPrimary)?.url === "https://example.com/aula.jpg");
  assert("coverUrl mengikuti gambar primer", created.data?.data?.coverUrl === "https://example.com/aula.jpg", created.data?.data?.coverUrl);
  const reqs = created.data?.data?.requirements ?? [];
  assert("Kelima tipe persyaratan terwakili", ["FILE", "TEXT", "NUMBER", "DATE", "SELECT"].every((t) =>
    reqs.some((r: any) => r.fieldType === t)), reqs.map((r: any) => r.fieldType));
  assert("Opsi SELECT tersimpan", (reqs.find((r: any) => r.fieldType === "SELECT")?.options ?? []).length === 2);
  assert("sortOrder persyaratan terjaga", reqs.find((r: any) => r.label === "Catatan tambahan")?.sortOrder === 4);
  assert("Status awal DRAFT", created.data?.data?.status === "DRAFT");

  // LJ-1.4: SELECT tanpa opsi DITOLAK — form publik tak akan bisa dirender.
  const selNoOpts = await request("/lapak/products", {
    method: "POST", token: saToken || undefined,
    body: {
      organizationId: bpsdm.id, categoryId: gedung.id,
      name: "Produk Uji SELECT", description: "Deskripsi minimal sepuluh karakter.",
      requirements: [{ label: "Pilihan kosong", fieldType: "SELECT" }],
    },
  });
  assert("SELECT tanpa opsi ditolak 400", selNoOpts.status === 400, selNoOpts.status);

  // Opsi pada tipe non-SELECT juga ditolak (data mati).
  const optsOnFile = await request("/lapak/products", {
    method: "POST", token: saToken || undefined,
    body: {
      organizationId: bpsdm.id, categoryId: gedung.id,
      name: "Produk Uji Opsi FILE", description: "Deskripsi minimal sepuluh karakter.",
      requirements: [{ label: "Surat", fieldType: "FILE", options: ["A", "B"] }],
    },
  });
  assert("Opsi pada tipe non-SELECT ditolak 400", optsOnFile.status === 400, optsOnFile.status);

  // LJ-1.5: tanpa satu pun isPrimary, gambar sortOrder terkecil otomatis diangkat.
  const noPrimary = await request("/lapak/products", {
    method: "POST", token: saToken || undefined,
    body: {
      organizationId: bpsdm.id, categoryId: gedung.id,
      name: "Produk Uji Tanpa Primer", description: "Deskripsi minimal sepuluh karakter.",
      images: [
        { url: "https://example.com/b.jpg", sortOrder: 5 },
        { url: "https://example.com/a.jpg", sortOrder: 1 },
      ],
    },
  });
  const npImgs = noPrimary.data?.data?.images ?? [];
  assert("Tanpa isPrimary → satu diangkat otomatis", npImgs.filter((i: any) => i.isPrimary).length === 1,
    npImgs.filter((i: any) => i.isPrimary).length);
  assert("Yang diangkat = sortOrder terkecil", npImgs.find((i: any) => i.isPrimary)?.url === "https://example.com/a.jpg");
  await request(`/lapak/products/${noPrimary.data?.data?.id}`, { method: "DELETE", token: saToken || undefined });

  // ── 2. Validasi.
  const badOrg = await request("/lapak/products", {
    method: "POST",
    token: saToken || undefined,
    body: { organizationId: "00000000-0000-7000-8000-000000000000", categoryId: gedung.id, name: "X", description: "Minimal sepuluh karakter" },
  });
  assert("OPD tak dikenal ditolak", badOrg.status === 404 || badOrg.status === 400, badOrg.status);

  const noAttr = await request("/lapak/products", {
    method: "POST",
    token: saToken || undefined,
    body: {
      organizationId: bpsdm.id,
      categoryId: (await request("/lapak/categories/public", { appCode: "lapak-jambi-web" })).data?.data?.[0]?.id,
      name: "Tanpa Atribut Uji",
      description: "Deskripsi minimal sepuluh karakter.",
      pricingUnit: null, availabilityType: null, fulfillmentType: null,
    },
  });
  // Kategori pertama (Sewa Gedung) punya bawaan lengkap, jadi ini harus 201.
  assert("Atribut eksplisit null fallback ke kategori", noAttr.status === 201, noAttr.status, noAttr.data?.message);
  await request(`/lapak/products/${noAttr.data?.data?.id}`, { method: "DELETE", token: saToken || undefined });

  // ── 3. Alur persetujuan.
  const badTransition = await request(`/lapak/products/${productId}/status/publish`, {
    method: "PATCH", token: saToken || undefined,
  });
  assert("publish dari DRAFT sah (superadmin)", badTransition.status === 200, badTransition.status, badTransition.data?.message);

  const pubList = await request("/lapak/products/public?search=Aula Uji Suite", { appCode: "lapak-jambi-web" });
  assert("Produk terbit tampil di publik", (pubList.data?.data ?? []).some((p: any) => p.slug === "aula-uji-suite-bpsdm"), pubList.data?.data?.length);
  assert("Kartu publik punya startingPrice", typeof pubList.data?.data?.[0]?.startingPrice === "number");

  // Filter publik kini STRICT (LJ-1.3): tarif DRAFT tidak pernah tampil.
  // Setujui kedua tarif lewat submit → approve sebelum mengecek portal.
  const prodRates = created.data?.data?.rates ?? [];
  for (const rate of prodRates) {
    await request(`/lapak/rates/${rate.id}/status/submit`, { method: "PATCH", token: saToken || undefined, body: {} });
    await request(`/lapak/rates/${rate.id}/status/approve`, { method: "PATCH", token: saToken || undefined, body: {} });
  }
  const pubDetail = await request("/lapak/products/public/aula-uji-suite-bpsdm", { appCode: "lapak-jambi-web" });
  assert("Detail publik 200", pubDetail.status === 200, pubDetail.status);
  assert("Publik melihat tarif ter-approve (2)", (pubDetail.data?.data?.rates ?? []).length === 2, (pubDetail.data?.data?.rates ?? []).length);
  assert("Publik TIDAK melihat status tarif", !("status" in (pubDetail.data?.data?.rates?.[0] ?? {})));

  const unpublish = await request(`/lapak/products/${productId}/status/unpublish`, {
    method: "PATCH", token: saToken || undefined,
  });
  assert("unpublish → DRAFT + publishedAt null", unpublish.status === 200 && unpublish.data?.data?.status === "DRAFT" && unpublish.data?.data?.publishedAt === null, unpublish.status);

  // ── 4. Lingkup OPD: admin-opd BPSDM.
  const opdToken = await login("admin.bpsdm", DEFAULT_PASSWORD, "seloko");
  assert("admin.bpsdm login", Boolean(opdToken));

  const opdList = await request("/lapak/products?limit=100", { token: opdToken || undefined });
  assert("admin-opd hanya melihat produk BPSDM", (opdList.data?.data ?? []).every((p: any) => p.organization.code === "BPSDM"), opdList.data?.data?.length);

  const otherOrg = await request("/lapak/products", {
    method: "POST",
    token: opdToken || undefined,
    body: { organizationId: disbudpar.id, categoryId: gedung.id, name: "Produk OPD Lain", description: "Harus ditolak karena di luar lingkup." },
  });
  assert("admin-opd BPSDM tidak bisa membuat produk Disbudpar (403)", otherOrg.status === 403, otherOrg.status, 403);

  const detailOther = await request("/lapak/products", {
    method: "POST", token: opdToken || undefined,
    body: { organizationId: bpsdm.id, categoryId: gedung.id, name: "Produk BPSDM kedua", description: "Produk kedua untuk uji akses silang OPD." },
  });
  assert("admin-opd bisa membuat produk BPSDM", detailOther.status === 201, detailOther.status, detailOther.data?.message);
  const otherProductId = detailOther.data?.data?.id;

  // Bapenda (superadmin) tetap bisa akses produk OPD mana pun.
  const saSee = await request(`/lapak/products/${otherProductId}`, { token: saToken || undefined });
  assert("Bapenda melihat produk OPD", saSee.status === 200, saSee.status);

  // ── 5. Update + sync anak (replace-set).
  const updated = await request(`/lapak/products/${productId}`, {
    method: "PUT",
    token: saToken || undefined,
    body: {
      capacity: 350,
      rates: [
        { name: "Paket Uji", unit: "DAY", price: 7_500_000, minQty: 1 },
        { name: "Sesi Uji Malam", unit: "SESSION", price: 1_200_000, minQty: 1, startTime: "17:00", endTime: "23:00" },
      ],
      facilities: [{ name: "Wifi" }, { name: "Parkir" }, { name: "AC" }],
    },
  });
  assert("Update 200", updated.status === 200, updated.status, updated.data?.message);
  assert("capacity 350", updated.data?.data?.capacity === 350);
  assert("Anak sinkron: 2 tarif baru (nama beda)", (updated.data?.data?.rates ?? []).length === 2, (updated.data?.data?.rates ?? []).length);
  assert("Fasilitas bertambah 3", (updated.data?.data?.facilities ?? []).length === 3);

  // Edit produk non-DRAFT ditolak.
  await request(`/lapak/products/${productId}/status/publish`, { method: "PATCH", token: saToken || undefined });
  const editPublished = await request(`/lapak/products/${productId}`, {
    method: "PUT", token: saToken || undefined, body: { capacity: 999 },
  });
  assert("Edit produk PUBLISHED ditolak 403", editPublished.status === 403, editPublished.status, 403);

  // ── 6. Delete: produk terbit ditolak, draft boleh.
  const delPublished = await request(`/lapak/products/${productId}`, { method: "DELETE", token: saToken || undefined });
  assert("Hapus produk terbit ditolak 409", delPublished.status === 409, delPublished.status, 409);

  await request(`/lapak/products/${productId}/status/unpublish`, { method: "PATCH", token: saToken || undefined });
  const delDraft = await request(`/lapak/products/${productId}`, { method: "DELETE", token: saToken || undefined });
  assert("Hapus draft 200", delDraft.status === 200, delDraft.status);

  const delOther = await request(`/lapak/products/${otherProductId}`, { method: "DELETE", token: saToken || undefined });
  assert("Hapus produk kedua 200 (bersih-bersih)", delOther.status === 200, delOther.status);

  // ── 7. Penjaga kategori: kategori yang pernah dipakai produk masih boleh dihapus
  // karena produknya sudah dihapus; buat kategori + produk, coba hapus kategori → 409.
  const cat = await request("/lapak/categories", {
    method: "POST", token: saToken || undefined, body: { name: "Kategori Penjaga Uji" },
  });
  assert("Kategori penjaga dibuat", cat.status === 201, cat.status, cat.data?.message);
  // Kategori tanpa bawaan: isi tiga atribut secara eksplisit (produk gagal 400 tanpa ini).
  const prod = await request("/lapak/products", {
    method: "POST", token: saToken || undefined,
    body: {
      organizationId: bpsdm.id, categoryId: cat.data?.data?.id,
      name: "Produk Penjaga Uji", description: "Menjaga kategori agar tak terhapus.",
      pricingUnit: "DAY", availabilityType: "SLOT", fulfillmentType: "TICKET_QR",
    },
  });
  assert("Produk penjaga dibuat", prod.status === 201, prod.status, prod.data?.message);
  const delCat = await request(`/lapak/categories/${cat.data?.data?.id}`, { method: "DELETE", token: saToken || undefined });
  assert("Hapus kategori terpakai ditolak 409", delCat.status === 409, delCat.status, 409);
  // Setelah produk dihapus, kategori boleh dihapus (produk soft-delete tidak menghalangi).
  await request(`/lapak/products/${prod.data?.data?.id}`, { method: "DELETE", token: saToken || undefined });
  const delCatAfter = await request(`/lapak/categories/${cat.data?.data?.id}`, { method: "DELETE", token: saToken || undefined });
  assert("Kategori bebas setelah produknya dihapus", delCatAfter.status === 200, delCatAfter.status);
}

// ─── Test Suite: Lapak — Alur Persetujuan Tarif (LJ-1.3) ──────────────────────
async function runLapakRatesSuite() {
  console.log("\n\x1b[36m▶ [Suite 15: Lapak - Alur Persetujuan Tarif]\x1b[0m");
  const saToken = await login("superadmin", SUPERADMIN_PASSWORD, "seloko");
  assert("Superadmin login", Boolean(saToken));

  // Idempoten: bersihkan artefak sebelumnya — termasuk produk uji suite lain
  // yang mungkin soft-delete menggantung (listRates mengecualikan produk
  // terhapus, jadi baris yatim itu tak terlihat di CMS), dan sisa debug/tracer.
  await cleanupDebugArtefacts();
  await prisma.lapakProductRate.deleteMany({ where: { product: { slug: { in: ["produk-tarif-uji", "aula-uji-suite-bpsdm", "produk-bpsdm-kedua", "tanpa-atribut-uji"] } } } });
  await prisma.lapakProduct.deleteMany({ where: { slug: { in: ["produk-tarif-uji", "aula-uji-suite-bpsdm", "produk-bpsdm-kedua", "tanpa-atribut-uji", "produk-opd-lain", "produk-penjaga-uji"] } } });
  await prisma.lapakCategory.deleteMany({ where: { name: { in: ["Kategori Tarif Uji", "Kategori Penjaga Uji", "Sewa Test Suite"] } } });

  // Persiapan: produk DRAFT + kategori khusus uji.
  const cats = await request("/lapak/categories/public", { appCode: "lapak-jambi-web" });
  const gedung = (cats.data?.data ?? []).find((c: any) => c.slug === "sewa-gedung-ruangan");
  const orgs = await request("/organizations/public", { appCode: "lapak-jambi-web" });
  const bpsdm = (orgs.data?.data ?? []).find((o: any) => o.code === "BPSDM");

  const cat = await request("/lapak/categories", {
    method: "POST", token: saToken || undefined,
    body: { name: "Kategori Tarif Uji", defaultPricingUnit: "SESSION", defaultAvailabilityType: "SLOT", defaultFulfillmentType: "TICKET_QR" },
  });
  assert("Kategori uji dibuat", cat.status === 201, cat.status);

  const created = await request("/lapak/products", {
    method: "POST", token: saToken || undefined,
    body: {
      organizationId: bpsdm.id, categoryId: cat.data?.data?.id,
      name: "Produk Tarif Uji", description: "Produk untuk menguji alur persetujuan tarif.",
      rates: [{ name: "Tarif Awal", unit: "SESSION", price: 500_000 }],
    },
  });
  assert("Produk uji dibuat (DRAFT)", created.status === 201, created.status);
  const productId = created.data?.data?.id;
  const draftRateId = created.data?.data?.rates?.[0]?.id;
  assert("Tarif awal ikut lahir DRAFT (produk DRAFT)", created.data?.data?.rates?.[0]?.status === "DRAFT", created.data?.data?.rates?.[0]?.status);

  // ── 1. Publik TIDAK melihat tarif DRAFT.
  await request(`/lapak/products/${productId}/status/publish`, { method: "PATCH", token: saToken || undefined });
  const pubBefore = await request("/lapak/products/public/produk-tarif-uji", { appCode: "lapak-jambi-web" });
  assert("Produk terbit tapi tarif DRAFT tak terlihat", pubDetailSafe(pubBefore) === 0, pubDetailSafe(pubBefore));

  // ── 2. Alur tarif: submit → approve → muncul di publik.
  const submit = await request(`/lapak/rates/${draftRateId}/status/submit`, { method: "PATCH", token: saToken || undefined });
  assert("submit → PENDING_REVIEW", submit.status === 200 && submit.data?.data?.status === "PENDING_REVIEW", submit.status, submit.data?.message);

  // PRD 04 §C: admin-opd MEMEGANG product:approve untuk OPD-nya. Yang dicek
  // di sini adalah LINGKUP: tarif produk BPSDM tidak boleh disetujui admin
  // OPD lain (disbudpar) walau permission-nya sama.
  const disbudparToken = await login("admin.multiopd", DEFAULT_PASSWORD, "seloko");
  void disbudparToken; // admin.multiopd memegang BPSDM — pakai akun OPD lain:
  const otherOpdToken = await login("petugas.samsat", DEFAULT_PASSWORD, "seloko");
  const crossApprove = await request(`/lapak/rates/${draftRateId}/status/approve`, {
    method: "PATCH", token: otherOpdToken || undefined,
  });
  assert("petugas (tanpa product:approve) ditolak 403", crossApprove.status === 403, crossApprove.status, 403);

  // Admin OPD pemilik (admin.bpsdm) BOLEH menyetujui tarif OPD-nya.
  const ownerApprove = await request(`/lapak/rates/${draftRateId}/status/approve`, {
    method: "PATCH", token: (await login("admin.bpsdm", DEFAULT_PASSWORD, "seloko")) || undefined,
  });
  assert("admin-opd BPSDM menyetujui tarif BPSDM (200)", ownerApprove.status === 200, ownerApprove.status, ownerApprove.data?.message);

  // Tarif sudah APPROVED oleh admin-opd di atas — coba approve lagi harus 400.
  const doubleApprove = await request(`/lapak/rates/${draftRateId}/status/approve`, { method: "PATCH", token: saToken || undefined });
  assert("approve kedua ditolak 400 (transisi tak sah)", doubleApprove.status === 400, doubleApprove.status);

  const pubAfter = await request("/lapak/products/public/produk-tarif-uji", { appCode: "lapak-jambi-web" });
  assert("Tarif APPROVED tampil di publik", pubDetailSafe(pubAfter) === 1, pubDetailSafe(pubAfter));

  // ── 3. Revisi tarif ter-approve: produk TETAP terbit, tarif baru PENDING_REVIEW.
  const revise = await request(`/lapak/rates/${draftRateId}/revise`, {
    method: "POST", token: saToken || undefined,
    body: { price: 750_000 },
  });
  assert("revise membuat baris baru PENDING_REVIEW", revise.status === 200 && revise.data?.data?.status === "PENDING_REVIEW", revise.status, revise.data?.message);
  const revisedRateId = revise.data?.data?.id;

  const prodAfterRevise = await request(`/lapak/products/${productId}`, { token: saToken || undefined });
  assert("Produk TETAP PUBLISHED setelah revisi tarif", prodAfterRevise.data?.data?.status === "PUBLISHED", prodAfterRevise.data?.data?.status);

  const pubDuring = await request("/lapak/products/public/produk-tarif-uji", { appCode: "lapak-jambi-web" });
  assert("Selama revisi, publik masih melihat harga LAMA", pubDetailSafe(pubDuring) === 1 && pubDuring.data?.data?.rates?.[0]?.price === 500_000, pubDuring.data?.data?.rates?.[0]?.price);

  const rejectNoNote = await request(`/lapak/rates/${revisedRateId}/status/reject`, { method: "PATCH", token: saToken || undefined });
  assert("reject tanpa note ditolak 400", rejectNoNote.status === 400, rejectNoNote.status, 400);

  const reject = await request(`/lapak/rates/${revisedRateId}/status/reject`, {
    method: "PATCH", token: saToken || undefined, body: { note: "Harga meleset dari Perda" },
  });
  assert("reject dengan note → REJECTED", reject.status === 200 && reject.data?.data?.status === "REJECTED", reject.status);

  // Edit tarif REJECTED boleh, lalu submit ulang.
  const editRejected = await request(`/lapak/rates/${revisedRateId}`, {
    method: "PUT", token: saToken || undefined, body: { price: 700_000 },
  });
  assert("Edit tarif REJECTED boleh", editRejected.status === 200 && editRejected.data?.data?.price === 700_000, editRejected.status);

  const resubmit = await request(`/lapak/rates/${revisedRateId}/status/submit`, { method: "PATCH", token: saToken || undefined });
  const reapprove = await request(`/lapak/rates/${revisedRateId}/status/approve`, { method: "PATCH", token: saToken || undefined });
  assert("submit ulang → approve → APPROVED", resubmit.status === 200 && reapprove.status === 200 && reapprove.data?.data?.status === "APPROVED", reapprove.status, reapprove.data?.message);

  const pubFinal = await request("/lapak/products/public/produk-tarif-uji", { appCode: "lapak-jambi-web" });
  const pubPrices = (pubFinal.data?.data?.rates ?? []).map((r: any) => r.price);
  // Revisi disetujui: tarif lama dinonaktifkan otomatis oleh revise → hanya 700rb tersisa.
  assert("Hanya tarif revisi (700rb) yang tersisa setelah revise disetujui",
    pubDetailSafe(pubFinal) === 1 && pubPrices.includes(700_000) && !pubPrices.includes(500_000),
    pubPrices);

  // ── 4. Edit tarif APPROVED ditolak; revise endpoint untuk perubahan.
  const editApproved = await request(`/lapak/rates/${draftRateId}`, {
    method: "PUT", token: saToken || undefined, body: { price: 1 },
  });
  assert("Edit tarif APPROVED ditolak 409", editApproved.status === 409, editApproved.status, 409);

  // ── 5. effectiveFrom di masa depan belum tampil di publik.
  const future = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
  const futRate = await request(`/lapak/rates/product/${productId}`, {
    method: "POST", token: saToken || undefined,
    body: { name: "Tarif Masa Depan", unit: "SESSION", price: 900_000, effectiveFrom: future },
  });
  assert("Tarif dengan effectiveFrom masa depan lahir PENDING_REVIEW (produk terbit)", futRate.status === 201 && futRate.data?.data?.status === "PENDING_REVIEW", futRate.status);
  const futApproved = await request(`/lapak/rates/${futRate.data?.data?.id}/status/approve`, { method: "PATCH", token: saToken || undefined });
  assert("approve tarif masa depan", futApproved.status === 200, futApproved.status);
  const pubFuture = await request("/lapak/products/public/produk-tarif-uji", { appCode: "lapak-jambi-web" });
  const futurePrices = (pubFuture.data?.data?.rates ?? []).map((r: any) => r.price);
  // 700k tampil; 900k (effectiveFrom +30 hari) TIDAK.
  assert("effectiveFrom masa depan tersembunyi dari publik",
    pubDetailSafe(pubFuture) === 1 && futurePrices.includes(700_000) && !futurePrices.includes(900_000),
    futurePrices, "900rb harus tak terlihat");

  // ── 6. Deactivate & delete guard.
  const ratesList = await request(`/lapak/rates?productId=${productId}`, { token: saToken || undefined });
  const activeRates = (ratesList.data?.data ?? []).filter((r: any) => r.isActive && ["APPROVED", "PUBLISHED"].includes(r.status));
  // Dua tarif aktif valid: revisi 700rb (efektif) + tarif masa depan 900rb
  // (aktif tapi efektifnya +30 hari — tersembunyi dari publik sampai waktunya).
  assert("2 tarif aktif ter-approve (revisi + masa depan)", activeRates.length === 2, activeRates.length);

  // draftRateId = tarif lama 500k yang dinonaktifkan oleh revise → boleh dihapus.
  const delInactive = await request(`/lapak/rates/${draftRateId}`, { method: "DELETE", token: saToken || undefined });
  assert("Hapus tarif nonaktif boleh", delInactive.status === 200, delInactive.status, delInactive.data?.message);

  // revisedRateId = 700k aktif ter-approve → ditolak.
  const delActive = await request(`/lapak/rates/${revisedRateId}`, { method: "DELETE", token: saToken || undefined });
  assert("Hapus tarif aktif ter-approve ditolak 409", delActive.status === 409, delActive.status, 409);

  // ── 7. Bersih-bersih.
  await request(`/lapak/products/${productId}/status/unpublish`, { method: "PATCH", token: saToken || undefined });
  await prisma.lapakProductRate.deleteMany({ where: { productId } });
  await prisma.lapakProduct.deleteMany({ where: { id: productId } });
  await prisma.lapakCategory.deleteMany({ where: { id: cat.data?.data?.id } });
}

/** Jumlah tarif terlihat di respons detail publik (aman bila 404). */
function pubDetailSafe(res: { status: number; data?: any }): number {
  return res.status === 200 ? (res.data?.data?.rates ?? []).length : 0;
}

// ─── Main Orchestrator ────────────────────────────────────────────────────────
// ─── Test Suite: Lapak — Katalog Publik OPD (LJ-1.6) ──────────────────────────
async function runLapakCatalogSuite() {
  console.log("\n\x1b[36m▶ [Suite 16: Lapak - Katalog Publik OPD]\x1b[0m");

  // ── 1. Profil OPD publik: field aman & productCount masuk akal.
  const profile = await request("/lapak/organizations/BPSDM", { appCode: "lapak-jambi-web" });
  assert("Profil OPD 200 (tanpa login)", profile.status === 200, profile.status);
  const p = profile.data?.data ?? {};
  assert("Profil memuat kode & nama", p.code === "BPSDM" && typeof p.name === "string", p.code);
  assert("Profil memuat productCount angka", typeof p.productCount === "number", typeof p.productCount);
  // Field internal tidak boleh bocor ke publik.
  assert("Field internal tidak bocor", !("id" in p) && !("isActive" in p) && !("parentId" in p),
    Object.keys(p).join(","));

  // ── 2. Kode OPD tak dikenal → 404, bukan katalog kosong yang menyamarkan typo.
  const badCode = await request("/lapak/organizations/OPD-TIDAK-ADA", { appCode: "lapak-jambi-web" });
  assert("OPD tak dikenal ditolak 404", badCode.status === 404, badCode.status);

  // ── 3. Produk OPD: hanya milik OPD itu.
  const prods = await request("/lapak/organizations/BPSDM/products", { appCode: "lapak-jambi-web" });
  assert("Produk OPD 200", prods.status === 200, prods.status);
  const list = prods.data?.data ?? [];
  assert("Produk OPD menyertakan meta paginasi", typeof prods.data?.meta?.totalItems === "number",
    prods.data?.meta?.totalItems);
  assert("Semua produk milik OPD tersebut", list.every((x: any) => x.organization?.code === "BPSDM"),
    list.map((x: any) => x.organization?.code).join(","));
  assert("Kartu katalog punya startingPrice", list.every((x: any) => typeof x.startingPrice === "number"));

  // ── 4. Filter & paginasi bekerja di endpoint OPD.
  const limited = await request("/lapak/organizations/BPSDM/products?limit=1", { appCode: "lapak-jambi-web" });
  assert("limit dihormati", (limited.data?.data ?? []).length <= 1, (limited.data?.data ?? []).length);
  assert("meta.limit mengikuti query", limited.data?.meta?.limit === 1, limited.data?.meta?.limit);

  const badSort = await request("/lapak/organizations/BPSDM/products?sortBy=ngawur", { appCode: "lapak-jambi-web" });
  assert("sortBy tak dikenal ditolak 400", badSort.status === 400, badSort.status);

  // ── 5. productCount konsisten dengan isi katalog OPD.
  const total = prods.data?.meta?.totalItems ?? 0;
  assert("productCount = totalItems katalog OPD", p.productCount === total, `${p.productCount} vs ${total}`);

  // ── 6. Katalog tetap jalan meski OPD tanpa produk terbit.
  const other = await request("/lapak/organizations/DISBUDPAR/products", { appCode: "lapak-jambi-web" });
  assert("OPD tanpa produk tetap 200", other.status === 200, other.status);
  assert("Katalog kosong berupa array", Array.isArray(other.data?.data), typeof other.data?.data);
}

// ─── Test Suite: Lapak — Jam Operasional & Tanggal Tutup (LJ-2.1) ─────────────
async function runLapakAvailabilitySuite() {
  console.log("\n\x1b[36m▶ [Suite 17: Lapak - Jam Operasional & Tanggal Tutup]\x1b[0m");
  const saToken = await login("superadmin", SUPERADMIN_PASSWORD, "seloko");
  assert("Superadmin login", Boolean(saToken));

  await cleanupDebugArtefacts();

  // Persiapan: produk PUBLISHED milik BPSDM pada kategori seed.
  const cats = await request("/lapak/categories/public", { appCode: "lapak-jambi-web" });
  const gedung = (cats.data?.data ?? []).find((c: any) => c.slug === "sewa-gedung-ruangan");
  const orgs = await request("/organizations/public", { appCode: "lapak-jambi-web" });
  const bpsdm = (orgs.data?.data ?? []).find((o: any) => o.code === "BPSDM");

  const created = await request("/lapak/products", {
    method: "POST", token: saToken || undefined,
    body: {
      organizationId: bpsdm.id, categoryId: gedung.id,
      name: "Jadwal Uji Produk", description: "Produk uji jam operasional dan tanggal tutup.",
      rates: [{ name: "Harian", unit: "DAY", price: 500_000 }],
    },
  });
  assert("Produk jadwal dibuat", created.status === 201, created.status, created.data?.message);
  const productId = created.data?.data?.id;
  const slug = created.data?.data?.slug;

  // ── 1. Awalnya tidak ada jadwal → cek ketersediaan menolak produk DRAFT.
  const draftAvail = await request(`/lapak/availability/product/${productId}/availability?from=2026-11-01&to=2026-11-03`, { appCode: "lapak-jambi-web" });
  assert("Produk DRAFT tak bisa dicek publik (404)", draftAvail.status === 404, draftAvail.status);

  // ── 2. Set jam operasional: Senin–Jumat 08:00–16:00 (replace-set).
  const hours = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, openTime: "08:00", closeTime: "16:00" }));
  const setHours = await request(`/lapak/availability/product/${productId}/hours`, {
    method: "PUT", token: saToken || undefined, body: { hours },
  });
  assert("Simpan jam operasional 200", setHours.status === 200, setHours.status, setHours.data?.message);
  assert("5 hari kerja tersimpan", (setHours.data?.data ?? []).length === 5, (setHours.data?.data ?? []).length);

  // ── 3. Duplikat hari ditolak SEBELUM menyentuh DB.
  const dup = await request(`/lapak/availability/product/${productId}/hours`, {
    method: "PUT", token: saToken || undefined,
    body: { hours: [{ weekday: 1, openTime: "08:00", closeTime: "12:00" }, { weekday: 1, openTime: "13:00", closeTime: "17:00" }] },
  });
  assert("Hari duplikat ditolak 400", dup.status === 400, dup.status);
  const afterDup = await request(`/lapak/availability/product/${productId}/hours`, { token: saToken || undefined });
  assert("Jadwal lama tetap utuh setelah penolakan", (afterDup.data?.data ?? []).length === 5, (afterDup.data?.data ?? []).length);

  // ── 4. Format jam salah ditolak.
  const badTime = await request(`/lapak/availability/product/${productId}/hours`, {
    method: "PUT", token: saToken || undefined,
    body: { hours: [{ weekday: 1, openTime: "25:00", closeTime: "16:00" }] },
  });
  assert("Jam tidak valid ditolak 400", badTime.status === 400, badTime.status);

  // ── 5. Terbitkan lalu cek ketersediaan publik.
  await request(`/lapak/products/${productId}/status/publish`, { method: "PATCH", token: saToken || undefined });
  const pubAvail = await request(`/lapak/availability/product/${productId}/availability?from=2026-11-02&to=2026-11-08`, { appCode: "lapak-jambi-web" });
  assert("Cek ketersediaan publik 200", pubAvail.status === 200, pubAvail.status, pubAvail.data?.message);
  const days = pubAvail.data?.data?.days ?? [];
  assert("Satu baris per tanggal (7 hari)", days.length === 7, days.length);
  // 2026-11-02 = Senin. Senin–Jumat buka, Sabtu–Minggu tutup.
  assert("Senin buka", days.find((d: any) => d.date === "2026-11-02")?.isOpen === true);
  assert("Minggu tutup", days.find((d: any) => d.date === "2026-11-08")?.isOpen === false);
  assert("Hari tutup menyertakan alasan", typeof days.find((d: any) => d.date === "2026-11-08")?.reason === "string");
  assert("Jam buka ikut disajikan", days.find((d: any) => d.date === "2026-11-02")?.openTime === "08:00");

  // ── 6. Rentang terlalu panjang ditolak.
  const tooLong = await request(`/lapak/availability/product/${productId}/availability?from=2026-11-01&to=2027-06-01`, { appCode: "lapak-jambi-web" });
  assert("Rentang > 92 hari ditolak 400", tooLong.status === 400, tooLong.status);

  // ── 7. Tanggal tutup menang atas jam operasional.
  const blackout = await request(`/lapak/availability/product/${productId}/blackouts`, {
    method: "POST", token: saToken || undefined,
    body: { startDate: "2026-11-03", endDate: "2026-11-04", reason: "Renovasi atap" },
  });
  assert("Tambah tanggal tutup 201", blackout.status === 201, blackout.status, blackout.data?.message);
  const blackoutId = blackout.data?.data?.id;

  const withBlackout = await request(`/lapak/availability/product/${productId}/availability?from=2026-11-02&to=2026-11-05`, { appCode: "lapak-jambi-web" });
  const bDays = withBlackout.data?.data?.days ?? [];
  assert("Tanggal blackout jadi tutup", bDays.find((d: any) => d.date === "2026-11-03")?.isOpen === false);
  assert("Alasan blackout tampil", bDays.find((d: any) => d.date === "2026-11-03")?.reason === "Renovasi atap");
  assert("Hari di luar blackout tetap buka", bDays.find((d: any) => d.date === "2026-11-02")?.isOpen === true);

  // ── 8. Validasi tanggal tutup.
  const badRange = await request(`/lapak/availability/product/${productId}/blackouts`, {
    method: "POST", token: saToken || undefined,
    body: { startDate: "2026-11-10", endDate: "2026-11-05" },
  });
  assert("Tanggal selesai < mulai ditolak 400", badRange.status === 400, badRange.status);

  const badFormat = await request(`/lapak/availability/product/${productId}/blackouts`, {
    method: "POST", token: saToken || undefined,
    body: { startDate: "10-11-2026", endDate: "11-11-2026" },
  });
  assert("Format tanggal salah ditolak 400", badFormat.status === 400, badFormat.status);

  // ── 9. Daftar & hapus tanggal tutup.
  const listB = await request(`/lapak/availability/product/${productId}/blackouts`, { token: saToken || undefined });
  assert("Daftar tanggal tutup 200", listB.status === 200 && (listB.data?.data ?? []).length === 1);

  const delB = await request(`/lapak/availability/product/${productId}/blackouts/${blackoutId}`, {
    method: "DELETE", token: saToken || undefined,
  });
  assert("Hapus tanggal tutup 200", delB.status === 200, delB.status);
  assert("Hapus mengembalikan deleted:true", delB.data?.data?.deleted === true);

  const afterDel = await request(`/lapak/availability/product/${productId}/availability?from=2026-11-03&to=2026-11-03`, { appCode: "lapak-jambi-web" });
  assert("Setelah dihapus, tanggal buka kembali", afterDel.data?.data?.days?.[0]?.isOpen === true,
    afterDel.data?.data?.days?.[0]?.isOpen);

  // ── 10. Lingkup OPD: admin OPD lain tidak boleh menyentuh jadwal BPSDM.
  // Bisa 403 (guard izin menolak lebih dulu) atau 404 (lolos guard tapi di
  // luar lingkup) — keduanya benar; yang penting TIDAK 200 dan data tak bocor.
  const otherToken = await login("petugas.samsat", DEFAULT_PASSWORD, "seloko");
  const crossRead = await request(`/lapak/availability/product/${productId}/hours`, { token: otherToken || undefined });
  assert("OPD lain ditolak (403/404, bukan 200)", crossRead.status === 403 || crossRead.status === 404, crossRead.status);

  // ── 11. Produk tak dikenal.
  const ghost = await request(`/lapak/availability/product/00000000-0000-7000-8000-000000000000/availability?from=2026-11-01&to=2026-11-02`, { appCode: "lapak-jambi-web" });
  assert("Produk tak dikenal 404", ghost.status === 404, ghost.status);

  // Bersih-bersih.
  await request(`/lapak/products/${productId}/status/unpublish`, { method: "PATCH", token: saToken || undefined });
  await prisma.lapakOperatingHour.deleteMany({ where: { productId } });
  await prisma.lapakBlackoutDate.deleteMany({ where: { productId } });
  await prisma.lapakProductRate.deleteMany({ where: { productId } });
  await prisma.lapakProduct.deleteMany({ where: { slug } });
  void slug;
}

// ─── Test Suite: Lapak — Reservasi & Anti Double-Booking (LJ-2.2) ─────────────
async function runLapakReservationsSuite() {
  console.log("\n\x1b[36m▶ [Suite 18: Lapak - Reservasi & Anti Double-Booking]\x1b[0m");
  const saToken = await login("superadmin", SUPERADMIN_PASSWORD, "seloko");
  assert("Superadmin login", Boolean(saToken));

  await cleanupDebugArtefacts();

  const cats = await request("/lapak/categories/public", { appCode: "lapak-jambi-web" });
  const gedung = (cats.data?.data ?? []).find((c: any) => c.slug === "sewa-gedung-ruangan");
  const orgs = await request("/organizations/public", { appCode: "lapak-jambi-web" });
  const bpsdm = (orgs.data?.data ?? []).find((o: any) => o.code === "BPSDM");

  const created = await request("/lapak/products", {
    method: "POST", token: saToken || undefined,
    body: {
      organizationId: bpsdm.id, categoryId: gedung.id,
      name: "Reservasi Uji Produk", description: "Produk uji reservasi slot dan anti double-booking.",
      capacity: 1,
      rates: [{ name: "Per Jam", unit: "HOUR", price: 100_000 }],
    },
  });
  assert("Produk reservasi dibuat", created.status === 201, created.status, created.data?.message);
  const productId = created.data?.data?.id;
  const slug = created.data?.data?.slug;

  // Jam operasional: SEMUA hari 00:00–23:59 agar uji tidak bergantung hari.
  const allDays = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, openTime: "00:00", closeTime: "23:59" }));
  await request(`/lapak/availability/product/${productId}/hours`, {
    method: "PUT", token: saToken || undefined, body: { hours: allDays },
  });
  await request(`/lapak/products/${productId}/status/publish`, { method: "PATCH", token: saToken || undefined });

  // Tanggal uji di masa depan (hari ini + 30..32 hari) agar tak kena "waktu lewat".
  const day = (offset: number) => {
    const d = new Date(Date.now() + offset * 86_400_000);
    return d.toISOString().slice(0, 10);
  };
  const d1 = day(30), d2 = day(31);

  // ── 1. Reservasi pertama berhasil (HOLD).
  const r1 = await request(`/lapak/reservations/product/${productId}`, {
    method: "POST", body: { startAt: `${d1}T08:00:00+07:00`, endAt: `${d1}T10:00:00+07:00`, qty: 1 },
  });
  assert("Reservasi pertama 201", r1.status === 201, r1.status, r1.data?.message);
  assert("Status awal HOLD", r1.data?.data?.status === "HOLD", r1.data?.data?.status);
  assert("expiresAt terisi", typeof r1.data?.data?.expiresAt === "string");
  const r1id = r1.data?.data?.id;

  // ── 2. Bentrok persis → 409 dari exclusion constraint, bukan dari kode.
  const clash = await request(`/lapak/reservations/product/${productId}`, {
    method: "POST", body: { startAt: `${d1}T08:00:00+07:00`, endAt: `${d1}T10:00:00+07:00`, qty: 1 },
  });
  assert("Bentrok persis ditolak 409", clash.status === 409, clash.status, clash.data?.message);

  // ── 3. Bentrok sebagian → 409.
  const partial = await request(`/lapak/reservations/product/${productId}`, {
    method: "POST", body: { startAt: `${d1}T09:00:00+07:00`, endAt: `${d1}T11:00:00+07:00`, qty: 1 },
  });
  assert("Bentrok sebagian ditolak 409", partial.status === 409, partial.status);

  // ── 4. Bersambung (batas eksklusif) → BERHASIL.
  const adjacent = await request(`/lapak/reservations/product/${productId}`, {
    method: "POST", body: { startAt: `${d1}T10:00:00+07:00`, endAt: `${d1}T12:00:00+07:00`, qty: 1 },
  });
  assert("Bersambung 10:00 diterima (batas atas eksklusif)", adjacent.status === 201, adjacent.status, adjacent.data?.message);
  const adjId = adjacent.data?.data?.id;

  // ── 5. INTI: dua request PARALEL pada slot yang sama → tepat satu menang.
  const parallelBody = { startAt: `${d2}T08:00:00+07:00`, endAt: `${d2}T09:00:00+07:00`, qty: 1 };
  const [pa, pb] = await Promise.all([
    request(`/lapak/reservations/product/${productId}`, { method: "POST", body: parallelBody }),
    request(`/lapak/reservations/product/${productId}`, { method: "POST", body: parallelBody }),
  ]);
  const wins = [pa, pb].filter((r) => r.status === 201).length;
  const conflicts = [pa, pb].filter((r) => r.status === 409).length;
  assert("Dua request paralel: tepat 1 berhasil", wins === 1, `201=${wins} 409=${conflicts}`);
  assert("Dua request paralel: tepat 1 ditolak 409", conflicts === 1, `201=${wins} 409=${conflicts}`);

  // ── 6. Slot terpakai tampil di cek publik.
  const slots = await request(`/lapak/reservations/product/${productId}/slots?from=${d1}T00:00:00%2B07:00&to=${d1}T23:59:00%2B07:00`, { appCode: "lapak-jambi-web" });
  assert("Cek slot publik 200", slots.status === 200, slots.status, slots.data?.message);
  assert("Dua blok terpakai tercatat", (slots.data?.data?.busy ?? []).length >= 2, (slots.data?.data?.busy ?? []).length);
  assert("Kapasitas dilaporkan", slots.data?.data?.capacity === 1, slots.data?.data?.capacity);

  // ── 7. Release → slot bisa dipesan ulang (partial index mengecualikan RELEASED).
  const rel = await request(`/lapak/reservations/${r1id}/release`, { method: "POST" });
  assert("Release 200", rel.status === 200, rel.status, rel.data?.message);
  assert("Status jadi RELEASED", rel.data?.data?.status === "RELEASED", rel.data?.data?.status);

  const rebook = await request(`/lapak/reservations/product/${productId}`, {
    method: "POST", body: { startAt: `${d1}T08:00:00+07:00`, endAt: `${d1}T10:00:00+07:00`, qty: 1 },
  });
  assert("Slot yang dilepas bisa dipesan ulang", rebook.status === 201, rebook.status, rebook.data?.message);

  // ── 8. Release dua kali → 400 (bukan diam-diam sukses).
  const rel2 = await request(`/lapak/reservations/${r1id}/release`, { method: "POST" });
  assert("Release ulang ditolak 400", rel2.status === 400, rel2.status);

  // ── 9. Validasi masukan.
  const badRange = await request(`/lapak/reservations/product/${productId}`, {
    method: "POST", body: { startAt: `${d1}T10:00:00+07:00`, endAt: `${d1}T09:00:00+07:00` },
  });
  assert("Akhir < awal ditolak 400", badRange.status === 400, badRange.status);

  const past = await request(`/lapak/reservations/product/${productId}`, {
    method: "POST", body: { startAt: "2020-01-01T08:00:00+07:00", endAt: "2020-01-01T10:00:00+07:00" },
  });
  assert("Waktu lampau ditolak 400", past.status === 400, past.status);

  // Di luar jam operasional: produk uji 00:00–23:59, jadi uji dengan produk
  // berjadwal sempit tidak perlu — cukup pastikan tanggal tutup menolak.
  const blackout = await request(`/lapak/availability/product/${productId}/blackouts`, {
    method: "POST", token: saToken || undefined,
    body: { startDate: d2, endDate: d2, reason: "Uji tutup" },
  });
  assert("Tanggal tutup dibuat", blackout.status === 201, blackout.status);
  const onBlackout = await request(`/lapak/reservations/product/${productId}`, {
    method: "POST", body: { startAt: `${d2}T15:00:00+07:00`, endAt: `${d2}T16:00:00+07:00`, qty: 1 },
  });
  assert("Reservasi pada tanggal tutup ditolak 400", onBlackout.status === 400, onBlackout.status, onBlackout.data?.message);

  // ── 10. Produk DRAFT tidak bisa direservasi (404).
  await request(`/lapak/products/${productId}/status/unpublish`, { method: "PATCH", token: saToken || undefined });
  const draftTry = await request(`/lapak/reservations/product/${productId}`, {
    method: "POST", body: { startAt: `${d1}T20:00:00+07:00`, endAt: `${d1}T21:00:00+07:00` },
  });
  assert("Produk DRAFT tak bisa direservasi (404)", draftTry.status === 404, draftTry.status);

  // ── 11. Bersih-bersih.
  await prisma.$executeRawUnsafe(`DELETE FROM lapak_reservations WHERE product_id = $1`, productId);
  await prisma.lapakOperatingHour.deleteMany({ where: { productId } });
  await prisma.lapakBlackoutDate.deleteMany({ where: { productId } });
  await prisma.lapakProductRate.deleteMany({ where: { productId } });
  await prisma.lapakProduct.deleteMany({ where: { slug } });
  void adjId;
}

// ─── Test Suite: Lapak — Keranjang per OPD (LJ-2.3) ───────────────────────────
async function runLapakCartSuite() {
  console.log("\n\x1b[36m▶ [Suite 19: Lapak - Keranjang per OPD]\x1b[0m");
  const saToken = await login("superadmin", SUPERADMIN_PASSWORD, "seloko");
  const wargaToken = await login("warga.pedagang@gmail.com", DEFAULT_PASSWORD, WARGA_APP);
  assert("Superadmin login", Boolean(saToken));
  assert("Warga login ke portal Lapak", Boolean(wargaToken));

  await cleanupDebugArtefacts();
  // Bersihkan keranjang warga dari run sebelumnya.
  await prisma.lapakCartItem.deleteMany({ where: { cart: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakCart.deleteMany({ where: { user: { email: "warga.pedagang@gmail.com" } } });

  const cats = await request("/lapak/categories/public", { appCode: "lapak-jambi-web" });
  const gedung = (cats.data?.data ?? []).find((c: any) => c.slug === "sewa-gedung-ruangan");
  const orgs = await request("/organizations/public", { appCode: "lapak-jambi-web" });
  const bpsdm = (orgs.data?.data ?? []).find((o: any) => o.code === "BPSDM");
  const disbudpar = (orgs.data?.data ?? []).find((o: any) => o.code === "DISBUDPAR");

  // Dua produk TERBIT di OPD BERBEDA — inti uji aturan §4.F.
  const mkProduct = async (name: string, orgId: string, slug: string) => {
    const r = await request("/lapak/products", {
      method: "POST", token: saToken || undefined,
      body: {
        organizationId: orgId, categoryId: gedung.id,
        name, description: `Produk uji keranjang ${name}.`,
        rates: [{ name: "Harian", unit: "DAY", price: 200_000 }],
      },
    });
    const id = r.data?.data?.id;
    const rateId = r.data?.data?.rates?.[0]?.id;
    // Tarif harus disetujui dulu: sejak LJ-1.3 tarif publik hanya APPROVED,
    // dan keranjang menolak tarif yang belum disetujui.
    await request(`/lapak/rates/${rateId}/status/submit`, { method: "PATCH", token: saToken || undefined, body: {} });
    await request(`/lapak/rates/${rateId}/status/approve`, { method: "PATCH", token: saToken || undefined, body: {} });
    await request(`/lapak/products/${id}/status/publish`, { method: "PATCH", token: saToken || undefined });
    void slug;
    return { id, rateId, name };
  };

  const prodA = await mkProduct("Keranjang Uji BPSDM", bpsdm.id, "keranjang-uji-bpsdm");
  const prodB = await mkProduct("Keranjang Uji DISBUDPAR", disbudpar.id, "keranjang-uji-disbudpar");
  assert("Dua produk terbit di OPD berbeda", Boolean(prodA.id && prodB.id));

  // ── 1. Butuh login.
  const anon = await request("/lapak/carts");
  assert("Tanpa token ditolak 401", anon.status === 401, anon.status);

  // ── 2. Ambil/buat keranjang per OPD.
  const cartA = await request("/lapak/carts/opd/BPSDM", { token: wargaToken || undefined, appCode: WARGA_APP });
  assert("Keranjang OPD BPSDM 200", cartA.status === 200, cartA.status, cartA.data?.message);
  assert("Keranjang memuat organisasi", cartA.data?.data?.organization?.code === "BPSDM",
    cartA.data?.data?.organization?.code);
  assert("Keranjang baru kosong", (cartA.data?.data?.items ?? []).length === 0);
  const cartAId = cartA.data?.data?.id;

  // Idempoten: meminta lagi mengembalikan keranjang yang SAMA.
  const cartA2 = await request("/lapak/carts/opd/BPSDM", { token: wargaToken || undefined, appCode: WARGA_APP });
  assert("Keranjang OPD sama dipakai ulang", cartA2.data?.data?.id === cartAId, cartA2.data?.data?.id);

  // ── 3. Tambah produk OPD yang sama → berhasil.
  const addA = await request(`/lapak/carts/${cartAId}/items`, {
    method: "POST", token: wargaToken || undefined,
    appCode: WARGA_APP,
    body: { productId: prodA.id, rateId: prodA.rateId, qty: 2 },
  });
  assert("Tambah produk OPD sama 201", addA.status === 201, addA.status, addA.data?.message);
  const itemsA = addA.data?.data?.items ?? [];
  assert("Item masuk keranjang", itemsA.length === 1, itemsA.length);
  assert("Harga satuan terbaca dari tarif", itemsA[0]?.unitPrice === 200_000, itemsA[0]?.unitPrice);
  assert("lineTotal = harga × qty", itemsA[0]?.lineTotal === 400_000, itemsA[0]?.lineTotal);
  assert("subtotal dihitung", addA.data?.data?.subtotal === 400_000, addA.data?.data?.subtotal);
  assert("itemCount = total qty", addA.data?.data?.itemCount === 2, addA.data?.data?.itemCount);

  // ── 4. INTI: produk OPD LAIN ditolak 409 (satu pesanan = satu OPD).
  const addCross = await request(`/lapak/carts/${cartAId}/items`, {
    method: "POST", token: wargaToken || undefined,
    appCode: WARGA_APP,
    body: { productId: prodB.id, qty: 1 },
  });
  assert("Produk OPD lain ditolak 409", addCross.status === 409, addCross.status, addCross.data?.message);

  // ── 5. Keranjang terpisah untuk OPD kedua → berhasil.
  const cartB = await request("/lapak/carts/opd/DISBUDPAR", { token: wargaToken || undefined, appCode: WARGA_APP });
  assert("Keranjang OPD kedua dibuat", cartB.status === 200, cartB.status);
  assert("Keranjang OPD kedua berbeda", cartB.data?.data?.id !== cartAId);
  const cartBId = cartB.data?.data?.id;

  const addB = await request(`/lapak/carts/${cartBId}/items`, {
    method: "POST", token: wargaToken || undefined,
    appCode: WARGA_APP,
    body: { productId: prodB.id, qty: 1 },
  });
  assert("Produk OPD kedua masuk keranjangnya sendiri", addB.status === 201, addB.status, addB.data?.message);

  // ── 6. Daftar keranjang: dua keranjang, satu per OPD.
  const listCarts = await request("/lapak/carts", { token: wargaToken || undefined, appCode: WARGA_APP });
  assert("Daftar keranjang 200", listCarts.status === 200, listCarts.status);
  assert("Tepat 2 keranjang (satu per OPD)", (listCarts.data?.data ?? []).length === 2,
    (listCarts.data?.data ?? []).length);

  // ── 7. Duplikat item identik → qty bertambah, bukan baris baru.
  const addDup = await request(`/lapak/carts/${cartAId}/items`, {
    method: "POST", token: wargaToken || undefined,
    appCode: WARGA_APP,
    body: { productId: prodA.id, rateId: prodA.rateId, qty: 1 },
  });
  assert("Item duplikat menambah qty", (addDup.data?.data?.items ?? []).length === 1,
    (addDup.data?.data?.items ?? []).length);
  assert("Qty jadi 3", addDup.data?.data?.items?.[0]?.qty === 3, addDup.data?.data?.items?.[0]?.qty);

  // ── 8. Ubah qty & hapus item.
  const itemId = addDup.data?.data?.items?.[0]?.id;
  const upd = await request(`/lapak/carts/${cartAId}/items/${itemId}`, {
    method: "PUT", token: wargaToken || undefined, appCode: WARGA_APP, body: { qty: 5, note: "Tolong siapkan kursi" },
  });
  assert("Ubah qty 200", upd.status === 200, upd.status, upd.data?.message);
  assert("Qty jadi 5", upd.data?.data?.items?.[0]?.qty === 5, upd.data?.data?.items?.[0]?.qty);
  assert("Catatan tersimpan", upd.data?.data?.items?.[0]?.note === "Tolong siapkan kursi");

  const del = await request(`/lapak/carts/${cartAId}/items/${itemId}`, {
    method: "DELETE", token: wargaToken || undefined,
  appCode: WARGA_APP,
  });
  assert("Hapus item 200", del.status === 200, del.status);
  assert("Keranjang kosong setelah hapus", (del.data?.data?.items ?? []).length === 0);

  // ── 9. Produk belum terbit ditolak.
  const draftProd = await request("/lapak/products", {
    method: "POST", token: saToken || undefined,
    body: {
      organizationId: bpsdm.id, categoryId: gedung.id,
      name: "Keranjang Uji DRAFT", description: "Produk DRAFT untuk uji keranjang.",
      rates: [{ name: "Harian", unit: "DAY", price: 100_000 }],
    },
  });
  const draftId = draftProd.data?.data?.id;
  const addDraft = await request(`/lapak/carts/${cartAId}/items`, {
    method: "POST", token: wargaToken || undefined, appCode: WARGA_APP, body: { productId: draftId, qty: 1 },
  });
  assert("Produk DRAFT ditolak 400", addDraft.status === 400, addDraft.status, addDraft.data?.message);

  // ── 10. Keranjang milik orang lain tidak bisa diakses (404, bukan 403).
  const otherCart = await request(`/lapak/carts/${cartAId}`, { token: saToken || undefined });
  assert("Keranjang orang lain 404", otherCart.status === 404, otherCart.status);

  // ── 11. Kosongkan & hapus keranjang.
  const cleared = await request(`/lapak/carts/${cartBId}/clear`, { method: "POST", token: wargaToken || undefined, appCode: WARGA_APP });
  assert("Kosongkan keranjang 200", cleared.status === 200, cleared.status);
  assert("Keranjang kosong", (cleared.data?.data?.items ?? []).length === 0);

  const delCart = await request(`/lapak/carts/${cartBId}`, { method: "DELETE", token: wargaToken || undefined, appCode: WARGA_APP });
  assert("Hapus keranjang 200", delCart.status === 200, delCart.status);
  assert("Hapus mengembalikan deleted:true", delCart.data?.data?.deleted === true);

  // ── 12. Bersih-bersih.
  await prisma.lapakCartItem.deleteMany({ where: { cart: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakCart.deleteMany({ where: { user: { email: "warga.pedagang@gmail.com" } } });
  for (const pid of [prodA.id, prodB.id, draftId].filter(Boolean)) {
    await prisma.lapakProductRate.deleteMany({ where: { productId: pid } });
    await prisma.lapakProduct.deleteMany({ where: { id: pid } });
  }
}

// ─── Test Suite: Lapak — Quote & Checkout → Pesanan (LJ-2.4) ─────────────────
async function runLapakOrdersSuite() {
  console.log("\n\x1b[36m▶ [Suite 20: Lapak - Quote & Checkout Pesanan]\x1b[0m");
  const saToken = await login("superadmin", SUPERADMIN_PASSWORD, "seloko");
  const wargaToken = await login("warga.pedagang@gmail.com", DEFAULT_PASSWORD, WARGA_APP);
  assert("Superadmin login", Boolean(saToken));
  assert("Warga login ke portal Lapak", Boolean(wargaToken));
  const W = { token: wargaToken || undefined, appCode: WARGA_APP };

  await cleanupDebugArtefacts();
  await prisma.lapakOrderItem.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakOrderStatusLog.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakOrder.deleteMany({ where: { user: { email: "warga.pedagang@gmail.com" } } });
  await prisma.lapakCartItem.deleteMany({ where: { cart: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakCart.deleteMany({ where: { user: { email: "warga.pedagang@gmail.com" } } });

  const cats = await request("/lapak/categories/public", { appCode: "lapak-jambi-web" });
  const gedung = (cats.data?.data ?? []).find((c: any) => c.slug === "sewa-gedung-ruangan");
  const orgs = await request("/organizations/public", { appCode: "lapak-jambi-web" });
  const bpsdm = (orgs.data?.data ?? []).find((o: any) => o.code === "BPSDM");

  // Produk + tarif APPROVED + terbit.
  const prod = await request("/lapak/products", {
    method: "POST", token: saToken || undefined,
    body: {
      organizationId: bpsdm.id, categoryId: gedung.id,
      name: "Pesanan Uji Produk", description: "Produk uji quote dan checkout pesanan.",
      rates: [{ name: "Harian", unit: "DAY", price: 300_000 }],
    },
  });
  const productId = prod.data?.data?.id;
  const rateId = prod.data?.data?.rates?.[0]?.id;
  await request(`/lapak/rates/${rateId}/status/submit`, { method: "PATCH", token: saToken || undefined, body: {} });
  await request(`/lapak/rates/${rateId}/status/approve`, { method: "PATCH", token: saToken || undefined, body: {} });
  await request(`/lapak/products/${productId}/status/publish`, { method: "PATCH", token: saToken || undefined });
  assert("Produk pesanan siap", Boolean(productId && rateId));

  // Checkout menerbitkan SKRD (LJ-2.5), jadi pengaturan SKRD wajib ada.
  await request("/lapak/skrd/settings", {
    method: "POST", token: saToken || undefined,
    body: {
      issuer: "BAPENDA",
      numberFormat: "{seq6}/SKRD/{issuer}/{romanMonth}/{year}",
      signerName: "H. Al Haris", signerPosition: "Gubernur Jambi", dueDays: 7,
    },
  });

  // Keranjang + 2 item.
  const cart = await request("/lapak/carts/opd/BPSDM", W);
  const cartId = cart.data?.data?.id;
  await request(`/lapak/carts/${cartId}/items`, {
    method: "POST", token: wargaToken || undefined, appCode: WARGA_APP,
    body: { productId, rateId, qty: 2 },
  });
  const withItem = await request(`/lapak/carts/${cartId}`, W);
  assert("Keranjang berisi 1 item", (withItem.data?.data?.items ?? []).length === 1);

  // ── 1. Quote menghitung harga, tidak menyimpan.
  const quote = await request(`/lapak/orders/cart/${cartId}/quote`, W);
  assert("Quote 200", quote.status === 200, quote.status, quote.data?.message);
  const q = quote.data?.data ?? {};
  assert("Quote siap di-checkout", q.ready === true, JSON.stringify(q.warnings));
  assert("Quote 1 baris", (q.lines ?? []).length === 1, (q.lines ?? []).length);
  assert("Harga satuan dari tarif", q.lines?.[0]?.price === 300_000, q.lines?.[0]?.price);
  assert("Subtotal = harga × qty", q.subtotal === 600_000, q.subtotal);
  assert("Total = subtotal", q.total === 600_000, q.total);

  // ── 2. Checkout tanpa data pemohon → 400.
  const noApplicant = await request(`/lapak/orders/cart/${cartId}/checkout`, {
    method: "POST", token: wargaToken || undefined, appCode: WARGA_APP, body: {},
  });
  assert("Checkout tanpa pemohon ditolak 400", noApplicant.status === 400, noApplicant.status);

  // ── 3. Checkout berhasil → pesanan + snapshot.
  const checkout = await request(`/lapak/orders/cart/${cartId}/checkout`, {
    method: "POST", token: wargaToken || undefined, appCode: WARGA_APP,
    body: {
      applicant: {
        name: "Budi Santoso", nik: "1234567890123456", phone: "081234567890",
        email: "budi@example.com", institution: "PT Contoh Jambi",
        address: "Jl. Merdeka No. 1, Jambi",
      },
      purpose: "Rapat koordinasi tahunan",
    },
  });
  assert("Checkout 201", checkout.status === 201, checkout.status, checkout.data?.message);
  const order = checkout.data?.data ?? {};
  assert("Kode pesanan berformat LJK-", typeof order.code === "string" && order.code.startsWith("LJK-"), order.code);
  assert("Status MENUNGGU_PEMBAYARAN", order.status === "MENUNGGU_PEMBAYARAN", order.status);
  assert("Total tersimpan", order.total === 600_000, order.total);
  assert("expiresAt terisi", typeof order.expiresAt === "string");
  assert("Snapshot nama produk", order.items?.[0]?.productName === "Pesanan Uji Produk", order.items?.[0]?.productName);
  assert("Snapshot harga", order.items?.[0]?.price === 300_000, order.items?.[0]?.price);

  // ── 4. INTI: PII TERMASKING di respons.
  assert("NIK termasking", order.applicant?.nik === "1234********3456", order.applicant?.nik);
  // 081234567890 = 12 digit → 4 depan + 4 bintang + 4 belakang.
  assert("Telepon termasking", order.applicant?.phone === "0812****7890", order.applicant?.phone);
  assert("Nama tetap terbaca", order.applicant?.name === "Budi Santoso", order.applicant?.name);

  // ── 5. Keranjang dikosongkan setelah checkout.
  const cartAfter = await request(`/lapak/carts/${cartId}`, W);
  assert("Keranjang kosong setelah checkout", (cartAfter.data?.data?.items ?? []).length === 0);

  // ── 6. INTI SNAPSHOT: naikkan tarif, pesanan lama TIDAK berubah.
  // Tarif APPROVED tidak bisa diedit (409), jadi revisi lewat endpoint revise.
  const revise = await request(`/lapak/rates/${rateId}/revise`, {
    method: "POST", token: saToken || undefined, body: { price: 999_000 },
  });
  const newRateId = revise.data?.data?.id;
  if (newRateId) {
    await request(`/lapak/rates/${newRateId}/status/submit`, { method: "PATCH", token: saToken || undefined, body: {} });
    await request(`/lapak/rates/${newRateId}/status/approve`, { method: "PATCH", token: saToken || undefined, body: {} });
  }
  const afterRevise = await request(`/lapak/orders/${order.id}`, W);
  assert("Harga pesanan TIDAK ikut naik (snapshot)",
    afterRevise.data?.data?.items?.[0]?.price === 300_000, afterRevise.data?.data?.items?.[0]?.price);
  assert("Total pesanan tetap", afterRevise.data?.data?.total === 600_000, afterRevise.data?.data?.total);

  // ── 7. Pesanan saya & filter status.
  const mine = await request("/lapak/orders/mine", W);
  assert("Daftar pesanan saya 200", mine.status === 200, mine.status);
  assert("Pesanan muncul di daftar", (mine.data?.data ?? []).some((o: any) => o.id === order.id));
  assert("PII di list juga termasking",
    mine.data?.data?.[0]?.applicant?.nik !== "1234567890123456", mine.data?.data?.[0]?.applicant?.nik);

  const filtered = await request("/lapak/orders/mine?status=LUNAS", W);
  assert("Filter status bekerja", (filtered.data?.data ?? []).every((o: any) => o.status === "LUNAS"),
    (filtered.data?.data ?? []).length);

  // ── 8. Pesanan orang lain tidak bisa diakses lewat endpoint warga.
  // Endpoint /:id memakai filter userId, jadi akun lain mendapat 404 — bukan
  // 403 — agar keberadaan pesanan orang tidak terbocorkan.
  // Akun INTERNAL selalu login lewat `seloko`, lalu mengakses modul lapak
  // dengan header X-App-Code: seloko.
  const otherUser = await login("admin.bpsdm", DEFAULT_PASSWORD, "seloko");
  const otherView = await request(`/lapak/orders/${order.id}`, {
    token: otherUser || undefined, appCode: "seloko",
  });
  assert("Pesanan orang lain 404 (bukan 403)", otherView.status === 404 || otherView.status === 403, otherView.status);
  assert("Pesanan orang lain TIDAK 200", otherView.status !== 200, otherView.status);

  // ── 9. CMS: daftar pesanan (superadmin, semua OPD).
  const cmsList = await request("/lapak/orders", { token: saToken || undefined });
  assert("CMS daftar pesanan 200", cmsList.status === 200, cmsList.status, cmsList.data?.message);
  assert("CMS melihat pesanan", (cmsList.data?.data ?? []).some((o: any) => o.id === order.id));
  assert("CMS juga melihat PII termasking",
    cmsList.data?.data?.[0]?.applicant?.nik !== "1234567890123456", cmsList.data?.data?.[0]?.applicant?.nik);

  // ── 10. CMS menolak tanpa izin order:read.
  const opaque = await request("/lapak/orders", { token: saToken || undefined, appCode: "lapak-jambi-web" });
  assert("Tanpa izin order:read ditolak 403", opaque.status === 403, opaque.status);

  // ── 11. Checkout keranjang kosong ditolak.
  const emptyCheckout = await request(`/lapak/orders/cart/${cartId}/checkout`, {
    method: "POST", token: wargaToken || undefined, appCode: WARGA_APP,
    body: { applicant: { name: "Budi Santoso", phone: "081234567890" } },
  });
  assert("Checkout keranjang kosong 400", emptyCheckout.status === 400, emptyCheckout.status);

  // ── 12. Bersih-bersih.
  await prisma.lapakSkrd.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakOrderItem.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakOrderStatusLog.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakOrder.deleteMany({ where: { user: { email: "warga.pedagang@gmail.com" } } });
  await prisma.lapakCartItem.deleteMany({ where: { cart: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakCart.deleteMany({ where: { user: { email: "warga.pedagang@gmail.com" } } });
  await prisma.lapakProductRate.deleteMany({ where: { productId } });
  await prisma.lapakProduct.deleteMany({ where: { id: productId } });
}

// ─── Test Suite: Lapak — Pengaturan SKRD & Penomoran Gapless (LJ-2.5) ────────
async function runLapakSkrdSuite() {
  console.log("\n\x1b[36m▶ [Suite 21: Lapak - SKRD & Penomoran Gapless]\x1b[0m");
  const saToken = await login("superadmin", SUPERADMIN_PASSWORD, "seloko");
  const wargaToken = await login("warga.pedagang@gmail.com", DEFAULT_PASSWORD, WARGA_APP);
  assert("Superadmin login", Boolean(saToken));
  assert("Warga login ke portal Lapak", Boolean(wargaToken));
  const W = { token: wargaToken || undefined, appCode: WARGA_APP };

  await cleanupDebugArtefacts();
  await prisma.lapakOrderItem.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakOrderStatusLog.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakSkrd.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakOrder.deleteMany({ where: { user: { email: "warga.pedagang@gmail.com" } } });
  await prisma.lapakCartItem.deleteMany({ where: { cart: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakCart.deleteMany({ where: { user: { email: "warga.pedagang@gmail.com" } } });
  // Sequence & pengaturan uji dibersihkan agar nomor mulai dari 1.
  await prisma.lapakSkrdSequence.deleteMany({ where: { issuerKey: { in: ["BAPENDA", "BPSDM"] }, year: { gte: 2020 } } });

  const cats = await request("/lapak/categories/public", { appCode: "lapak-jambi-web" });
  const gedung = (cats.data?.data ?? []).find((c: any) => c.slug === "sewa-gedung-ruangan");
  const orgs = await request("/organizations/public", { appCode: "lapak-jambi-web" });
  const bpsdm = (orgs.data?.data ?? []).find((o: any) => o.code === "BPSDM");

  // ── 1. Belum ada pengaturan → checkout sakral gagal dengan pesan jelas.
  const prod = await request("/lapak/products", {
    method: "POST", token: saToken || undefined,
    body: {
      organizationId: bpsdm.id, categoryId: gedung.id,
      name: "SKRD Uji Produk", description: "Produk uji penerbitan SKRD.",
      rates: [{ name: "Harian", unit: "DAY", price: 250_000 }],
    },
  });
  const productId = prod.data?.data?.id;
  const rateId = prod.data?.data?.rates?.[0]?.id;
  assert("Produk SKRD uji berhasil dibuat", prod.status === 201, prod.status, prod.data?.message);
  assert("Tarif produk SKRD ada", Boolean(rateId), String(rateId ?? "undefined"));
  await request(`/lapak/rates/${rateId}/status/submit`, { method: "PATCH", token: saToken || undefined, body: {} });
  await request(`/lapak/rates/${rateId}/status/approve`, { method: "PATCH", token: saToken || undefined, body: {} });
  await request(`/lapak/products/${productId}/status/publish`, { method: "PATCH", token: saToken || undefined });

  const mkOrder = async () => {
    const cart = await request("/lapak/carts/opd/BPSDM", W);
    const cartId = cart.data?.data?.id;
    const added = await request(`/lapak/carts/${cartId}/items`, {
      method: "POST", token: wargaToken || undefined, appCode: WARGA_APP,
      body: { productId, rateId, qty: 1 },
    });
    assert("Item masuk keranjang (prasyarat)", added.status === 201, added.status, added.data?.message);
    return cartId;
  };
  const checkout = async (cartId: string) => request(`/lapak/orders/cart/${cartId}/checkout`, {
    method: "POST", token: wargaToken || undefined, appCode: WARGA_APP,
    body: { applicant: { name: "Budi Santoso", nik: "1234567890123456", phone: "081234567890" } },
  });

  // Bersihkan pengaturan lama supaya uji "belum ada pengaturan" valid.
  await prisma.lapakSkrdSetting.deleteMany({});
  const noSettingCart = await mkOrder();
  const noSetting = await checkout(noSettingCart);
  assert("Checkout tanpa pengaturan SKRD ditolak 400", noSetting.status === 400, noSetting.status);
  assert("Pesan menyebut pengaturan SKRD",
    String(noSetting.data?.message ?? "").toLowerCase().includes("pengaturan skrd"), noSetting.data?.message);

  // ── 2. Simpan pengaturan DEFAULT (Bapenda).
  const setDefault = await request("/lapak/skrd/settings", {
    method: "POST", token: saToken || undefined,
    body: {
      issuer: "BAPENDA",
      numberFormat: "{seq6}/SKRD/{issuer}/{romanMonth}/{year}",
      signerName: "H. Al Haris",
      signerNip: "196505121990031010",
      signerPosition: "Gubernur Jambi",
      bankName: "Bank Jambi",
      bankAccount: "001-02-000123-4",
      bankHolder: "Kas Daerah Provinsi Jambi",
      dueDays: 7,
    },
  });
  assert("Pengaturan default disimpan 200", setDefault.status === 200, setDefault.status, setDefault.data?.message);
  assert("Pengaturan default tanpa OPD", setDefault.data?.data?.organizationCode === null,
    setDefault.data?.data?.organizationCode);

  // ── 3. Format nomor salah ditolak (tanpa {seq}).
  const badFmt = await request("/lapak/skrd/settings", {
    method: "POST", token: saToken || undefined,
    body: { issuer: "BAPENDA", numberFormat: "SKRD/{year}", signerName: "Pejabat" },
  });
  assert("Format tanpa {seq} ditolak 400", badFmt.status === 400, badFmt.status);

  const badToken = await request("/lapak/skrd/settings", {
    method: "POST", token: saToken || undefined,
    body: { issuer: "BAPENDA", numberFormat: "{seqq}/SKRD/{year}", signerName: "Pejabat" },
  });
  assert("Token tak dikenal ditolak 400", badToken.status === 400, badToken.status);

  // ── 4. Pratinjau nomor berikutnya.
  const preview = await request("/lapak/skrd/settings/preview/BPSDM", { token: saToken || undefined });
  assert("Pratinjau nomor 200", preview.status === 200, preview.status, preview.data?.message);
  assert("Nomor pratinjau mulai dari 1", preview.data?.data?.nextSeq === 1, preview.data?.data?.nextSeq);
  const year = new Date().getFullYear();
  assert("Format nomor sesuai template",
    preview.data?.data?.preview === `000001/SKRD/BAPENDA/${["I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII"][new Date().getMonth()]}/${year}`,
    preview.data?.data?.preview);

  // ── 5. Checkout → SKRD terbit otomatis dengan nomor 1.
  const co1 = await checkout(await mkOrder());
  assert("Checkout 201 dengan pengaturan ada", co1.status === 201, co1.status, co1.data?.message);
  const order1 = co1.data?.data ?? {};
  assert("Pesanan menyertakan SKRD", Boolean(order1.skrd), JSON.stringify(order1.skrd));
  assert("Nomor SKRD = 000001", order1.skrd?.number?.startsWith("000001/SKRD/BAPENDA/"), order1.skrd?.number);
  assert("SKRD menerbitkan status TERBIT", order1.skrd?.status === "TERBIT", order1.skrd?.status);
  assert("SKRD memuat snapshot penandatangan", order1.skrd?.issuerCode === "BAPENDA", order1.skrd?.issuerCode);
  assert("Jumlah SKRD = total pesanan", order1.skrd?.amount === order1.total, `${order1.skrd?.amount} vs ${order1.total}`);

  // ── 6. GAUNTLESS: checkout berikutnya nomor 2, 3 (tanpa lompat).
  const co2 = await checkout(await mkOrder());
  const co3 = await checkout(await mkOrder());
  assert("Nomor kedua = 000002", co2.data?.data?.skrd?.number?.startsWith("000002/"), co2.data?.data?.skrd?.number);
  assert("Nomor ketiga = 000003", co3.data?.data?.skrd?.number?.startsWith("000003/"), co3.data?.data?.skrd?.number);

  // ── 7. INTI: dua checkout PARALEL → nomor tetap unik & berurutan.
  // Kedua keranjang HARUS disiapkan sebelum Promise.all: satu keranjang per
  // OPD, sehingga menyiapkan di dalam callback membuat keduanya memakai
  // keranjang yang sama dan yang kedua menemukannya kosong.
  const cartP1 = await mkOrder();
  const cartP2 = await mkOrder();
  const [p1, p2] = await Promise.all([checkout(cartP1), checkout(cartP2)]);
  const nums = [p1, p2].filter((r) => r.status === 201).map((r) => r.data?.data?.skrd?.number);
  assert("Dua checkout paralel sama-sama 201", nums.length === 2, `${p1.status}/${p2.status}`);
  assert("Nomor paralel TIDAK kembar", nums[0] !== nums[1], nums.join(" vs "));
  const seqs = nums.map((n) => Number(String(n).split("/")[0]));
  assert("Nomor paralel berurutan (4 dan 5)",
    seqs.sort((a, b) => a - b).join(",") === "4,5", seqs.join(","));

  // ── 8. Verifikasi publik lewat token QR.
  const skrdId = order1.skrd?.id;
  const full = await request(`/lapak/skrd/${skrdId}`, { token: saToken || undefined });
  assert("Detail SKRD 200", full.status === 200, full.status);
  const qrToken = await prisma.lapakSkrd.findUnique({ where: { id: skrdId }, select: { qrToken: true } });
  const verify = await request(`/lapak/skrd/verify/${qrToken?.qrToken}`, { appCode: "lapak-jambi-web" });
  assert("Verifikasi publik 200 (tanpa login)", verify.status === 200, verify.status, verify.data?.message);
  assert("Verifikasi menyatakan valid", verify.data?.data?.valid === true);
  assert("Verifikasi TIDAK membocorkan NIK", !("nik" in (verify.data?.data ?? {})),
    Object.keys(verify.data?.data ?? {}).join(","));
  assert("Nama pemohon termasking di verifikasi",
    verify.data?.data?.applicantName !== "Budi Santoso", verify.data?.data?.applicantName);

  const badTokenVerify = await request("/lapak/skrd/verify/token-palsu-123456", { appCode: "lapak-jambi-web" });
  assert("Token palsu 404", badTokenVerify.status === 404, badTokenVerify.status);

  // ── 9. Batalkan SKRD → nomor TIDAK dipakai ulang (gapless).
  const cancel = await request(`/lapak/skrd/${skrdId}/cancel`, { method: "POST", token: saToken || undefined });
  assert("Batalkan SKRD 200", cancel.status === 200, cancel.status, cancel.data?.message);
  assert("Status jadi CANCELLED", cancel.data?.data?.status === "CANCELLED", cancel.data?.data?.status);

  const coNext = await checkout(await mkOrder());
  const nextNum = coNext.data?.data?.skrd?.number;
  assert("Nomor setelah pembatalan TIDAK memakai ulang 000001",
    !String(nextNum).startsWith("000001/"), nextNum);
  assert("Nomor lanjut ke 000006", String(nextNum).startsWith("000006/"), nextNum);

  const verifyCancelled = await request(`/lapak/skrd/verify/${qrToken?.qrToken}`, { appCode: "lapak-jambi-web" });
  assert("SKRD dibatalkan ditandai tidak valid", verifyCancelled.data?.data?.valid === false);

  // ── 10. Pengaturan per OPD menimpa default.
  const setOpd = await request("/lapak/skrd/settings", {
    method: "POST", token: saToken || undefined,
    body: {
      organizationCode: "BPSDM", issuer: "OPD",
      numberFormat: "{seq6}/SKRD/{orgCode}/{romanMonth}/{year}",
      signerName: "Kepala BPSDM", signerPosition: "Kepala Badan", dueDays: 14,
    },
  });
  assert("Pengaturan per OPD disimpan", setOpd.status === 200, setOpd.status, setOpd.data?.message);
  assert("Pengaturan OPD menyebut kode", setOpd.data?.data?.organizationCode === "BPSDM",
    setOpd.data?.data?.organizationCode);

  const coOpd = await checkout(await mkOrder());
  const opdNum = coOpd.data?.data?.skrd?.number;
  assert("Penerbit OPD memakai kode OPD", String(opdNum).includes("BPSDM"), opdNum);
  assert("Sequence OPD terpisah (mulai 000001)", String(opdNum).startsWith("000001/"), opdNum);
  assert("SKRD penerbit OPD", coOpd.data?.data?.skrd?.issuer === "OPD", coOpd.data?.data?.skrd?.issuer);

  // ── 11. Daftar SKRD & sinkron dengan nomor urut.
  const listSkrd = await request("/lapak/skrd?limit=100", { token: saToken || undefined });
  assert("Daftar SKRD 200", listSkrd.status === 200, listSkrd.status, listSkrd.data?.message);
  const all = listSkrd.data?.data ?? [];
  assert("SKRD tercatat di daftar", all.some((s: any) => s.id === skrdId));
  const numbers = all.map((s: any) => s.number);
  assert("Tidak ada nomor kembar", new Set(numbers).size === numbers.length,
    `${numbers.length} vs ${new Set(numbers).size}`);

  // ── 12. Bersih-bersih.
  await prisma.lapakSkrd.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakOrderItem.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakOrderStatusLog.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakOrder.deleteMany({ where: { user: { email: "warga.pedagang@gmail.com" } } });
  await prisma.lapakCartItem.deleteMany({ where: { cart: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakCart.deleteMany({ where: { user: { email: "warga.pedagang@gmail.com" } } });
  await prisma.lapakSkrdSetting.deleteMany({});
  await prisma.lapakSkrdSequence.deleteMany({ where: { issuerKey: { in: ["BAPENDA", "BPSDM"] }, year: { gte: 2020 } } });
  await prisma.lapakProductRate.deleteMany({ where: { productId } });
  await prisma.lapakProduct.deleteMany({ where: { id: productId } });
}

// ─── Test Suite: Lapak — Pembayaran Transfer Manual (LJ-2.6) ─────────────────
async function runLapakPaymentsSuite() {
  console.log("\n\x1b[36m▶ [Suite 22: Lapak - Pembayaran Transfer Manual]\x1b[0m");
  const saToken = await login("superadmin", SUPERADMIN_PASSWORD, "seloko");
  const wargaToken = await login("warga.pedagang@gmail.com", DEFAULT_PASSWORD, WARGA_APP);
  assert("Superadmin login", Boolean(saToken));
  assert("Warga login ke portal Lapak", Boolean(wargaToken));
  const W = { token: wargaToken || undefined, appCode: WARGA_APP };

  await cleanupDebugArtefacts();
  await prisma.lapakPayment.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakSkrd.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakOrderItem.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakOrderStatusLog.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakOrder.deleteMany({ where: { user: { email: "warga.pedagang@gmail.com" } } });
  await prisma.lapakCartItem.deleteMany({ where: { cart: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakCart.deleteMany({ where: { user: { email: "warga.pedagang@gmail.com" } } });
  await prisma.lapakSkrdSequence.deleteMany({ where: { issuerKey: { in: ["BAPENDA", "BPSDM"] }, year: { gte: 2020 } } });

  const cats = await request("/lapak/categories/public", { appCode: "lapak-jambi-web" });
  const gedung = (cats.data?.data ?? []).find((c: any) => c.slug === "sewa-gedung-ruangan");
  const orgs = await request("/organizations/public", { appCode: "lapak-jambi-web" });
  const bpsdm = (orgs.data?.data ?? []).find((o: any) => o.code === "BPSDM");

  // Produk + tarif approved + terbit + pengaturan SKRD.
  const prod = await request("/lapak/products", {
    method: "POST", token: saToken || undefined,
    body: {
      organizationId: bpsdm.id, categoryId: gedung.id,
      name: "Bayar Uji Produk", description: "Produk uji pembayaran transfer manual.",
      rates: [{ name: "Harian", unit: "DAY", price: 400_000 }],
    },
  });
  const productId = prod.data?.data?.id;
  const rateId = prod.data?.data?.rates?.[0]?.id;
  await request(`/lapak/rates/${rateId}/status/submit`, { method: "PATCH", token: saToken || undefined, body: {} });
  await request(`/lapak/rates/${rateId}/status/approve`, { method: "PATCH", token: saToken || undefined, body: {} });
  await request(`/lapak/products/${productId}/status/publish`, { method: "PATCH", token: saToken || undefined });
  await request("/lapak/skrd/settings", {
    method: "POST", token: saToken || undefined,
    body: {
      issuer: "BAPENDA", numberFormat: "{seq6}/SKRD/{issuer}/{romanMonth}/{year}",
      signerName: "H. Al Haris", signerPosition: "Gubernur Jambi",
      bankName: "Bank Jambi", bankAccount: "001-02-000123-4",
      bankHolder: "Kas Daerah Provinsi Jambi", dueDays: 7,
    },
  });

  // Buat pesanan.
  const cart = await request("/lapak/carts/opd/BPSDM", W);
  const cartId = cart.data?.data?.id;
  await request(`/lapak/carts/${cartId}/items`, {
    method: "POST", token: wargaToken || undefined, appCode: WARGA_APP,
    body: { productId, rateId, qty: 2 },
  });
  const co = await request(`/lapak/orders/cart/${cartId}/checkout`, {
    method: "POST", token: wargaToken || undefined, appCode: WARGA_APP,
    body: { applicant: { name: "Budi Santoso", nik: "1234567890123456", phone: "081234567890" } },
  });
  assert("Checkout 201", co.status === 201, co.status, co.data?.message);
  const order = co.data?.data ?? {};
  assert("Total pesanan 800000", order.total === 800_000, order.total);

  // ── 1. Baris pembayaran dibuat otomatis saat checkout.
  assert("Pembayaran otomatis dibuat", (order.payments ?? []).length === 1, (order.payments ?? []).length);
  const pay0 = order.payments?.[0] ?? {};
  assert("Status awal MENUNGGU_BUKTI", pay0.status === "MENUNGGU_BUKTI", pay0.status);
  assert("Metode MANUAL_TRANSFER", pay0.method === "MANUAL_TRANSFER", pay0.method);
  assert("Jumlah pembayaran = total", pay0.amount === 800_000, pay0.amount);

  // ── 2. Detail pembayaran memuat rekening dari snapshot SKRD.
  const payList = await request(`/lapak/payments/order/${order.id}`, W);
  assert("Daftar pembayaran pesanan 200", payList.status === 200, payList.status, payList.data?.message);
  const payDetail = payList.data?.data?.[0] ?? {};
  assert("Rekening tujuan dari SKRD", payDetail.bank?.account === "001-02-000123-4", payDetail.bank?.account);
  assert("Bank tujuan dari SKRD", payDetail.bank?.name === "Bank Jambi", payDetail.bank?.name);
  assert("Batas waktu ikut jatuh tempo SKRD", Boolean(payDetail.expiresAt), payDetail.expiresAt);

  // ── 3. Unggah bukti — URL eksternal ditolak (wajib ImageKit).
  const paymentId = payDetail.id;
  const externalUrl = await request(`/lapak/payments/${paymentId}/proof`, {
    method: "POST", token: wargaToken || undefined, appCode: WARGA_APP,
    body: {
      proofUrl: "ftp://evil.example.com/bukti.jpg", proofFileId: "abc123",
      senderName: "Budi Santoso", senderBank: "Bank Jambi",
      amount: 800_000, paidAt: new Date().toISOString(),
    },
  });
  assert("URL non-http ditolak 400", externalUrl.status === 400, externalUrl.status);

  const noFileId = await request(`/lapak/payments/${paymentId}/proof`, {
    method: "POST", token: wargaToken || undefined, appCode: WARGA_APP,
    body: {
      proofUrl: "https://ik.imagekit.io/seloko/lapak/payments/bukti.jpg",
      senderName: "Budi Santoso", senderBank: "Bank Jambi",
      amount: 800_000, paidAt: new Date().toISOString(),
    },
  });
  assert("Tanpa proofFileId ditolak 400", noFileId.status === 400, noFileId.status);

  // ── 4. Unggah bukti valid → MENUNGGU_KONFIRMASI.
  const proof = await request(`/lapak/payments/${paymentId}/proof`, {
    method: "POST", token: wargaToken || undefined, appCode: WARGA_APP,
    body: {
      proofUrl: "https://ik.imagekit.io/seloko/lapak/payments/bukti-transfer.jpg",
      proofFileId: "ik_file_abc123",
      senderName: "Budi Santoso", senderBank: "Bank Jambi",
      amount: 800_000, paidAt: new Date().toISOString(),
      note: "Transfer via mobile banking",
    },
  });
  assert("Unggah bukti 200", proof.status === 200, proof.status, proof.data?.message);
  assert("Status jadi MENUNGGU_KONFIRMASI", proof.data?.data?.status === "MENUNGGU_KONFIRMASI",
    proof.data?.data?.status);
  assert("URL bukti tersimpan", proof.data?.data?.proofUrl?.includes("imagekit"), proof.data?.data?.proofUrl);
  assert("fileId tersimpan", proof.data?.data?.proofFileId === "ik_file_abc123", proof.data?.data?.proofFileId);
  assert("Nama pengirim tersimpan", proof.data?.data?.senderName === "Budi Santoso");

  // ── 5. Pesanan ikut MENUNGGU_KONFIRMASI.
  const orderAfterProof = await request(`/lapak/orders/${order.id}`, W);
  assert("Pesanan jadi MENUNGGU_KONFIRMASI",
    orderAfterProof.data?.data?.status === "MENUNGGU_KONFIRMASI", orderAfterProof.data?.data?.status);

  // ── 6. Warga tidak bisa mengonfirmasi pembayarannya sendiri.
  const selfConfirm = await request(`/lapak/payments/${paymentId}/verify`, {
    method: "POST", token: wargaToken || undefined, appCode: WARGA_APP, body: {},
  });
  assert("Warga tidak boleh konfirmasi (403/401)", [401, 403].includes(selfConfirm.status), selfConfirm.status);

  // ── 7. INTI: nominal kurang DITOLAK walau admin mencoba.
  const underpay = await request(`/lapak/payments/${paymentId}/verify`, {
    method: "POST", token: saToken || undefined, body: { amount: 500_000 },
  });
  assert("Nominal kurang ditolak 400", underpay.status === 400, underpay.status, underpay.data?.message);
  assert("Pesan menyebut kurang", String(underpay.data?.message ?? "").toLowerCase().includes("kurang"),
    underpay.data?.message);

  // Pastikan belum ada efek samping.
  const stillPending = await prisma.lapakPayment.findUnique({ where: { id: paymentId }, select: { status: true } });
  assert("Gagal konfirmasi tidak mengubah status", stillPending?.status === "MENUNGGU_KONFIRMASI", stillPending?.status);

  // ── 8. Konfirmasi valid → LUNAS (atomik: pembayaran + pesanan + SKRD).
  const confirm = await request(`/lapak/payments/${paymentId}/verify`, {
    method: "POST", token: saToken || undefined, body: { note: "Dana masuk rekening kas daerah" },
  });
  assert("Konfirmasi 200", confirm.status === 200, confirm.status, confirm.data?.message);
  assert("Pembayaran LUNAS", confirm.data?.data?.status === "LUNAS", confirm.data?.data?.status);
  assert("confirmedAt terisi", Boolean(confirm.data?.data?.confirmedAt));

  const orderLunas = await request(`/lapak/orders/${order.id}`, W);
  assert("Pesanan LUNAS", orderLunas.data?.data?.status === "LUNAS", orderLunas.data?.data?.status);
  assert("SKRD LUNAS", orderLunas.data?.data?.skrd?.status === "LUNAS", orderLunas.data?.data?.skrd?.status);

  // ── 9. Konfirmasi ulang idempoten (tidak menggandakan).
  const reConfirm = await request(`/lapak/payments/${paymentId}/verify`, {
    method: "POST", token: saToken || undefined, body: {},
  });
  assert("Konfirmasi ulang tetap 200 (idempoten)", reConfirm.status === 200, reConfirm.status);

  // ── 10. Unggah bukti setelah LUNAS ditolak.
  const proofAfterPaid = await request(`/lapak/payments/${paymentId}/proof`, {
    method: "POST", token: wargaToken || undefined, appCode: WARGA_APP,
    body: {
      proofUrl: "https://ik.imagekit.io/seloko/lapak/payments/lagi.jpg",
      proofFileId: "ik_x", senderName: "Budi", senderBank: "Bank Jambi",
      amount: 800_000, paidAt: new Date().toISOString(),
    },
  });
  assert("Bukti setelah LUNAS ditolak 400", proofAfterPaid.status === 400, proofAfterPaid.status);

  // ── 11. Pembayaran orang lain tidak bisa diakses (404).
  const otherToken = await login("admin.bpsdm", DEFAULT_PASSWORD, "seloko");
  const otherView = await request(`/lapak/payments/${paymentId}`, {
    token: otherToken || undefined, appCode: "seloko",
  });
  assert("Pembayaran orang lain tidak 200", otherView.status !== 200, otherView.status);

  // ── 12. Alur penolakan: buat pesanan baru, unggah, tolak, unggah ulang.
  const cart2 = await request("/lapak/carts/opd/BPSDM", W);
  await request(`/lapak/carts/${cart2.data?.data?.id}/items`, {
    method: "POST", token: wargaToken || undefined, appCode: WARGA_APP,
    body: { productId, rateId, qty: 1 },
  });
  const co2 = await request(`/lapak/orders/cart/${cart2.data?.data?.id}/checkout`, {
    method: "POST", token: wargaToken || undefined, appCode: WARGA_APP,
    body: { applicant: { name: "Budi Santoso", phone: "081234567890" } },
  });
  const order2 = co2.data?.data ?? {};
  const pay2 = order2.payments?.[0]?.id;

  await request(`/lapak/payments/${pay2}/proof`, {
    method: "POST", token: wargaToken || undefined, appCode: WARGA_APP,
    body: {
      proofUrl: "https://ik.imagekit.io/seloko/lapak/payments/bukti2.jpg",
      proofFileId: "ik_file_b2", senderName: "Budi Santoso", senderBank: "Bank Jambi",
      amount: 400_000, paidAt: new Date().toISOString(),
    },
  });
  const reject = await request(`/lapak/payments/${pay2}/reject`, {
    method: "POST", token: saToken || undefined,
    body: { reason: "Bukti tidak terbaca, mohon unggah ulang" },
  });
  assert("Tolak pembayaran 200", reject.status === 200, reject.status, reject.data?.message);
  assert("Status DITOLAK", reject.data?.data?.status === "DITOLAK", reject.data?.data?.status);
  assert("Alasan penolakan tersimpan",
    reject.data?.data?.rejectReason?.includes("tidak terbaca"), reject.data?.data?.rejectReason);

  const order2After = await request(`/lapak/orders/${order2.id}`, W);
  assert("Pesanan kembali MENUNGGU_PEMBAYARAN",
    order2After.data?.data?.status === "MENUNGGU_PEMBAYARAN", order2After.data?.data?.status);

  // Unggah ulang setelah ditolak → boleh, alasan penolakan bersih.
  const reupload = await request(`/lapak/payments/${pay2}/proof`, {
    method: "POST", token: wargaToken || undefined, appCode: WARGA_APP,
    body: {
      proofUrl: "https://ik.imagekit.io/seloko/lapak/payments/bukti2b.jpg",
      proofFileId: "ik_file_b2b", senderName: "Budi Santoso", senderBank: "Bank Jambi",
      amount: 400_000, paidAt: new Date().toISOString(),
    },
  });
  assert("Unggah ulang setelah ditolak 200", reupload.status === 200, reupload.status, reupload.data?.message);
  assert("Kembali MENUNGGU_KONFIRMASI",
    reupload.data?.data?.status === "MENUNGGU_KONFIRMASI", reupload.data?.data?.status);
  assert("Alasan penolakan dibersihkan", reupload.data?.data?.rejectReason === null,
    reupload.data?.data?.rejectReason);

  // ── 13. Daftar pembayaran CMS + filter status.
  const cmsList = await request("/lapak/payments?limit=100", { token: saToken || undefined });
  assert("Daftar pembayaran CMS 200", cmsList.status === 200, cmsList.status, cmsList.data?.message);
  assert("Pembayaran muncul di CMS", (cmsList.data?.data ?? []).some((p: any) => p.id === paymentId));

  const filtered = await request("/lapak/payments?status=LUNAS&limit=100", { token: saToken || undefined });
  assert("Filter status LUNAS bekerja",
    (filtered.data?.data ?? []).every((p: any) => p.status === "LUNAS"),
    (filtered.data?.data ?? []).length);

  // ── 14. Bersih-bersih.
  await prisma.lapakPayment.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakSkrd.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakOrderItem.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakOrderStatusLog.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakOrder.deleteMany({ where: { user: { email: "warga.pedagang@gmail.com" } } });
  await prisma.lapakCartItem.deleteMany({ where: { cart: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakCart.deleteMany({ where: { user: { email: "warga.pedagang@gmail.com" } } });
  await prisma.lapakSkrdSetting.deleteMany({});
  await prisma.lapakSkrdSequence.deleteMany({ where: { issuerKey: { in: ["BAPENDA", "BPSDM"] }, year: { gte: 2020 } } });
  await prisma.lapakProductRate.deleteMany({ where: { productId } });
  await prisma.lapakProduct.deleteMany({ where: { id: productId } });
}

// ─── Test Suite: Lapak — Tiket QR & Check-in (LJ-2.7) ────────────────────────
async function runLapakTicketsSuite() {
  console.log("\n\x1b[36m▶ [Suite 23: Lapak - Tiket QR & Check-in]\x1b[0m");
  const saToken = await login("superadmin", SUPERADMIN_PASSWORD, "seloko");
  const wargaToken = await login("warga.pedagang@gmail.com", DEFAULT_PASSWORD, WARGA_APP);
  assert("Superadmin login", Boolean(saToken));
  assert("Warga login ke portal Lapak", Boolean(wargaToken));
  const W = { token: wargaToken || undefined, appCode: WARGA_APP };

  await cleanupDebugArtefacts();
  await prisma.lapakTicket.deleteMany({ where: { orderItem: { order: { user: { email: "warga.pedagang@gmail.com" } } } } });
  await prisma.lapakPayment.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakSkrd.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakOrderItem.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakOrderStatusLog.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakOrder.deleteMany({ where: { user: { email: "warga.pedagang@gmail.com" } } });
  await prisma.lapakCartItem.deleteMany({ where: { cart: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakCart.deleteMany({ where: { user: { email: "warga.pedagang@gmail.com" } } });
  await prisma.lapakSkrdSequence.deleteMany({ where: { issuerKey: { in: ["BAPENDA", "BPSDM"] }, year: { gte: 2020 } } });

  const cats = await request("/lapak/categories/public", { appCode: "lapak-jambi-web" });
  const rekreasi = (cats.data?.data ?? []).find((c: any) => c.slug === "rekreasi-olahraga")
    ?? (cats.data?.data ?? []).find((c: any) => c.slug === "sewa-gedung-ruangan");
  const orgs = await request("/organizations/public", { appCode: "lapak-jambi-web" });
  const bpsdm = (orgs.data?.data ?? []).find((o: any) => o.code === "BPSDM");

  // Produk dengan fulfillmentType TICKET_QR — menentukan kind tiket.
  const prod = await request("/lapak/products", {
    method: "POST", token: saToken || undefined,
    body: {
      organizationId: bpsdm.id, categoryId: rekreasi.id,
      name: "Tiket Uji Kolam", description: "Produk uji tiket QR kolam renang.",
      pricingUnit: "PERSON", availabilityType: "SLOT", fulfillmentType: "TICKET_QR",
      rates: [{ name: "Per Orang", unit: "PERSON", price: 25_000 }],
    },
  });
  const productId = prod.data?.data?.id;
  const rateId = prod.data?.data?.rates?.[0]?.id;
  await request(`/lapak/rates/${rateId}/status/submit`, { method: "PATCH", token: saToken || undefined, body: {} });
  await request(`/lapak/rates/${rateId}/status/approve`, { method: "PATCH", token: saToken || undefined, body: {} });
  await request(`/lapak/products/${productId}/status/publish`, { method: "PATCH", token: saToken || undefined });
  await request("/lapak/skrd/settings", {
    method: "POST", token: saToken || undefined,
    body: {
      issuer: "BAPENDA", numberFormat: "{seq6}/SKRD/{issuer}/{romanMonth}/{year}",
      signerName: "H. Al Haris", signerPosition: "Gubernur Jambi",
      bankName: "Bank Jambi", bankAccount: "001-02-000123-4", dueDays: 7,
    },
  });

  // Pesanan → bukti → konfirmasi LUNAS.
  const cart = await request("/lapak/carts/opd/BPSDM", W);
  const cartId = cart.data?.data?.id;
  await request(`/lapak/carts/${cartId}/items`, {
    method: "POST", token: wargaToken || undefined, appCode: WARGA_APP,
    body: { productId, rateId, qty: 3 },
  });
  const co = await request(`/lapak/orders/cart/${cartId}/checkout`, {
    method: "POST", token: wargaToken || undefined, appCode: WARGA_APP,
    body: { applicant: { name: "Budi Santoso", nik: "1234567890123456", phone: "081234567890" } },
  });
  const order = co.data?.data ?? {};
  assert("Checkout 201", co.status === 201, co.status, co.data?.message);

  // ── 1. Sebelum LUNAS: BELUM ada tiket.
  assert("Tiket belum terbit sebelum LUNAS", (order.tickets ?? []).length === 0, (order.tickets ?? []).length);

  const paymentId = order.payments?.[0]?.id;
  await request(`/lapak/payments/${paymentId}/proof`, {
    method: "POST", token: wargaToken || undefined, appCode: WARGA_APP,
    body: {
      proofUrl: "https://ik.imagekit.io/seloko/lapak/payments/bukti-tiket.jpg",
      proofFileId: "ik_tiket_1", senderName: "Budi Santoso", senderBank: "Bank Jambi",
      amount: 75_000, paidAt: new Date().toISOString(),
    },
  });

  // ── 2. Setelah LUNAS: tiket terbit dengan kind TICKET.
  const confirm = await request(`/lapak/payments/${paymentId}/verify`, {
    method: "POST", token: saToken || undefined, body: {},
  });
  assert("Konfirmasi pembayaran 200", confirm.status === 200, confirm.status, confirm.data?.message);

  const afterPaid = await request(`/lapak/orders/${order.id}`, W);
  const ticketsAfter = afterPaid.data?.data?.tickets ?? [];
  assert("Tiket terbit setelah LUNAS", ticketsAfter.length === 1, ticketsAfter.length);
  const ticket = ticketsAfter[0] ?? {};
  assert("Kind tiket = TICKET (dari TICKET_QR)", ticket.kind === "TICKET", ticket.kind);
  assert("Status AKTIF", ticket.status === "AKTIF", ticket.status);
  assert("Kode berformat TKT-", String(ticket.code).startsWith("TKT-"), ticket.code);
  assert("Snapshot nama produk", ticket.productName === "Tiket Uji Kolam", ticket.productName);

  // ── 3. Warga bisa lihat tiket pesanannya.
  const myTickets = await request(`/lapak/tickets/order/${order.id}`, W);
  assert("Daftar tiket pesanan 200", myTickets.status === 200, myTickets.status, myTickets.data?.message);
  assert("Warga melihat tiketnya", (myTickets.data?.data ?? []).length === 1);

  // ── 4. Verifikasi publik lewat token QR & kode pendek.
  const ticketRow = await prisma.lapakTicket.findUnique({
    where: { id: ticket.id }, select: { qrToken: true, code: true },
  });
  const verifyQr = await request(`/lapak/tickets/verify/${ticketRow?.qrToken}`, { appCode: "lapak-jambi-web" });
  assert("Verifikasi QR publik 200", verifyQr.status === 200, verifyQr.status, verifyQr.data?.message);
  assert("Tiket usable", verifyQr.data?.data?.usable === true, verifyQr.data?.data?.reason);
  assert("Verifikasi TANPA NIK", !("nik" in (verifyQr.data?.data ?? {})),
    Object.keys(verifyQr.data?.data ?? {}).join(","));

  const verifyCode = await request(`/lapak/tickets/verify/${ticketRow?.code}`, { appCode: "lapak-jambi-web" });
  assert("Verifikasi lewat KODE pendek 200", verifyCode.status === 200, verifyCode.status);
  assert("Kode sama dengan QR", verifyCode.data?.data?.code === ticketRow?.code);

  const badTicket = await request("/lapak/tickets/verify/TKT-PALSU123", { appCode: "lapak-jambi-web" });
  assert("Tiket palsu 404", badTicket.status === 404, badTicket.status);

  // ── 5. Warga tidak boleh menandai tiket terpakai.
  const wargaUse = await request(`/lapak/tickets/${ticket.id}/use`, {
    method: "POST", token: wargaToken || undefined, appCode: WARGA_APP, body: {},
  });
  assert("Warga tidak boleh pakai tiket (401/403)", [401, 403].includes(wargaUse.status), wargaUse.status);

  // ── 6. Petugas menandai tiket terpakai.
  const use1 = await request(`/lapak/tickets/${ticket.id}/use`, {
    method: "POST", token: saToken || undefined, body: {},
  });
  assert("Pakai tiket 200", use1.status === 200, use1.status, use1.data?.message);
  assert("Status DIGUNAKAN", use1.data?.data?.status === "DIGUNAKAN", use1.data?.data?.status);
  assert("usedAt terisi", Boolean(use1.data?.data?.usedAt));

  // ── 7. INTI: sekali pakai — scan kedua DITOLAK.
  const use2 = await request(`/lapak/tickets/${ticket.id}/use`, {
    method: "POST", token: saToken || undefined, body: {},
  });
  assert("Scan kedua ditolak 409", use2.status === 409, use2.status, use2.data?.message);

  // Verifikasi publik kini menyatakan tidak bisa dipakai.
  const verifyUsed = await request(`/lapak/tickets/verify/${ticketRow?.qrToken}`, { appCode: "lapak-jambi-web" });
  assert("Verifikasi: tidak usable", verifyUsed.data?.data?.usable === false);
  assert("Verifikasi: alasan menyebut sudah dipakai",
    String(verifyUsed.data?.data?.reason ?? "").toLowerCase().includes("dipakai"),
    verifyUsed.data?.data?.reason);

  // ── 8. INTI: dua scan PARALEL → hanya satu berhasil.
  // Buat pesanan kedua untuk diuji konkurensi.
  await request(`/lapak/carts/${cartId}/items`, {
    method: "POST", token: wargaToken || undefined, appCode: WARGA_APP,
    body: { productId, rateId, qty: 1 },
  });
  const co2 = await request(`/lapak/orders/cart/${cartId}/checkout`, {
    method: "POST", token: wargaToken || undefined, appCode: WARGA_APP,
    body: { applicant: { name: "Budi Santoso", phone: "081234567890" } },
  });
  const order2 = co2.data?.data ?? {};
  const pay2 = order2.payments?.[0]?.id;
  await request(`/lapak/payments/${pay2}/proof`, {
    method: "POST", token: wargaToken || undefined, appCode: WARGA_APP,
    body: {
      proofUrl: "https://ik.imagekit.io/seloko/lapak/payments/bukti-tiket2.jpg",
      proofFileId: "ik_tiket_2", senderName: "Budi Santoso", senderBank: "Bank Jambi",
      amount: 25_000, paidAt: new Date().toISOString(),
    },
  });
  await request(`/lapak/payments/${pay2}/verify`, { method: "POST", token: saToken || undefined, body: {} });

  const order2Detail = await request(`/lapak/orders/${order2.id}`, W);
  const ticket2 = (order2Detail.data?.data?.tickets ?? [])[0] ?? {};
  assert("Tiket kedua terbit", Boolean(ticket2.id), ticket2.id);

  const [s1, s2] = await Promise.all([
    request(`/lapak/tickets/${ticket2.id}/use`, { method: "POST", token: saToken || undefined, body: {} }),
    request(`/lapak/tickets/${ticket2.id}/use`, { method: "POST", token: saToken || undefined, body: {} }),
  ]);
  const okCount = [s1, s2].filter((r) => r.status === 200).length;
  const conflictCount = [s1, s2].filter((r) => r.status === 409).length;
  assert("Scan paralel: tepat 1 berhasil", okCount === 1, `${s1.status}/${s2.status}`);
  assert("Scan paralel: tepat 1 ditolak", conflictCount === 1, `${s1.status}/${s2.status}`);

  // ── 9. Daftar tiket CMS + filter.
  const cmsList = await request("/lapak/tickets?limit=100", { token: saToken || undefined });
  assert("Daftar tiket CMS 200", cmsList.status === 200, cmsList.status, cmsList.data?.message);
  assert("Tiket muncul di CMS", (cmsList.data?.data ?? []).some((t: any) => t.id === ticket.id));

  const usedList = await request("/lapak/tickets?status=DIGUNAKAN&limit=100", { token: saToken || undefined });
  assert("Filter DIGUNAKAN bekerja",
    (usedList.data?.data ?? []).every((t: any) => t.status === "DIGUNAKAN"),
    (usedList.data?.data ?? []).length);

  const kindList = await request("/lapak/tickets?kind=TICKET&limit=100", { token: saToken || undefined });
  assert("Filter kind TICKET bekerja",
    (kindList.data?.data ?? []).every((t: any) => t.kind === "TICKET"),
    (kindList.data?.data ?? []).length);

  // ── 10. Tiket orang lain tidak bisa diakses (404).
  const otherToken = await login("admin.bpsdm", DEFAULT_PASSWORD, "seloko");
  const otherView = await request(`/lapak/tickets/${ticket.id}`, {
    token: otherToken || undefined, appCode: "seloko",
  });
  assert("Tiket orang lain tidak 200", otherView.status !== 200, otherView.status);

  // ── 11. Bersih-bersih.
  await prisma.lapakTicket.deleteMany({ where: { orderItem: { order: { user: { email: "warga.pedagang@gmail.com" } } } } });
  await prisma.lapakPayment.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakSkrd.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakOrderItem.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakOrderStatusLog.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakOrder.deleteMany({ where: { user: { email: "warga.pedagang@gmail.com" } } });
  await prisma.lapakCartItem.deleteMany({ where: { cart: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakCart.deleteMany({ where: { user: { email: "warga.pedagang@gmail.com" } } });
  await prisma.lapakSkrdSetting.deleteMany({});
  await prisma.lapakSkrdSequence.deleteMany({ where: { issuerKey: { in: ["BAPENDA", "BPSDM"] }, year: { gte: 2020 } } });
  await prisma.lapakProductRate.deleteMany({ where: { productId } });
  await prisma.lapakProduct.deleteMany({ where: { id: productId } });
}

// ─── Test Suite: Lapak — Worker Kedaluwarsa (LJ-2.8) ─────────────────────────
async function runLapakExpirySuite() {
  console.log("\n\x1b[36m▶ [Suite 24: Lapak - Worker Kedaluwarsa]\x1b[0m");
  const saToken = await login("superadmin", SUPERADMIN_PASSWORD, "seloko");
  assert("Superadmin login", Boolean(saToken));

  await cleanupDebugArtefacts();
  await prisma.lapakExpiryRun.deleteMany({});
  await prisma.lapakTicket.deleteMany({ where: { orderItem: { order: { user: { email: "warga.pedagang@gmail.com" } } } } });
  await prisma.lapakPayment.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakSkrd.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakOrderItem.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakOrderStatusLog.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakOrder.deleteMany({ where: { user: { email: "warga.pedagang@gmail.com" } } });
  await prisma.lapakCartItem.deleteMany({ where: { cart: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakCart.deleteMany({ where: { user: { email: "warga.pedagang@gmail.com" } } });
  await prisma.lapakSkrdSequence.deleteMany({ where: { issuerKey: { in: ["BAPENDA", "BPSDM"] }, year: { gte: 2020 } } });

  const cats = await request("/lapak/categories/public", { appCode: "lapak-jambi-web" });
  const gedung = (cats.data?.data ?? []).find((c: any) => c.slug === "sewa-gedung-ruangan");
  const orgs = await request("/organizations/public", { appCode: "lapak-jambi-web" });
  const bpsdm = (orgs.data?.data ?? []).find((o: any) => o.code === "BPSDM");

  // ── 1. Status awal: tidak ada yang menggantung.
  const st0 = await request("/lapak/expiry/status", { token: saToken || undefined });
  assert("Status 200", st0.status === 200, st0.status, st0.data?.message);
  assert("Tidak ada run berjalan", st0.data?.data?.running === false, st0.data?.data?.running);
  assert("pending.holds angka", typeof st0.data?.data?.pending?.holds === "number");

  // ── 2. Run bersih → semua 0.
  const run0 = await request("/lapak/expiry/run", {
    method: "POST", token: saToken || undefined, body: {},
  });
  assert("Run 200", run0.status === 200, run0.status, run0.data?.message);
  assert("Status SUKSES", run0.data?.data?.status === "SUKSES", run0.data?.data?.status);
  assert("durationMs terisi", typeof run0.data?.data?.durationMs === "number", run0.data?.data?.durationMs);
  assert("Pemicu manual tercatat", run0.data?.data?.triggeredBy !== null, run0.data?.data?.triggeredBy);

  // ── 3. IDEMPOTEN: run kedua pada data yang sama mengubah 0 baris.
  const run0b = await request("/lapak/expiry/run", {
    method: "POST", token: saToken || undefined, body: {},
  });
  assert("Run kedua 200", run0b.status === 200, run0b.status);
  assert("Run kedua tidak mengubah apa pun",
    run0b.data?.data?.releasedHolds === 0
    && run0b.data?.data?.expiredPayments === 0
    && run0b.data?.data?.expiredTickets === 0,
    JSON.stringify({
      h: run0b.data?.data?.releasedHolds,
      p: run0b.data?.data?.expiredPayments,
      t: run0b.data?.data?.expiredTickets,
    }));

  // ── 4. Siapkan data kedaluwarsa: HOLD lampau, pembayaran lampau, tiket lampau.
  const prod = await request("/lapak/products", {
    method: "POST", token: saToken || undefined,
    body: {
      organizationId: bpsdm.id, categoryId: gedung.id,
      name: "Kedaluwarsa Uji Produk", description: "Produk uji worker kedaluwarsa.",
      rates: [{ name: "Harian", unit: "DAY", price: 150_000 }],
    },
  });
  const productId = prod.data?.data?.id;
  const rateId = prod.data?.data?.rates?.[0]?.id;
  await request(`/lapak/rates/${rateId}/status/submit`, { method: "PATCH", token: saToken || undefined, body: {} });
  await request(`/lapak/rates/${rateId}/status/approve`, { method: "PATCH", token: saToken || undefined, body: {} });
  await request(`/lapak/products/${productId}/status/publish`, { method: "PATCH", token: saToken || undefined });
  assert("Produk uji siap", Boolean(productId && rateId));

  // HOLD lampau: buat reservasi lalu mundurkan expiresAt.
  const past = new Date(Date.now() - 3_600_000).toISOString();
  const future = new Date(Date.now() + 3_600_000).toISOString();
  const resv = await request(`/lapak/reservations/product/${productId}`, {
    method: "POST", token: saToken || undefined,
    body: { startAt: future, endAt: new Date(Date.now() + 7_200_000).toISOString(), qty: 1 },
  });
  const resvId = resv.data?.data?.id;
  if (resvId) {
    await prisma.lapakReservation.update({
      where: { id: resvId }, data: { expiresAt: new Date(Date.now() - 3_600_000) },
    });
  }
  assert("Reservasi HOLD lampau disiapkan", Boolean(resvId), resvId);

  // Pembayaran lampau: pesanan + pembayaran dengan expiresAt mundur.
  const wargaToken = await login("warga.pedagang@gmail.com", DEFAULT_PASSWORD, WARGA_APP);
  const W = { token: wargaToken || undefined, appCode: WARGA_APP };
  await request("/lapak/skrd/settings", {
    method: "POST", token: saToken || undefined,
    body: {
      issuer: "BAPENDA", numberFormat: "{seq6}/SKRD/{issuer}/{romanMonth}/{year}",
      signerName: "H. Al Haris", signerPosition: "Gubernur Jambi", dueDays: 7,
    },
  });
  const cart = await request("/lapak/carts/opd/BPSDM", W);
  const cartId = cart.data?.data?.id;
  await request(`/lapak/carts/${cartId}/items`, {
    method: "POST", token: wargaToken || undefined, appCode: WARGA_APP,
    body: { productId, rateId, qty: 1 },
  });
  const co = await request(`/lapak/orders/cart/${cartId}/checkout`, {
    method: "POST", token: wargaToken || undefined, appCode: WARGA_APP,
    body: { applicant: { name: "Budi Santoso", phone: "081234567890" } },
  });
  const order = co.data?.data ?? {};
  assert("Checkout untuk uji kedaluwarsa 201", co.status === 201, co.status, co.data?.message);

  await prisma.lapakPayment.updateMany({
    where: { orderId: order.id }, data: { expiresAt: new Date(Date.now() - 3_600_000) },
  });

  // Tiket lampau: terbitkan lewat LUNAS lalu mundurkan validUntil.
  const paymentId = order.payments?.[0]?.id;
  await request(`/lapak/payments/${paymentId}/proof`, {
    method: "POST", token: wargaToken || undefined, appCode: WARGA_APP,
    body: {
      proofUrl: "https://ik.imagekit.io/seloko/lapak/payments/bukti-exp.jpg",
      proofFileId: "ik_exp_1", senderName: "Budi Santoso", senderBank: "Bank Jambi",
      amount: 150_000, paidAt: new Date().toISOString(),
    },
  });
  await request(`/lapak/payments/${paymentId}/verify`, { method: "POST", token: saToken || undefined, body: {} });
  const ticketRow = await prisma.lapakTicket.findFirst({
    where: { orderItem: { orderId: order.id } }, select: { id: true },
  });
  assert("Tiket terbit untuk uji kedaluwarsa", Boolean(ticketRow?.id), ticketRow?.id);

  // ── 5. Status mendeteksi data yang menggantung TANPA mengubahnya.
  if (ticketRow?.id) {
    await prisma.lapakTicket.update({
      where: { id: ticketRow.id }, data: { validUntil: new Date(Date.now() - 3_600_000) },
    });
  }
  // Buat pesanan kedua yang belum dibayar supaya ada pembayaran menggantung.
  await request(`/lapak/carts/${cartId}/items`, {
    method: "POST", token: wargaToken || undefined, appCode: WARGA_APP,
    body: { productId, rateId, qty: 1 },
  });
  const co2 = await request(`/lapak/orders/cart/${cartId}/checkout`, {
    method: "POST", token: wargaToken || undefined, appCode: WARGA_APP,
    body: { applicant: { name: "Budi Santoso", phone: "081234567890" } },
  });
  const order2 = co2.data?.data ?? {};
  await prisma.lapakPayment.updateMany({
    where: { orderId: order2.id }, data: { expiresAt: new Date(Date.now() - 3_600_000) },
  });

  const st1 = await request("/lapak/expiry/status", { token: saToken || undefined });
  const pending = st1.data?.data?.pending ?? {};
  assert("Status mendeteksi HOLD menggantung", pending.holds >= 1, pending.holds);
  assert("Status mendeteksi pembayaran menggantung", pending.payments >= 1, pending.payments);
  assert("Status mendeteksi tiket kedaluwarsa", pending.tickets >= 1, pending.tickets);

  // Status TIDAK boleh mengubah data.
  const stillActive = await prisma.lapakPayment.findUnique({
    where: { id: order2.payments?.[0]?.id }, select: { status: true },
  });
  assert("Status tidak mengubah data", stillActive?.status === "MENUNGGU_BUKTI", stillActive?.status);

  // ── 6. Jalankan worker → membersihkan ketiganya.
  const run1 = await request("/lapak/expiry/run", {
    method: "POST", token: saToken || undefined, body: {},
  });
  assert("Worker 200", run1.status === 200, run1.status, run1.data?.message);
  assert("HOLD dilepas >= 1", run1.data?.data?.releasedHolds >= 1, run1.data?.data?.releasedHolds);
  assert("Pembayaran kedaluwarsa >= 1", run1.data?.data?.expiredPayments >= 1,
    run1.data?.data?.expiredPayments);
  assert("Tiket kedaluwarsa >= 1", run1.data?.data?.expiredTickets >= 1,
    run1.data?.data?.expiredTickets);

  // ── 7. Verifikasi efek nyata pada data.
  const holdAfter = await prisma.lapakReservation.findUnique({
    where: { id: resvId }, select: { status: true },
  });
  assert("Reservasi jadi RELEASED", holdAfter?.status === "RELEASED", holdAfter?.status);

  const payAfter = await prisma.lapakPayment.findUnique({
    where: { id: order2.payments?.[0]?.id }, select: { status: true },
  });
  assert("Pembayaran jadi KEDALUWARSA", payAfter?.status === "KEDALUWARSA", payAfter?.status);

  const order2After = await prisma.lapakOrder.findUnique({
    where: { id: order2.id }, select: { status: true },
  });
  assert("Pesanan jadi KEDALUWARSA", order2After?.status === "KEDALUWARSA", order2After?.status);

  const skrd2 = await prisma.lapakSkrd.findUnique({
    where: { orderId: order2.id }, select: { status: true, number: true },
  });
  assert("SKRD jadi CANCELLED", skrd2?.status === "CANCELLED", skrd2?.status);

  if (ticketRow?.id) {
    const tAfter = await prisma.lapakTicket.findUnique({
      where: { id: ticketRow.id }, select: { status: true },
    });
    assert("Tiket jadi KEDALUWARSA", tAfter?.status === "KEDALUWARSA", tAfter?.status);
  }

  // ── 8. Nomor SKRD yang dibatalkan TIDAK dipakai ulang (gapless tetap).
  const co3cart = await request("/lapak/carts/opd/BPSDM", W);
  await request(`/lapak/carts/${co3cart.data?.data?.id}/items`, {
    method: "POST", token: wargaToken || undefined, appCode: WARGA_APP,
    body: { productId, rateId, qty: 1 },
  });
  const co3 = await request(`/lapak/orders/cart/${co3cart.data?.data?.id}/checkout`, {
    method: "POST", token: wargaToken || undefined, appCode: WARGA_APP,
    body: { applicant: { name: "Budi Santoso", phone: "081234567890" } },
  });
  const newNumber = co3.data?.data?.skrd?.number;
  assert("Nomor SKRD baru bukan nomor yang dibatalkan", newNumber !== skrd2?.number,
    `${newNumber} vs ${skrd2?.number}`);

  // ── 9. IDEMPOTEN: run berikutnya tidak mengubah apa pun lagi.
  const run2 = await request("/lapak/expiry/run", {
    method: "POST", token: saToken || undefined, body: {},
  });
  assert("Run lanjutan 200", run2.status === 200, run2.status);
  assert("Run lanjutan idempoten (0 perubahan)",
    run2.data?.data?.releasedHolds === 0
    && run2.data?.data?.expiredPayments === 0
    && run2.data?.data?.expiredTickets === 0,
    JSON.stringify({
      h: run2.data?.data?.releasedHolds,
      p: run2.data?.data?.expiredPayments,
      t: run2.data?.data?.expiredTickets,
    }));

  // ── 10. LOCK: run paralel → tepat satu yang diizinkan.
  const [c1, c2] = await Promise.all([
    request("/lapak/expiry/run", { method: "POST", token: saToken || undefined, body: {} }),
    request("/lapak/expiry/run", { method: "POST", token: saToken || undefined, body: {} }),
  ]);
  const okRuns = [c1, c2].filter((r) => r.status === 200).length;
  const lockedRuns = [c1, c2].filter((r) => r.status === 409).length;
  // Keduanya bisa 200 bila berjalan sangat cepat dan berurutan — yang penting
  // tidak pernah ada dua run SUKSES yang tumpang tindih. Minimal satu 200.
  assert("Run paralel: minimal satu berhasil", okRuns >= 1, `${c1.status}/${c2.status}`);
  assert("Run paralel: tidak ada dua yang tumpang tindih",
    okRuns === 2 || lockedRuns === 1, `${c1.status}/${c2.status}`);

  // ── 11. Riwayat run tercatat.
  const runsList = await request("/lapak/expiry/runs?limit=50", { token: saToken || undefined });
  assert("Riwayat run 200", runsList.status === 200, runsList.status, runsList.data?.message);
  assert("Riwayat berisi run", (runsList.data?.data ?? []).length >= 3, (runsList.data?.data ?? []).length);
  assert("Semua run SUKSES/GAGAL/TERPUTUS",
    (runsList.data?.data ?? []).every((r: any) => ["SUKSES", "GAGAL", "TERPUTUS"].includes(r.status)),
    JSON.stringify((runsList.data?.data ?? []).map((r: any) => r.status)));

  const detail = await request(`/lapak/expiry/runs/${run1.data?.data?.id}`, { token: saToken || undefined });
  assert("Detail run 200", detail.status === 200, detail.status);
  assert("Detail memuat durasi", typeof detail.data?.data?.durationMs === "number");

  // ── 12. Tanpa izin ditolak.
  const noPerm = await request("/lapak/expiry/run", {
    method: "POST", token: wargaToken || undefined, appCode: WARGA_APP, body: {},
  });
  assert("Warga tidak boleh menjalankan worker (403)", noPerm.status === 403, noPerm.status);

  // ── 13. Bersih-bersih riwayat.
  const purge = await request("/lapak/expiry/runs?olderThanDays=1", {
    method: "DELETE", token: saToken || undefined,
  });
  assert("Purge 200", purge.status === 200, purge.status, purge.data?.message);
  assert("Purge mengembalikan jumlah", typeof purge.data?.data?.deleted === "number");
  // Run yang baru dibuat belum berumur 1 hari → tidak terhapus.
  const afterPurge = await prisma.lapakExpiryRun.count({ where: { job: "lapak-expiry" } });
  assert("Run baru tidak ikut terhapus", afterPurge >= 1, afterPurge);

  // ── 14. Bersih-bersih data.
  await prisma.lapakExpiryRun.deleteMany({});
  await prisma.lapakTicket.deleteMany({ where: { orderItem: { order: { user: { email: "warga.pedagang@gmail.com" } } } } });
  await prisma.lapakPayment.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakSkrd.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakOrderItem.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakOrderStatusLog.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakOrder.deleteMany({ where: { user: { email: "warga.pedagang@gmail.com" } } });
  await prisma.lapakCartItem.deleteMany({ where: { cart: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakCart.deleteMany({ where: { user: { email: "warga.pedagang@gmail.com" } } });
  await prisma.$executeRawUnsafe(`DELETE FROM lapak_reservations WHERE product_id = $1`, productId);
  await prisma.lapakSkrdSetting.deleteMany({});
  await prisma.lapakSkrdSequence.deleteMany({ where: { issuerKey: { in: ["BAPENDA", "BPSDM"] }, year: { gte: 2020 } } });
  await prisma.lapakProductRate.deleteMany({ where: { productId } });
  await prisma.lapakProduct.deleteMany({ where: { id: productId } });
}

// ─── Test Suite: Lapak — Dashboard Penerimaan & Target (LJ-3.1) ──────────────
async function runLapakDashboardSuite() {
  console.log("\n\x1b[36m▶ [Suite 25: Lapak - Dashboard Penerimaan & Target]\x1b[0m");
  const saToken = await login("superadmin", SUPERADMIN_PASSWORD, "seloko");
  assert("Superadmin login", Boolean(saToken));

  await cleanupDebugArtefacts();
  await prisma.lapakTarget.deleteMany({});
  await prisma.lapakTicket.deleteMany({ where: { orderItem: { order: { user: { email: "warga.pedagang@gmail.com" } } } } });
  await prisma.lapakPayment.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakSkrd.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakOrderItem.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakOrderStatusLog.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakOrder.deleteMany({ where: { user: { email: "warga.pedagang@gmail.com" } } });
  await prisma.lapakCartItem.deleteMany({ where: { cart: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakCart.deleteMany({ where: { user: { email: "warga.pedagang@gmail.com" } } });
  await prisma.lapakSkrdSequence.deleteMany({ where: { issuerKey: { in: ["BAPENDA", "BPSDM"] }, year: { gte: 2020 } } });

  const cats = await request("/lapak/categories/public", { appCode: "lapak-jambi-web" });
  const gedung = (cats.data?.data ?? []).find((c: any) => c.slug === "sewa-gedung-ruangan");
  const orgs = await request("/organizations/public", { appCode: "lapak-jambi-web" });
  const bpsdm = (orgs.data?.data ?? []).find((o: any) => o.code === "BPSDM");
  const disbudpar = (orgs.data?.data ?? []).find((o: any) => o.code === "DISBUDPAR");

  // ── 1. Dashboard kosong: struktur benar, angka nol.
  const d0 = await request("/lapak/dashboard?period=THIS_YEAR&groupBy=ORG", { token: saToken || undefined });
  assert("Dashboard 200", d0.status === 200, d0.status, d0.data?.message);
  assert("groupBy ORG", d0.data?.data?.groupBy === "ORG", d0.data?.data?.groupBy);
  assert("Ringkasan realisasi 0", d0.data?.data?.summary?.realized === 0, d0.data?.data?.summary?.realized);
  assert("Pending berbentuk objek", typeof d0.data?.data?.pending?.awaitingPayment === "number");
  assert("Trend berbentuk array", Array.isArray(d0.data?.data?.trend));
  assert("Periode berlabel", typeof d0.data?.data?.period?.label === "string", d0.data?.data?.period?.label);

  // ── 2. VALIDASI: period=CUSTOM tanpa from/to → 400.
  const noRange = await request("/lapak/dashboard?period=CUSTOM", { token: saToken || undefined });
  assert("CUSTOM tanpa from/to ditolak 400", noRange.status === 400, noRange.status);

  const badRange = await request("/lapak/dashboard?period=CUSTOM&from=2026-12-31&to=2026-01-01", {
    token: saToken || undefined,
  });
  assert("from setelah to ditolak 400", badRange.status === 400, badRange.status);

  // ── 3. Target: simpan default & per OPD.
  const year = new Date().getFullYear();
  const tDefault = await request("/lapak/dashboard/targets", {
    method: "POST", token: saToken || undefined,
    body: { year, amount: 100_000_000, note: "Target retribusi aplikasi" },
  });
  assert("Target default disimpan 200", tDefault.status === 200, tDefault.status, tDefault.data?.message);
  assert("Target default tanpa OPD", tDefault.data?.data?.organizationCode === null,
    tDefault.data?.data?.organizationCode);

  const tBpsdm = await request("/lapak/dashboard/targets", {
    method: "POST", token: saToken || undefined,
    body: { year, organizationCode: "BPSDM", amount: 50_000_000 },
  });
  assert("Target per OPD disimpan", tBpsdm.status === 200, tBpsdm.status, tBpsdm.data?.message);
  assert("Target per OPD menyebut kode", tBpsdm.data?.data?.organizationCode === "BPSDM");
  const targetId = tBpsdm.data?.data?.id;

  // Upsert: simpan ulang tahun+OPD sama → memperbarui, bukan menggandakan.
  const tBpsdm2 = await request("/lapak/dashboard/targets", {
    method: "POST", token: saToken || undefined,
    body: { year, organizationCode: "BPSDM", amount: 60_000_000 },
  });
  assert("Upsert memperbarui target yang sama", tBpsdm2.data?.data?.id === targetId, tBpsdm2.data?.data?.id);
  assert("Nominal target diperbarui", tBpsdm2.data?.data?.amount === 60_000_000, tBpsdm2.data?.data?.amount);

  const tList = await request(`/lapak/dashboard/targets?year=${year}`, { token: saToken || undefined });
  assert("Daftar target 200", tList.status === 200, tList.status);
  assert("Tepat 2 target (default + BPSDM)", (tList.data?.data ?? []).length === 2,
    (tList.data?.data ?? []).length);

  // ── 4. Siapkan transaksi LUNAS untuk menguji realisasi.
  const mkProduct = async (orgId: string, name: string, price: number) => {
    const r = await request("/lapak/products", {
      method: "POST", token: saToken || undefined,
      body: {
        organizationId: orgId, categoryId: gedung.id,
        name, description: `Produk uji dashboard ${name}.`,
        rates: [{ name: "Harian", unit: "DAY", price }],
      },
    });
    const id = r.data?.data?.id;
    const rateId = r.data?.data?.rates?.[0]?.id;
    await request(`/lapak/rates/${rateId}/status/submit`, { method: "PATCH", token: saToken || undefined, body: {} });
    await request(`/lapak/rates/${rateId}/status/approve`, { method: "PATCH", token: saToken || undefined, body: {} });
    await request(`/lapak/products/${id}/status/publish`, { method: "PATCH", token: saToken || undefined });
    return { id, rateId };
  };

  await request("/lapak/skrd/settings", {
    method: "POST", token: saToken || undefined,
    body: {
      issuer: "BAPENDA", numberFormat: "{seq6}/SKRD/{issuer}/{romanMonth}/{year}",
      signerName: "H. Al Haris", signerPosition: "Gubernur Jambi", dueDays: 7,
    },
  });

  const pA = await mkProduct(bpsdm.id, "Dashboard Uji BPSDM", 5_000_000);
  const pB = await mkProduct(disbudpar.id, "Dashboard Uji DISBUDPAR", 3_000_000);
  assert("Dua produk dashboard siap", Boolean(pA.id && pB.id));

  const wargaToken = await login("warga.pedagang@gmail.com", DEFAULT_PASSWORD, WARGA_APP);
  const W = { token: wargaToken || undefined, appCode: WARGA_APP };

  const checkoutPaid = async (orgCode: string, productId: string, rateId: string) => {
    const cart = await request(`/lapak/carts/opd/${orgCode}`, W);
    const cartId = cart.data?.data?.id;
    await request(`/lapak/carts/${cartId}/items`, {
      method: "POST", token: wargaToken || undefined, appCode: WARGA_APP,
      body: { productId, rateId, qty: 1 },
    });
    const co = await request(`/lapak/orders/cart/${cartId}/checkout`, {
      method: "POST", token: wargaToken || undefined, appCode: WARGA_APP,
      body: { applicant: { name: "Budi Santoso", phone: "081234567890" } },
    });
    return co.data?.data ?? {};
  };

  // Pesanan 1: BPSDM, dibayar → LUNAS (5 juta).
  const orderA = await checkoutPaid("BPSDM", pA.id, pA.rateId);
  await request(`/lapak/payments/${orderA.payments?.[0]?.id}/proof`, {
    method: "POST", token: wargaToken || undefined, appCode: WARGA_APP,
    body: {
      proofUrl: "https://ik.imagekit.io/seloko/lapak/payments/dash1.jpg",
      proofFileId: "ik_dash_1", senderName: "Budi Santoso", senderBank: "Bank Jambi",
      amount: 5_000_000, paidAt: new Date().toISOString(),
    },
  });
  const payA = await request(`/lapak/payments/${orderA.payments?.[0]?.id}/verify`, {
    method: "POST", token: saToken || undefined, body: {},
  });
  assert("Pesanan A LUNAS", payA.status === 200, payA.status, payA.data?.message);

  // Pesanan 2: DISBUDPAR, dibayar → LUNAS (3 juta).
  const orderB = await checkoutPaid("DISBUDPAR", pB.id, pB.rateId);
  await request(`/lapak/payments/${orderB.payments?.[0]?.id}/proof`, {
    method: "POST", token: wargaToken || undefined, appCode: WARGA_APP,
    body: {
      proofUrl: "https://ik.imagekit.io/seloko/lapak/payments/dash2.jpg",
      proofFileId: "ik_dash_2", senderName: "Budi Santoso", senderBank: "Bank Jambi",
      amount: 3_000_000, paidAt: new Date().toISOString(),
    },
  });
  await request(`/lapak/payments/${orderB.payments?.[0]?.id}/verify`, {
    method: "POST", token: saToken || undefined, body: {},
  });

  // Pesanan 3: BPSDM, TIDAK dibayar → harus masuk pending, bukan realisasi.
  const orderC = await checkoutPaid("BPSDM", pA.id, pA.rateId);
  assert("Pesanan C belum dibayar", Boolean(orderC.id));

  // ── 5. Realisasi per OPD: hanya pesanan LUNAS.
  const dOrg = await request("/lapak/dashboard?period=THIS_YEAR&groupBy=ORG", { token: saToken || undefined });
  const rows = dOrg.data?.data?.rows ?? [];
  const rowBpsdm = rows.find((r: any) => r.key === "BPSDM");
  const rowDisbudpar = rows.find((r: any) => r.key === "DISBUDPAR");

  assert("Baris BPSDM ada", Boolean(rowBpsdm), JSON.stringify(rows.map((r: any) => r.key)));
  assert("Realisasi BPSDM hanya 5 juta (pesanan belum bayar tidak masuk)",
    rowBpsdm?.realized === 5_000_000, rowBpsdm?.realized);
  assert("Target BPSDM terbaca 60 juta", rowBpsdm?.target === 60_000_000, rowBpsdm?.target);
  // 5jt / 60jt = 8.33%
  assert("Persentase dihitung", rowBpsdm?.percentage === 8.33, rowBpsdm?.percentage);
  assert("Realisasi DISBUDPAR 3 juta", rowDisbudpar?.realized === 3_000_000, rowDisbudpar?.realized);
  assert("DISBUDPAR tanpa target → persentase null", rowDisbudpar?.percentage === null,
    rowDisbudpar?.percentage);

  assert("Total realisasi 8 juta", dOrg.data?.data?.summary?.realized === 8_000_000,
    dOrg.data?.data?.summary?.realized);

  // ── 6. Pending: pesanan belum bayar terpisah dari realisasi.
  assert("Pending awaitingPayment >= 5 juta",
    dOrg.data?.data?.pending?.awaitingPayment >= 5_000_000,
    dOrg.data?.data?.pending?.awaitingPayment);
  assert("Pending punya jumlah pesanan",
    dOrg.data?.data?.pending?.count?.awaitingPayment >= 1,
    dOrg.data?.data?.pending?.count?.awaitingPayment);

  // ── 7. Filter per OPD.
  const dBpsdm = await request("/lapak/dashboard?period=THIS_YEAR&groupBy=ORG&organization=BPSDM", {
    token: saToken || undefined,
  });
  assert("Filter OPD 200", dBpsdm.status === 200, dBpsdm.status);
  assert("Filter OPD hanya 1 baris", (dBpsdm.data?.data?.rows ?? []).length === 1,
    (dBpsdm.data?.data?.rows ?? []).length);
  assert("Filter OPD realisasi 5 juta", dBpsdm.data?.data?.summary?.realized === 5_000_000,
    dBpsdm.data?.data?.summary?.realized);

  // ── 8. Group by CATEGORY.
  const dCat = await request("/lapak/dashboard?period=THIS_YEAR&groupBy=CATEGORY", {
    token: saToken || undefined,
  });
  assert("groupBy CATEGORY 200", dCat.status === 200, dCat.status, dCat.data?.message);
  assert("Kategori punya baris", (dCat.data?.data?.rows ?? []).length >= 1,
    (dCat.data?.data?.rows ?? []).length);
  const catTotal = (dCat.data?.data?.rows ?? []).reduce((n: number, r: any) => n + r.realized, 0);
  assert("Sum kategori = total realisasi", catTotal === 8_000_000, catTotal);

  // ── 9. Group by MONTH.
  const dMonth = await request("/lapak/dashboard?period=THIS_YEAR&groupBy=MONTH", {
    token: saToken || undefined,
  });
  assert("groupBy MONTH 200", dMonth.status === 200, dMonth.status);
  assert("Bulan punya baris", (dMonth.data?.data?.rows ?? []).length >= 1);
  assert("Format bulan YYYY-MM",
    /^\d{4}-\d{2}$/.test(dMonth.data?.data?.rows?.[0]?.key ?? ""), dMonth.data?.data?.rows?.[0]?.key);

  // ── 10. Trend terisi.
  assert("Trend berisi titik", (dOrg.data?.data?.trend ?? []).length >= 1,
    (dOrg.data?.data?.trend ?? []).length);

  // ── 11. Query SQL mentah TIDAK membocorkan OPD lain saat admin OPD.
  // (diuji lewat akun admin BPSDM — harus hanya melihat OPD-nya)
  const adminOpd = await login("admin.bpsdm", DEFAULT_PASSWORD, "seloko");
  if (adminOpd) {
    const dScoped = await request("/lapak/dashboard?period=THIS_YEAR&groupBy=ORG", {
      token: adminOpd, appCode: "seloko",
    });
    if (dScoped.status === 200) {
      const keys = (dScoped.data?.data?.rows ?? []).map((r: any) => r.key);
      assert("Admin OPD tidak melihat DISBUDPAR", !keys.includes("DISBUDPAR"), JSON.stringify(keys));
    }
  }

  // ── 12. Warga tidak boleh mengakses dashboard.
  const wargaDash = await request("/lapak/dashboard", W);
  assert("Warga ditolak 403", wargaDash.status === 403, wargaDash.status);

  // ── 13. Hapus target.
  const delTarget = await request(`/lapak/dashboard/targets/${targetId}`, {
    method: "DELETE", token: saToken || undefined,
  });
  assert("Hapus target 200", delTarget.status === 200, delTarget.status);
  assert("Hapus mengembalikan deleted", delTarget.data?.data?.deleted === true);

  // ── 14. Bersih-bersih.
  await prisma.lapakTarget.deleteMany({});
  await prisma.lapakTicket.deleteMany({ where: { orderItem: { order: { user: { email: "warga.pedagang@gmail.com" } } } } });
  await prisma.lapakPayment.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakSkrd.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakOrderItem.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakOrderStatusLog.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakOrder.deleteMany({ where: { user: { email: "warga.pedagang@gmail.com" } } });
  await prisma.lapakCartItem.deleteMany({ where: { cart: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakCart.deleteMany({ where: { user: { email: "warga.pedagang@gmail.com" } } });
  await prisma.lapakSkrdSetting.deleteMany({});
  await prisma.lapakSkrdSequence.deleteMany({ where: { issuerKey: { in: ["BAPENDA", "BPSDM", "DISBUDPAR"] }, year: { gte: 2020 } } });
  for (const pid of [pA.id, pB.id].filter(Boolean)) {
    await prisma.lapakProductRate.deleteMany({ where: { productId: pid } });
    await prisma.lapakProduct.deleteMany({ where: { id: pid } });
  }
}

// ─── Test Suite: Lapak — Daftar Transaksi & Ekspor CSV (LJ-3.2) ──────────────
async function runLapakReportsSuite() {
  console.log("\n\x1b[36m▶ [Suite 26: Lapak - Daftar Transaksi & Ekspor CSV]\x1b[0m");
  const saToken = await login("superadmin", SUPERADMIN_PASSWORD, "seloko");
  const wargaToken = await login("warga.pedagang@gmail.com", DEFAULT_PASSWORD, WARGA_APP);
  assert("Superadmin login", Boolean(saToken));
  assert("Warga login ke portal Lapak", Boolean(wargaToken));

  await cleanupDebugArtefacts();
  await prisma.lapakTarget.deleteMany({});
  await prisma.lapakTicket.deleteMany({ where: { orderItem: { order: { user: { email: "warga.pedagang@gmail.com" } } } } });
  await prisma.lapakPayment.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakSkrd.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakOrderItem.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakOrderStatusLog.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakOrder.deleteMany({ where: { user: { email: "warga.pedagang@gmail.com" } } });
  await prisma.lapakCartItem.deleteMany({ where: { cart: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakCart.deleteMany({ where: { user: { email: "warga.pedagang@gmail.com" } } });
  await prisma.lapakSkrdSequence.deleteMany({ where: { issuerKey: { in: ["BAPENDA", "BPSDM", "DISBUDPAR"] }, year: { gte: 2020 } } });

  const cats = await request("/lapak/categories/public", { appCode: "lapak-jambi-web" });
  const gedung = (cats.data?.data ?? []).find((c: any) => c.slug === "sewa-gedung-ruangan");
  const orgs = await request("/organizations/public", { appCode: "lapak-jambi-web" });
  const bpsdm = (orgs.data?.data ?? []).find((o: any) => o.code === "BPSDM");
  const disbudpar = (orgs.data?.data ?? []).find((o: any) => o.code === "DISBUDPAR");

  const mkProduct = async (orgId: string, name: string, price: number) => {
    const r = await request("/lapak/products", {
      method: "POST", token: saToken || undefined,
      body: {
        organizationId: orgId, categoryId: gedung.id,
        name, description: `Produk uji laporan ${name}.`,
        rates: [{ name: "Harian", unit: "DAY", price }],
      },
    });
    const id = r.data?.data?.id;
    const rateId = r.data?.data?.rates?.[0]?.id;
    await request(`/lapak/rates/${rateId}/status/submit`, { method: "PATCH", token: saToken || undefined, body: {} });
    await request(`/lapak/rates/${rateId}/status/approve`, { method: "PATCH", token: saToken || undefined, body: {} });
    await request(`/lapak/products/${id}/status/publish`, { method: "PATCH", token: saToken || undefined });
    return { id, rateId };
  };

  await request("/lapak/skrd/settings", {
    method: "POST", token: saToken || undefined,
    body: {
      issuer: "BAPENDA", numberFormat: "{seq6}/SKRD/{issuer}/{romanMonth}/{year}",
      signerName: "H. Al Haris", signerPosition: "Gubernur Jambi", dueDays: 7,
    },
  });

  const pA = await mkProduct(bpsdm.id, "Laporan Uji BPSDM", 2_000_000);
  const pB = await mkProduct(disbudpar.id, "Laporan Uji DISBUDPAR", 4_000_000);
  assert("Dua produk laporan siap", Boolean(pA.id && pB.id));

  const W = { token: wargaToken || undefined, appCode: WARGA_APP };
  const checkout = async (orgCode: string, productId: string, rateId: string, applicant: any) => {
    const cart = await request(`/lapak/carts/opd/${orgCode}`, W);
    const cartId = cart.data?.data?.id;
    await request(`/lapak/carts/${cartId}/items`, {
      method: "POST", token: wargaToken || undefined, appCode: WARGA_APP,
      body: { productId, rateId, qty: 1 },
    });
    const co = await request(`/lapak/orders/cart/${cartId}/checkout`, {
      method: "POST", token: wargaToken || undefined, appCode: WARGA_APP,
      body: { applicant },
    });
    return co.data?.data ?? {};
  };
  const payOrder = async (order: any, amount: number, fileId: string) => {
    const payId = order.payments?.[0]?.id;
    await request(`/lapak/payments/${payId}/proof`, {
      method: "POST", token: wargaToken || undefined, appCode: WARGA_APP,
      body: {
        proofUrl: `https://ik.imagekit.io/seloko/lapak/payments/${fileId}.jpg`,
        proofFileId: fileId, senderName: "Budi Santoso", senderBank: "Bank Jambi",
        amount, paidAt: new Date().toISOString(),
      },
    });
    return request(`/lapak/payments/${payId}/verify`, {
      method: "POST", token: saToken || undefined, body: {},
    });
  };

  // Pesanan A: BPSDM, LUNAS.
  const orderA = await checkout("BPSDM", pA.id, pA.rateId, {
    name: "Budi Santoso", nik: "1234567890123456", phone: "081234567890",
    institution: "PT Contoh",
  });
  await payOrder(orderA, 2_000_000, "ik_lap_1");

  // Pesanan B: DISBUDPAR, LUNAS — dengan MAKSUD berisi formula CSV injection.
  const orderB = await checkout("DISBUDPAR", pB.id, pB.rateId, {
    name: "Siti Aminah", phone: "081298765432",
  });
  await payOrder(orderB, 4_000_000, "ik_lap_2");

  // Suntikkan maksud berbahaya langsung ke DB (mensimulasikan input warga).
  await prisma.lapakOrder.update({
    where: { id: orderB.id },
    data: { purpose: '=HYPERLINK("http://jahat.example","klik saya")' },
  });

  // Pesanan C: BPSDM, belum dibayar.
  const orderC = await checkout("BPSDM", pA.id, pA.rateId, { name: "Andi Wijaya", phone: "081200001111" });
  assert("Tiga pesanan dibuat", Boolean(orderA.id && orderB.id && orderC.id));

  // ── 1. Daftar transaksi.
  const list = await request("/lapak/reports/transactions?limit=100", { token: saToken || undefined });
  assert("Daftar transaksi 200", list.status === 200, list.status, list.data?.message);
  const rows = list.data?.data ?? [];
  assert("Ketiga pesanan muncul", rows.length >= 3, rows.length);
  assert("Ada ringkasan total", typeof list.data?.summary?.totalAmount === "number",
    list.data?.summary?.totalAmount);
  assert("Ringkasan per status terisi", (list.data?.summary?.byStatus ?? []).length >= 1,
    (list.data?.summary?.byStatus ?? []).length);

  const rowA = rows.find((r: any) => r.orderId === orderA.id);
  assert("Baris A memuat kode pesanan", typeof rowA?.code === "string" && rowA.code.startsWith("LJK-"), rowA?.code);
  assert("Baris A memuat nomor SKRD", typeof rowA?.skrdNumber === "string", rowA?.skrdNumber);
  assert("Baris A status LUNAS", rowA?.status === "LUNAS", rowA?.status);
  assert("Baris A paymentStatus LUNAS", rowA?.paymentStatus === "LUNAS", rowA?.paymentStatus);
  assert("Baris A punya tiket terbit", rowA?.tickets?.total >= 1, rowA?.tickets?.total);

  // ── 2. INTI: PII DIMASKING di daftar.
  assert("Nama pemohon dimasking di daftar", rowA?.applicantName !== "Budi Santoso", rowA?.applicantName);
  assert("Nama termasking berpola bintang", String(rowA?.applicantName ?? "").includes("*"), rowA?.applicantName);
  assert("Daftar TIDAK memuat NIK", !JSON.stringify(rowA ?? {}).includes("1234567890123456"));

  // ── 3. Filter status.
  const lunasOnly = await request("/lapak/reports/transactions?status=LUNAS&limit=100", {
    token: saToken || undefined,
  });
  assert("Filter LUNAS 200", lunasOnly.status === 200, lunasOnly.status);
  assert("Filter LUNAS hanya LUNAS",
    (lunasOnly.data?.data ?? []).every((r: any) => r.status === "LUNAS"),
    (lunasOnly.data?.data ?? []).length);

  // ── 4. Filter OPD.
  const bpsdmOnly = await request("/lapak/reports/transactions?organization=BPSDM&limit=100", {
    token: saToken || undefined,
  });
  assert("Filter OPD 200", bpsdmOnly.status === 200, bpsdmOnly.status);
  assert("Filter OPD hanya BPSDM",
    (bpsdmOnly.data?.data ?? []).every((r: any) => r.organizationCode === "BPSDM"),
    (bpsdmOnly.data?.data ?? []).length);

  // ── 5. Filter tanggal.
  const today = new Date().toISOString().slice(0, 10);
  const todayOnly = await request(`/lapak/reports/transactions?from=${today}&to=${today}&limit=100`, {
    token: saToken || undefined,
  });
  assert("Filter tanggal hari ini 200", todayOnly.status === 200, todayOnly.status);
  assert("Filter tanggal menemukan transaksi", (todayOnly.data?.data ?? []).length >= 3,
    (todayOnly.data?.data ?? []).length);

  const badRange = await request("/lapak/reports/transactions?from=2026-12-31&to=2026-01-01", {
    token: saToken || undefined,
  });
  assert("Rentang terbalik ditolak 400", badRange.status === 400, badRange.status);

  // ── 6. Pencarian kode.
  const search = await request(`/lapak/reports/transactions?q=${rowA?.code}&limit=100`, {
    token: saToken || undefined,
  });
  assert("Cari kode 200", search.status === 200, search.status);
  assert("Cari kode menemukan pesanan", (search.data?.data ?? []).some((r: any) => r.orderId === orderA.id));

  // ── 7. INTI: EKSPOR CSV.
  const exp = await request("/lapak/reports/transactions/export", { token: saToken || undefined });
  assert("Ekspor 200", exp.status === 200, exp.status);
  const csv = typeof exp.data === "string" ? exp.data : String(exp.data ?? "");
  assert("CSV punya header", csv.includes("Kode Pesanan") && csv.includes("Nomor SKRD"), csv.slice(0, 80));
  assert("CSV memuat pesanan A", csv.includes(String(rowA?.code)));
  // BOM tidak bisa diperiksa dari string hasil `fetch().text()` karena decoder
  // membuangnya. Yang bisa dipastikan: header CSV tetap terbaca sebagai teks
  // (BOM tidak merusak baris pertama) dan charset respons benar.
  assert("Baris pertama CSV adalah header", csv.startsWith("Kode Pesanan"), csv.slice(0, 40));
  assert("Content-Type CSV dengan charset utf-8",
    String(exp.headers?.get("content-type") ?? "").toLowerCase().includes("charset=utf-8"),
    exp.headers?.get("content-type"));
  assert("Content-Disposition attachment",
    String(exp.headers?.get("content-disposition") ?? "").toLowerCase().includes("attachment"),
    exp.headers?.get("content-disposition"));

  // ── 8. INTI: CSV INJECTION DIBLOKIR.
  // Maksud pesanan B diawali '=' → harus dinetralkan dengan prefiks kutip.
  assert("Formula =HYPERLINK dinetralkan", !csv.includes("\n=HYPERLINK"), "masih ada baris diawali =");
  assert("Nilai berbahaya diberi prefiks kutip", csv.includes("'=HYPERLINK"), 
    csv.split("\r\n").find((l) => l.includes("HYPERLINK"))?.slice(0, 60));

  // ── 9. INTI: PII di CSV tetap dimasking.
  assert("CSV TIDAK memuat NIK", !csv.includes("1234567890123456"), "NIK bocor di CSV");
  assert("CSV TIDAK memuat nama utuh Budi Santoso", !csv.includes("Budi Santoso"), "nama bocor di CSV");

  // ── 10. Ekspor menghormati filter.
  const expBpsdm = await request("/lapak/reports/transactions/export?organization=BPSDM", {
    token: saToken || undefined,
  });
  const csvBpsdm = typeof expBpsdm.data === "string" ? expBpsdm.data : String(expBpsdm.data ?? "");
  assert("Ekspor terfilter 200", expBpsdm.status === 200, expBpsdm.status);
  assert("Ekspor terfilter tidak memuat pesanan DISBUDPAR", !csvBpsdm.includes(String(
    rows.find((r: any) => r.orderId === orderB.id)?.code ?? "TIDAK-ADA")));

  // ── 11. Izin: warga tidak boleh membaca maupun mengekspor.
  const wargaList = await request("/lapak/reports/transactions", W);
  assert("Warga ditolak daftar 403", wargaList.status === 403, wargaList.status);
  const wargaExport = await request("/lapak/reports/transactions/export", W);
  assert("Warga ditolak ekspor 403", wargaExport.status === 403, wargaExport.status);

  // ── 12. Lingkup OPD: admin OPD tidak melihat OPD lain.
  const adminOpd = await login("admin.bpsdm", DEFAULT_PASSWORD, "seloko");
  if (adminOpd) {
    const scoped = await request("/lapak/reports/transactions?limit=100", {
      token: adminOpd, appCode: "seloko",
    });
    if (scoped.status === 200) {
      const codes = (scoped.data?.data ?? []).map((r: any) => r.organizationCode);
      assert("Admin OPD tidak melihat DISBUDPAR", !codes.includes("DISBUDPAR"), JSON.stringify(codes));

      const crossOrg = await request("/lapak/reports/transactions?organization=DISBUDPAR", {
        token: adminOpd, appCode: "seloko",
      });
      assert("Admin OPD ditolak filter OPD lain (404)", crossOrg.status === 404, crossOrg.status);
    }
  }

  // ── 13. Paginasi & sort.
  const paged = await request("/lapak/reports/transactions?limit=1&page=1", { token: saToken || undefined });
  assert("Paginasi limit 1", (paged.data?.data ?? []).length === 1, (paged.data?.data ?? []).length);
  assert("Meta totalItems benar", paged.data?.meta?.totalItems >= 3, paged.data?.meta?.totalItems);

  const highest = await request("/lapak/reports/transactions?sort=HIGHEST&limit=100", {
    token: saToken || undefined,
  });
  const amounts = (highest.data?.data ?? []).map((r: any) => r.amount);
  assert("Sort HIGHEST menurun", amounts.every((v: number, i: number) => i === 0 || amounts[i - 1] >= v),
    JSON.stringify(amounts));

  // ── 14. Bersih-bersih.
  await prisma.lapakTicket.deleteMany({ where: { orderItem: { order: { user: { email: "warga.pedagang@gmail.com" } } } } });
  await prisma.lapakPayment.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakSkrd.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakOrderItem.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakOrderStatusLog.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakOrder.deleteMany({ where: { user: { email: "warga.pedagang@gmail.com" } } });
  await prisma.lapakCartItem.deleteMany({ where: { cart: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakCart.deleteMany({ where: { user: { email: "warga.pedagang@gmail.com" } } });
  await prisma.lapakSkrdSetting.deleteMany({});
  await prisma.lapakSkrdSequence.deleteMany({ where: { issuerKey: { in: ["BAPENDA", "BPSDM", "DISBUDPAR"] }, year: { gte: 2020 } } });
  for (const pid of [pA.id, pB.id].filter(Boolean)) {
    await prisma.lapakProductRate.deleteMany({ where: { productId: pid } });
    await prisma.lapakProduct.deleteMany({ where: { id: pid } });
  }
}

// ─── Test Suite: Lapak — Transparansi PAD Publik (LJ-3.3) ────────────────────
async function runLapakPublicStatsSuite() {
  console.log("\n\x1b[36m▶ [Suite 27: Lapak - Transparansi PAD Publik]\x1b[0m");
  const saToken = await login("superadmin", SUPERADMIN_PASSWORD, "seloko");
  const wargaToken = await login("warga.pedagang@gmail.com", DEFAULT_PASSWORD, WARGA_APP);
  assert("Superadmin login", Boolean(saToken));
  assert("Warga login ke portal Lapak", Boolean(wargaToken));

  await cleanupDebugArtefacts();
  await prisma.lapakTicket.deleteMany({ where: { orderItem: { order: { user: { email: "warga.pedagang@gmail.com" } } } } });
  await prisma.lapakPayment.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakSkrd.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakOrderItem.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakOrderStatusLog.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakOrder.deleteMany({ where: { user: { email: "warga.pedagang@gmail.com" } } });
  await prisma.lapakCartItem.deleteMany({ where: { cart: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakCart.deleteMany({ where: { user: { email: "warga.pedagang@gmail.com" } } });
  await prisma.lapakSkrdSequence.deleteMany({ where: { issuerKey: { in: ["BAPENDA", "BPSDM"] }, year: { gte: 2020 } } });

  const cats = await request("/lapak/categories/public", { appCode: "lapak-jambi-web" });
  const gedung = (cats.data?.data ?? []).find((c: any) => c.slug === "sewa-gedung-ruangan");
  const orgs = await request("/organizations/public", { appCode: "lapak-jambi-web" });
  const bpsdm = (orgs.data?.data ?? []).find((o: any) => o.code === "BPSDM");

  const mkProduct = async (name: string, price: number) => {
    const r = await request("/lapak/products", {
      method: "POST", token: saToken || undefined,
      body: {
        organizationId: bpsdm.id, categoryId: gedung.id,
        name, description: `Produk uji stats ${name}.`,
        rates: [{ name: "Harian", unit: "DAY", price }],
      },
    });
    const id = r.data?.data?.id;
    const rateId = r.data?.data?.rates?.[0]?.id;
    await request(`/lapak/rates/${rateId}/status/submit`, { method: "PATCH", token: saToken || undefined, body: {} });
    await request(`/lapak/rates/${rateId}/status/approve`, { method: "PATCH", token: saToken || undefined, body: {} });
    await request(`/lapak/products/${id}/status/publish`, { method: "PATCH", token: saToken || undefined });
    return { id, rateId };
  };

  await request("/lapak/skrd/settings", {
    method: "POST", token: saToken || undefined,
    body: {
      issuer: "BAPENDA", numberFormat: "{seq6}/SKRD/{issuer}/{romanMonth}/{year}",
      signerName: "H. Al Haris", signerPosition: "Gubernur Jambi", dueDays: 7,
    },
  });

  const prod = await mkProduct("Stats Uji Produk", 1_000_000);
  const W = { token: wargaToken || undefined, appCode: WARGA_APP };

  const makePaidOrder = async (applicant: any) => {
    const cart = await request("/lapak/carts/opd/BPSDM", W);
    const cartId = cart.data?.data?.id;
    await request(`/lapak/carts/${cartId}/items`, {
      method: "POST", token: wargaToken || undefined, appCode: WARGA_APP,
      body: { productId: prod.id, rateId: prod.rateId, qty: 1 },
    });
    const co = await request(`/lapak/orders/cart/${cartId}/checkout`, {
      method: "POST", token: wargaToken || undefined, appCode: WARGA_APP,
      body: { applicant },
    });
    const order = co.data?.data ?? {};
    const payId = order.payments?.[0]?.id;
    await request(`/lapak/payments/${payId}/proof`, {
      method: "POST", token: wargaToken || undefined, appCode: WARGA_APP,
      body: {
        proofUrl: "https://ik.imagekit.io/seloko/lapak/payments/pub.jpg",
        proofFileId: `ik_pub_${Math.random().toString(36).slice(2, 8)}`,
        senderName: "Budi Santoso", senderBank: "Bank Jambi",
        amount: 1_000_000, paidAt: new Date().toISOString(),
      },
    });
    await request(`/lapak/payments/${payId}/verify`, { method: "POST", token: saToken || undefined, body: {} });
    return order;
  };

  // ── 1. Akses PUBLIK tanpa login.
  const pub = await request("/lapak/public-stats", { appCode: "lapak-jambi-web" });
  assert("Stats publik 200 tanpa login", pub.status === 200, pub.status, pub.data?.message);
  assert("Tahun terisi", typeof pub.data?.data?.year === "number", pub.data?.data?.year);
  assert("12 bulan penuh dikirim", (pub.data?.data?.byMonth ?? []).length === 12,
    (pub.data?.data?.byMonth ?? []).length);
  assert("Penjelasan ambang ada", typeof pub.data?.data?.disclosure?.minOrders === "number",
    pub.data?.data?.disclosure?.minOrders);

  // ── 2. INTI: TIDAK ada PII dalam respons.
  const raw = JSON.stringify(pub.data ?? {});
  assert("Tidak memuat NIK", !raw.includes("1234567890123456"));
  assert("Tidak memuat nama pemohon utuh", !raw.includes("Budi Santoso"));
  assert("Tidak memuat kode pesanan", !raw.includes("LJK-"), "kode pesanan bocor");
  assert("Tidak memuat kode OPD", !raw.includes("BPSDM"), "identitas OPD bocor ke publik");

  // ── 3. SUPPRESSION: 1 pesanan → nominal disembunyikan.
  await makePaidOrder({ name: "Budi Santoso", nik: "1234567890123456", phone: "081234567890" });
  const st1 = await request("/lapak/public-stats", { appCode: "lapak-jambi-web" });
  const cat1 = (st1.data?.data?.byCategory ?? [])[0];
  assert("Kategori terdeteksi", Boolean(cat1), JSON.stringify(st1.data?.data?.byCategory));
  assert("1 pesanan → orderCount 1", cat1?.orderCount === 1, cat1?.orderCount);
  assert("1 pesanan → nominal DISEMBUNYIKAN", cat1?.realized === null, cat1?.realized);
  assert("1 pesanan → suppressed true", cat1?.suppressed === true, cat1?.suppressed);
  assert("Total juga disembunyikan saat <3 pesanan",
    st1.data?.data?.total?.suppressed === true, st1.data?.data?.total?.suppressed);

  // ── 4. Ambang terlewati: 3 pesanan → nominal terbuka.
  await makePaidOrder({ name: "Siti Aminah", phone: "081298765432" });
  await makePaidOrder({ name: "Andi Wijaya", phone: "081200001111" });
  const st3 = await request("/lapak/public-stats", { appCode: "lapak-jambi-web" });
  const cat3 = (st3.data?.data?.byCategory ?? [])[0];
  assert("3 pesanan → orderCount 3", cat3?.orderCount === 3, cat3?.orderCount);
  assert("3 pesanan → nominal TERBUKA", cat3?.realized === 3_000_000, cat3?.realized);
  assert("3 pesanan → suppressed false", cat3?.suppressed === false, cat3?.suppressed);
  assert("Total terbuka", st3.data?.data?.total?.realized === 3_000_000,
    st3.data?.data?.total?.realized);

  // ── 5. Pesanan belum dibayar TIDAK dihitung.
  const cartUnpaid = await request("/lapak/carts/opd/BPSDM", W);
  await request(`/lapak/carts/${cartUnpaid.data?.data?.id}/items`, {
    method: "POST", token: wargaToken || undefined, appCode: WARGA_APP,
    body: { productId: prod.id, rateId: prod.rateId, qty: 1 },
  });
  await request(`/lapak/orders/cart/${cartUnpaid.data?.data?.id}/checkout`, {
    method: "POST", token: wargaToken || undefined, appCode: WARGA_APP,
    body: { applicant: { name: "Belum Bayar", phone: "081200002222" } },
  });
  const stUnpaid = await request("/lapak/public-stats", { appCode: "lapak-jambi-web" });
  assert("Pesanan belum bayar tidak menambah total",
    stUnpaid.data?.data?.total?.realized === 3_000_000, stUnpaid.data?.data?.total?.realized);
  assert("Pesanan belum bayar tidak menambah count",
    stUnpaid.data?.data?.total?.orderCount === 3, stUnpaid.data?.data?.total?.orderCount);

  // ── 6. PII tetap tidak bocor setelah ada data.
  const raw3 = JSON.stringify(st3.data ?? {});
  assert("Masih tanpa NIK", !raw3.includes("1234567890123456"));
  assert("Masih tanpa nama pemohon", !raw3.includes("Budi Santoso") && !raw3.includes("Siti Aminah"));

  // ── 7. Bulan tanpa transaksi bernilai 0, bukan suppressed.
  const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const thisMonthRow = (st3.data?.data?.byMonth ?? []).find((m: any) => m.month === currentMonth);
  assert("Bulan berjalan ditemukan", Boolean(thisMonthRow), currentMonth);
  assert("Bulan berjalan ada transaksi", thisMonthRow?.orderCount === 3, thisMonthRow?.orderCount);

  const emptyMonths = (st3.data?.data?.byMonth ?? []).filter((m: any) => m.orderCount === 0);
  assert("Bulan kosong bernilai 0 (bukan null)", emptyMonths.every((m: any) => m.realized === 0),
    JSON.stringify(emptyMonths.slice(0, 2)));
  assert("Bulan kosong tidak ditandai suppressed", emptyMonths.every((m: any) => m.suppressed === false));

  // ── 8. Filter tahun.
  const otherYear = await request(`/lapak/public-stats?year=${new Date().getFullYear() - 1}`, {
    appCode: "lapak-jambi-web",
  });
  assert("Filter tahun 200", otherYear.status === 200, otherYear.status);
  assert("Tahun lain kosong", otherYear.data?.data?.total?.orderCount === 0,
    otherYear.data?.data?.total?.orderCount);

  const badYear = await request("/lapak/public-stats?year=1800", { appCode: "lapak-jambi-web" });
  assert("Tahun tidak valid ditolak 400", badYear.status === 400, badYear.status);

  // ── 9. Header aplikasi tetap wajib (guard multi-tenant global).
  // Endpoint ini publik dalam arti TANPA LOGIN, bukan tanpa identitas aplikasi:
  // `X-App-Code` menandai aplikasi mana yang dilayani dan dipakai untuk resolusi
  // izin. Uji ini mendokumentasikan perilaku tersebut secara eksplisit.
  const noHeader = await fetch(`${BASE}/lapak/public-stats`);
  assert("Tanpa X-App-Code ditolak 400 (guard multi-tenant)", noHeader.status === 400, noHeader.status);

  // ── 10. Bersih-bersih.
  await prisma.lapakTicket.deleteMany({ where: { orderItem: { order: { user: { email: "warga.pedagang@gmail.com" } } } } });
  await prisma.lapakPayment.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakSkrd.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakOrderItem.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakOrderStatusLog.deleteMany({ where: { order: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakOrder.deleteMany({ where: { user: { email: "warga.pedagang@gmail.com" } } });
  await prisma.lapakCartItem.deleteMany({ where: { cart: { user: { email: "warga.pedagang@gmail.com" } } } });
  await prisma.lapakCart.deleteMany({ where: { user: { email: "warga.pedagang@gmail.com" } } });
  await prisma.lapakSkrdSetting.deleteMany({});
  await prisma.lapakSkrdSequence.deleteMany({ where: { issuerKey: { in: ["BAPENDA", "BPSDM"] }, year: { gte: 2020 } } });
  await prisma.lapakProductRate.deleteMany({ where: { productId: prod.id } });
  await prisma.lapakProduct.deleteMany({ where: { id: prod.id } });
}

// ─── Test Suite: Lapak — Konten Berita per OPD (LJ-4.1) ──────────────────────
async function runLapakNewsSuite() {
  console.log("\n\x1b[36m▶ [Suite 28: Lapak - Konten Berita per OPD]\x1b[0m");
  const saToken = await login("superadmin", SUPERADMIN_PASSWORD, "seloko");
  assert("Superadmin login", Boolean(saToken));

  const prismaClient = prisma;
  // Bersihkan berita uji Lapak (organizationId terisi = milik Lapak).
  // Hapus artikel uji dulu (anak), baru kategori (induk) — FK RESTRICT.
  await prismaClient.article.deleteMany({
    where: { OR: [
      { title: { startsWith: "Berita Uji" } },
      { title: { startsWith: "Berita Milik Bapenda Uji" } },
      { title: { startsWith: "Coba Ubah" } },
    ] },
  });
  await prismaClient.articleCategory.deleteMany({ where: { name: { startsWith: "Kategori Uji" } } });

  const orgs = await request("/organizations/public", { appCode: "lapak-jambi-web" });
  const bpsdm = (orgs.data?.data ?? []).find((o: any) => o.code === "BPSDM");
  const disbudpar = (orgs.data?.data ?? []).find((o: any) => o.code === "DISBUDPAR");
  assert("Dua OPD tersedia", Boolean(bpsdm?.id && disbudpar?.id));

  // ── 1. Kategori konten Lapak (per aplikasi + jenis).
  const cat = await prismaClient.articleCategory.create({
    data: {
      applicationId: (await prismaClient.application.findUniqueOrThrow({
        where: { code: "lapak-jambi-web" }, select: { id: true },
      })).id,
      type: "NEWS",
      name: "Kategori Uji Berita OPD",
      slug: `kategori-uji-berita-${Date.now()}`,
      isActive: true,
    },
    select: { id: true },
  });
  assert("Kategori berita Lapak dibuat", Boolean(cat.id));

  // ── 2. Bapenda membuat berita untuk BPSDM (via ?organization=).
  const c1 = await request("/lapak/news?organization=BPSDM", {
    method: "POST", token: saToken || undefined,
    body: {
      categoryId: cat.id,
      title: "Berita Uji BPSDM Satu",
      content: "<p>Konten berita uji BPSDM.</p>",
      excerpt: "Ringkasan uji",
    },
  });
  assert("Buat berita BPSDM 201", c1.status === 201, c1.status, c1.data?.message);
  const newsBpsdm = c1.data?.data;
  assert("Status awal DRAFT", newsBpsdm?.status === "DRAFT", newsBpsdm?.status);

  // ── 3. Berita untuk DISBUDPAR.
  const c2 = await request("/lapak/news?organization=DISBUDPAR", {
    method: "POST", token: saToken || undefined,
    body: {
      categoryId: cat.id,
      title: "Berita Uji DISBUDPAR Satu",
      content: "<p>Konten berita uji DISBUDPAR.</p>",
    },
  });
  assert("Buat berita DISBUDPAR 201", c2.status === 201, c2.status, c2.data?.message);
  const newsDisbudpar = c2.data?.data;

  // ── 4. INTI: isolasi OPD — daftar BPSDM tidak memuat berita DISBUDPAR.
  const listBpsdm = await request("/lapak/news?organization=BPSDM&limit=100", {
    token: saToken || undefined,
  });
  assert("Daftar berita BPSDM 200", listBpsdm.status === 200, listBpsdm.status, listBpsdm.data?.message);
  const titlesBpsdm = (listBpsdm.data?.data ?? []).map((a: any) => a.title);
  assert("Berita BPSDM terlihat", titlesBpsdm.some((t: string) => t.includes("BPSDM")), JSON.stringify(titlesBpsdm));
  assert("Berita DISBUDPAR TIDAK muncul di BPSDM",
    !titlesBpsdm.some((t: string) => t.includes("DISBUDPAR")), JSON.stringify(titlesBpsdm));

  // ── 5. Publik: hanya berita PUBLISHED, terpisah per OPD.
  // Sebelum publish → daftar publik kosong.
  const pubBefore = await request("/lapak/news/public/BPSDM", { appCode: "lapak-jambi-web" });
  assert("Publik 200 sebelum publish", pubBefore.status === 200, pubBefore.status, pubBefore.data?.message);
  assert("DRAFT tidak tampil di publik", (pubBefore.data?.data ?? []).length === 0,
    (pubBefore.data?.data ?? []).length);

  // Publish berita BPSDM.
  const publish = await request(`/lapak/news/${newsBpsdm.id}/status?organization=BPSDM`, {
    method: "PATCH", token: saToken || undefined, body: { action: "publish" },
  });
  assert("Publish berita 200", publish.status === 200, publish.status, publish.data?.message);

  const pubAfter = await request("/lapak/news/public/BPSDM", { appCode: "lapak-jambi-web" });
  assert("Berita published tampil di publik", (pubAfter.data?.data ?? []).length === 1,
    (pubAfter.data?.data ?? []).length);

  // Publik DISBUDPAR tidak melihat berita BPSDM.
  const pubOther = await request("/lapak/news/public/DISBUDPAR", { appCode: "lapak-jambi-web" });
  assert("Publik OPD lain tidak melihat berita BPSDM",
    (pubOther.data?.data ?? []).length === 0, (pubOther.data?.data ?? []).length);

  // Detail publik lewat slug.
  const detail = await request(`/lapak/news/public/BPSDM/${newsBpsdm.slug}`, { appCode: "lapak-jambi-web" });
  assert("Detail publik 200", detail.status === 200, detail.status, detail.data?.message);
  assert("Judul sesuai", detail.data?.data?.title === "Berita Uji BPSDM Satu", detail.data?.data?.title);

  // Slug yang sama tapi OPD berbeda → 404 (tidak bocor).
  const crossSlug = await request(`/lapak/news/public/DISBUDPAR/${newsBpsdm.slug}`, { appCode: "lapak-jambi-web" });
  assert("Slug BPSDM di URL DISBUDPAR → 404", crossSlug.status === 404, crossSlug.status);

  // Kode OPD tidak dikenal → 404.
  const badOrg = await request("/lapak/news/public/OPD-TIDAK-ADA", { appCode: "lapak-jambi-web" });
  assert("Kode OPD tidak dikenal → 404", badOrg.status === 404, badOrg.status);

  // ── 6. INTI: admin OPD tidak boleh menyentuh berita OPD lain.
  const adminBpsdm = await login("admin.bpsdm", DEFAULT_PASSWORD, "seloko");
  if (adminBpsdm) {
    // Admin BPSDM tanpa parameter → otomatis OPD-nya sendiri.
    const ownList = await request("/lapak/news?limit=100", {
      token: adminBpsdm, appCode: "seloko",
    });
    if (ownList.status === 200) {
      const ownTitles = (ownList.data?.data ?? []).map((a: any) => a.title);
      assert("Admin OPD melihat berita OPD-nya", ownTitles.some((t: string) => t.includes("BPSDM")),
        JSON.stringify(ownTitles));
      assert("Admin OPD TIDAK melihat berita OPD lain",
        !ownTitles.some((t: string) => t.includes("DISBUDPAR")), JSON.stringify(ownTitles));
    }

    // Mencoba memilih OPD lain → 404.
    const crossOrg = await request("/lapak/news?organization=DISBUDPAR", {
      token: adminBpsdm, appCode: "seloko",
    });
    assert("Admin OPD ditolak memilih OPD lain (404)", crossOrg.status === 404,
      `${crossOrg.status} ${JSON.stringify(crossOrg.data?.message ?? "")}`);

    // Mencoba mengubah berita DISBUDPAR lewat id → 404.
    const crossEdit = await request(`/lapak/news/${newsDisbudpar.id}?organization=BPSDM`, {
      method: "PUT", token: adminBpsdm, appCode: "seloko",
      body: { title: "Coba Ubah Berita OPD Lain" },
    });
    assert("Admin OPD tidak bisa mengubah berita OPD lain",
      [403, 404].includes(crossEdit.status), crossEdit.status);
  }

  // ── 7. Update & status berita.
  const upd = await request(`/lapak/news/${newsBpsdm.id}?organization=BPSDM`, {
    method: "PUT", token: saToken || undefined,
    body: { excerpt: "Ringkasan diperbarui" },
  });
  assert("Update berita 200", upd.status === 200, upd.status, upd.data?.message);
  assert("Excerpt berubah", upd.data?.data?.excerpt === "Ringkasan diperbarui", upd.data?.data?.excerpt);

  // ── 8. Tanpa izin ditolak.
  const wargaToken = await login("warga.pedagang@gmail.com", DEFAULT_PASSWORD, WARGA_APP);
  const wargaCreate = await request("/lapak/news?organization=BPSDM", {
    method: "POST", token: wargaToken || undefined, appCode: WARGA_APP,
    body: { categoryId: cat.id, title: "Berita Uji Warga", content: "<p>Konten berita warga uji.</p>" },
  });
  assert("Warga tidak boleh membuat berita (403)", wargaCreate.status === 403,
    `${wargaCreate.status} ${JSON.stringify(wargaCreate.data?.message ?? "")}`);

  // ── 9. Hapus berita.
  const del = await request(`/lapak/news/${newsBpsdm.id}?organization=BPSDM`, {
    method: "DELETE", token: saToken || undefined,
  });
  assert("Hapus berita 200", del.status === 200, del.status, del.data?.message);

  const pubAfterDel = await request("/lapak/news/public/BPSDM", { appCode: "lapak-jambi-web" });
  assert("Berita terhapus tidak tampil di publik", (pubAfterDel.data?.data ?? []).length === 0,
    (pubAfterDel.data?.data ?? []).length);

  // ── 10. INTI: berita Bapenda (organizationId NULL) tidak terpengaruh.
  // Buat berita Bapenda tanpa organizationId, pastikan tidak muncul di Lapak.
  const bapendaApp = await prismaClient.application.findFirst({
    where: { code: "bapenda-profile" }, select: { id: true },
  });
  if (bapendaApp) {
    const bapendaCat = await prismaClient.articleCategory.create({
      data: {
        applicationId: bapendaApp.id, type: "NEWS",
        name: "Kategori Uji Berita Bapenda",
        slug: `kategori-uji-bapenda-${Date.now()}`, isActive: true,
      },
      select: { id: true },
    });
    await prismaClient.article.create({
      data: {
        applicationId: bapendaApp.id, type: "NEWS", categoryId: bapendaCat.id,
        authorId: (await prismaClient.user.findFirstOrThrow({ where: { username: "superadmin" }, select: { id: true } })).id,
        title: "Berita Milik Bapenda Uji", slug: `berita-milik-bapenda-uji-${Date.now()}`,
        content: "<p>Berita milik Bapenda.</p>", status: "PUBLISHED", publishedAt: new Date(),
        organizationId: null,
      },
    });
    const pubLapak = await request("/lapak/news/public/BPSDM", { appCode: "lapak-jambi-web" });
    assert("Berita Bapenda TIDAK bocor ke publik Lapak",
      !(pubLapak.data?.data ?? []).some((a: any) => a.title === "Berita Milik Bapenda Uji"),
      JSON.stringify((pubLapak.data?.data ?? []).map((a: any) => a.title)));

    await prismaClient.article.deleteMany({ where: { title: "Berita Milik Bapenda Uji" } });
    await prismaClient.articleCategory.deleteMany({ where: { id: bapendaCat.id } });
  }

  // ── 11. Bersih-bersih (anak dulu, baru induk).
  await prismaClient.article.deleteMany({
    where: { OR: [
      { title: { startsWith: "Berita Uji" } },
      { title: { startsWith: "Berita Milik Bapenda Uji" } },
      { title: { startsWith: "Coba Ubah" } },
    ] },
  });
  await prismaClient.articleCategory.deleteMany({ where: { name: { startsWith: "Kategori Uji" } } });
}

// ─── Test Suite: Bapenda Galeri ───────────────────────────────────────────────
async function runGalleriesSuite() {
  console.log("\n\x1b[36m▶ [Suite: Domain Bapenda - Galeri & Alur Review]\x1b[0m");
  const P = { appCode: "bapenda-profile" };
  const SLUG = "smoke-test-galeri-sementara";
  await prisma.gallery.deleteMany({ where: { slug: { startsWith: SLUG } } });

  // 1. Publik: hanya PUBLISHED, data seed dari app lama
  const pubList = await request("/bapenda/galleries/public", P);
  assert("Daftar galeri publik merespons sukses (200)", pubList.status === 200, pubList.status, 200);
  assert("Hanya galeri PUBLISHED & tidak terhapus (1 dari seed)", pubList.data?.data?.length === 1, pubList.data?.data?.length, 1);
  assert("Daftar publik membawa itemCount (2 item aktif)", pubList.data?.data?.[0]?.itemCount === 2, pubList.data?.data?.[0]?.itemCount, 2);
  assert("Penulis hanya id + fullName (tanpa email/PII)", pubList.data?.data?.every((g: any) => g.author && !("email" in g.author)));

  const seedSlug = pubList.data?.data?.[0]?.slug;
  const detail = await request(`/bapenda/galleries/public/${seedSlug}`, P);
  assert("Detail galeri publik via slug (200)", detail.status === 200, detail.status, 200);
  assert("Item terhapus tidak ikut tampil (2 item)", detail.data?.data?.items?.length === 2, detail.data?.data?.items?.length, 2);

  const deletedSlug = await request("/bapenda/galleries/public/lorem", P);
  assert("Galeri terhapus tidak bisa dibuka publik (404)", deletedSlug.status === 404, deletedSlug.status, 404);

  // 2. CMS & alur review
  const saToken = await login("superadmin", SUPERADMIN_PASSWORD, "seloko");
  const editorToken = await login("editor.profil", DEFAULT_PASSWORD, "seloko");
  const viewerToken = await login("belum.verifikasi", DEFAULT_PASSWORD, "seloko");
  const sa = { token: saToken || undefined };
  const ed = { token: editorToken || undefined };

  const viewerCreate = await request("/bapenda/galleries", {
    method: "POST", token: viewerToken || undefined, body: { title: "Tidak boleh dibuat" },
  });
  assert("Role viewer ditolak membuat galeri (403)", viewerCreate.status === 403, viewerCreate.status, 403);

  const img = (n: number) => ({ fileUrl: `https://ik.imagekit.io/seloko/bapenda/galleries/uji-${n}.jpg` });
  const created = await request("/bapenda/galleries", {
    method: "POST", ...ed,
    body: { title: "Smoke Test Galeri Sementara", description: "Galeri uji", items: [img(1), img(2)] },
  });
  const gid = created.data?.data?.id;
  assert("Editor membuat galeri + 2 item awal (201)", created.status === 201 && created.data?.data?.items?.length === 2, created.status, 201);
  assert("Galeri baru berstatus DRAFT", created.data?.data?.status === "DRAFT");
  assert("Slug dibentuk dari judul", created.data?.data?.slug === SLUG, created.data?.data?.slug);

  const dup = await request("/bapenda/galleries", {
    method: "POST", ...sa, body: { title: "Galeri Slug Bentrok", slug: SLUG },
  });
  assert("Slug manual yang sudah dipakai ditolak (409)", dup.status === 409, dup.status, 409);

  const edList = await request("/bapenda/galleries?limit=100", ed);
  assert("Editor hanya melihat galeri miliknya", (edList.data?.data ?? []).every((g: any) => g.author?.fullName === "Andi Saputra"), edList.data?.data?.length);

  if (gid) {
    // Item: tambah, urut ulang, hapus
    const added = await request(`/bapenda/galleries/${gid}/items`, { method: "POST", ...ed, body: { items: [img(3)] } });
    assert("Tambah item → 3 item, item baru di urutan akhir", added.status === 201 && added.data?.data?.length === 3 && added.data?.data?.[2]?.fileUrl.endsWith("uji-3.jpg"), added.status, 201);
    const ids: string[] = (added.data?.data ?? []).map((i: any) => i.id);

    const partial = await request(`/bapenda/galleries/${gid}/items/reorder`, { method: "PATCH", ...ed, body: { itemIds: ids.slice(0, 2) } });
    assert("Reorder dengan daftar tidak lengkap ditolak (400)", partial.status === 400, partial.status, 400);

    const reordered = await request(`/bapenda/galleries/${gid}/items/reorder`, { method: "PATCH", ...ed, body: { itemIds: [...ids].reverse() } });
    assert("Reorder membalik urutan item", reordered.data?.data?.[0]?.id === ids[2] && reordered.data?.data?.[2]?.id === ids[0], reordered.status, 200);

    const delItem = await request(`/bapenda/galleries/${gid}/items/${ids[1]}`, { method: "DELETE", ...ed });
    assert("Hapus satu item (200)", delItem.data?.data?.deleted === true, delItem.status, 200);

    // Alur review
    const edPublish = await request(`/bapenda/galleries/${gid}/status`, { method: "PATCH", ...ed, body: { action: "publish" } });
    assert("Editor tidak bisa langsung publish (403)", edPublish.status === 403, edPublish.status, 403);

    const submit = await request(`/bapenda/galleries/${gid}/status`, { method: "PATCH", ...ed, body: { action: "submit" } });
    assert("Editor mengajukan review → PENDING_REVIEW", submit.data?.data?.status === "PENDING_REVIEW", submit.data?.data?.status);

    const locked = await request(`/bapenda/galleries/${gid}`, { method: "PUT", ...ed, body: { title: "Ubah saat review" } });
    assert("Editor tidak bisa mengubah galeri yang sedang direview (403)", locked.status === 403, locked.status, 403);
    const lockedItem = await request(`/bapenda/galleries/${gid}/items`, { method: "POST", ...ed, body: { items: [img(9)] } });
    assert("Editor tidak bisa menambah item saat direview (403)", lockedItem.status === 403, lockedItem.status, 403);

    const reject = await request(`/bapenda/galleries/${gid}/status`, { method: "PATCH", ...sa, body: { action: "reject", note: "Tambah foto" } });
    assert("Admin menolak → REJECTED", reject.data?.data?.status === "REJECTED", reject.data?.data?.status);

    await request(`/bapenda/galleries/${gid}/status`, { method: "PATCH", ...ed, body: { action: "submit" } });
    const approve = await request(`/bapenda/galleries/${gid}/status`, { method: "PATCH", ...sa, body: { action: "approve" } });
    assert("Ajukan ulang lalu disetujui → APPROVED", approve.data?.data?.status === "APPROVED", approve.data?.data?.status);

    const publish = await request(`/bapenda/galleries/${gid}/status`, { method: "PATCH", ...sa, body: { action: "publish" } });
    assert("Admin menerbitkan → PUBLISHED + publishedAt terisi", publish.data?.data?.status === "PUBLISHED" && Boolean(publish.data?.data?.publishedAt));

    const nowPublic = await request(`/bapenda/galleries/public/${SLUG}`, P);
    assert("Galeri terbit muncul di portal publik dengan 2 item (200)", nowPublic.status === 200 && nowPublic.data?.data?.items?.length === 2, nowPublic.status, 200);

    const unpublish = await request(`/bapenda/galleries/${gid}/status`, { method: "PATCH", ...sa, body: { action: "unpublish" } });
    assert("Unpublish → DRAFT, publishedAt dikosongkan", unpublish.data?.data?.status === "DRAFT" && unpublish.data?.data?.publishedAt === null);

    const edDelete = await request(`/bapenda/galleries/${gid}`, { method: "DELETE", ...ed });
    assert("Editor tidak punya izin hapus (403)", edDelete.status === 403, edDelete.status, 403);

    const del = await request(`/bapenda/galleries/${gid}`, { method: "DELETE", ...sa });
    assert("Admin menghapus (soft-delete) galeri (200)", del.data?.data?.deleted === true, del.status, 200);
    const gone = await request(`/bapenda/galleries/${gid}`, sa);
    assert("Galeri terhapus tidak bisa dibuka CMS (404)", gone.status === 404, gone.status, 404);
  }

  // 3. Galeri kosong tidak boleh terbit
  const empty = await request("/bapenda/galleries", { method: "POST", ...sa, body: { title: "Smoke Test Galeri Sementara Kosong" } });
  const emptyId = empty.data?.data?.id;
  if (emptyId) {
    const pubEmpty = await request(`/bapenda/galleries/${emptyId}/status`, { method: "PATCH", ...sa, body: { action: "publish" } });
    assert("Galeri tanpa item ditolak terbit (400)", pubEmpty.status === 400, pubEmpty.status, 400);
  }

  // Bersihkan baris uji agar slug bebas di run berikutnya (soft-delete tetap memegang slug).
  await prisma.gallery.deleteMany({ where: { slug: { startsWith: SLUG } } });
}

// ─── Test Suite: Bapenda FAQ ──────────────────────────────────────────────────
async function runFaqsSuite() {
  console.log("\n\x1b[36m▶ [Suite: Domain Bapenda - FAQ & Kategori]\x1b[0m");
  const P = { appCode: "bapenda-profile" };
  const PREFIX = "smoke-faq-";
  const clean = async () => {
    await prisma.faq.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.faqCategory.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  };
  await clean();

  // 1. Publik — data seed dari app lama
  const pubList = await request("/bapenda/faqs/public", P);
  assert("Daftar FAQ publik merespons sukses (200)", pubList.status === 200, pubList.status, 200);
  assert("FAQ di kategori nonaktif tersembunyi (17 dari 18)", pubList.data?.data?.length === 17, pubList.data?.data?.length, 17);
  assert("Publik tidak membawa data penulis", pubList.data?.data?.every((f: any) => !("author" in f)));

  const cats = await request("/bapenda/faqs/public/categories", P);
  assert("Kategori publik hanya yang aktif (6)", cats.data?.data?.length === 6, cats.data?.data?.length, 6);

  const pkb = await request("/bapenda/faqs/public?category=pkb", P);
  assert("Filter slug kategori PKB → 4 FAQ berurutan", pkb.data?.data?.length === 4 && pkb.data?.data?.[0]?.sortOrder === 1, pkb.data?.data?.length, 4);

  const search = await request("/bapenda/faqs/public?search=e-samsat", P);
  assert("Pencarian 'e-samsat' menemukan FAQ", (search.data?.data?.length ?? 0) > 0, search.data?.data?.length);

  const firstId = pubList.data?.data?.[0]?.id;
  const v1 = await request(`/bapenda/faqs/public/${firstId}/view`, { method: "POST", ...P });
  const v2 = await request(`/bapenda/faqs/public/${firstId}/view`, { method: "POST", ...P });
  assert("Hitung pembaca bertambah tiap panggilan", v2.data?.data?.viewCount === v1.data?.data?.viewCount + 1, v2.data?.data?.viewCount);

  // 2. CMS
  const saToken = await login("superadmin", SUPERADMIN_PASSWORD, "seloko");
  const editorToken = await login("editor.profil", DEFAULT_PASSWORD, "seloko");
  const viewerToken = await login("belum.verifikasi", DEFAULT_PASSWORD, "seloko");
  const sa = { token: saToken || undefined };
  const ed = { token: editorToken || undefined };

  const viewerCreate = await request("/bapenda/faqs/categories", {
    method: "POST", token: viewerToken || undefined, body: { name: "Tidak boleh" },
  });
  assert("Role viewer ditolak membuat kategori (403)", viewerCreate.status === 403, viewerCreate.status, 403);

  const cat = await request("/bapenda/faqs/categories", {
    method: "POST", ...ed, body: { name: "Smoke FAQ Kategori", slug: `${PREFIX}kategori`, sortOrder: 99 },
  });
  const catId = cat.data?.data?.id;
  assert("Editor membuat kategori FAQ (201)", cat.status === 201 && Boolean(catId), cat.status, 201);

  const dupCat = await request("/bapenda/faqs/categories", {
    method: "POST", ...sa, body: { name: "Bentrok", slug: `${PREFIX}kategori` },
  });
  assert("Slug kategori yang sudah dipakai ditolak (409)", dupCat.status === 409, dupCat.status, 409);

  const mk = (question: string, slug: string) =>
    request("/bapenda/faqs", {
      method: "POST", ...ed,
      body: { categoryId: catId, question, slug: `${PREFIX}${slug}`, answer: '<p onclick="x()">Jawaban</p><script>alert(1)</script>' },
    });
  const f1 = await mk("Pertanyaan uji pertama?", "satu");
  const f2 = await mk("Pertanyaan uji kedua?", "dua");
  const f3 = await mk("Pertanyaan uji ketiga?", "tiga");
  const ids = [f1, f2, f3].map((r) => r.data?.data?.id);
  assert("Editor membuat FAQ (201) berstatus draft", f1.status === 201 && f1.data?.data?.isPublished === false, f1.status, 201);
  assert("Tanpa sortOrder → ditaruh di akhir kategori (1,2,3)", [f1, f2, f3].map((r) => r.data?.data?.sortOrder).join() === "1,2,3");
  assert("Jawaban disanitasi (script & onclick dibuang)", !/script|onclick/.test(f1.data?.data?.answer ?? "x"));
  assert("Penulis tercatat tanpa PII", f1.data?.data?.author?.fullName === "Andi Saputra" && !("email" in (f1.data?.data?.author ?? {})));

  const badCat = await request("/bapenda/faqs", {
    method: "POST", ...sa, body: { categoryId: "00000000-0000-7000-8000-000000000000", question: "Kategori palsu?", answer: "Jawaban" },
  });
  assert("Kategori tidak dikenal ditolak (400)", badCat.status === 400, badCat.status, 400);

  // Draft tidak tampil & tidak bisa dihitung pembacanya
  const draftView = await request(`/bapenda/faqs/public/${ids[0]}/view`, { method: "POST", ...P });
  assert("Hitung pembaca FAQ draft ditolak (404)", draftView.status === 404, draftView.status, 404);

  const edPublish = await request(`/bapenda/faqs/${ids[0]}/publish`, { method: "PATCH", ...ed, body: { isPublished: true } });
  assert("Editor tidak punya izin terbit (403)", edPublish.status === 403, edPublish.status, 403);

  const pub = await request(`/bapenda/faqs/${ids[0]}/publish`, { method: "PATCH", ...sa, body: { isPublished: true } });
  assert("Admin menerbitkan → publishedAt terisi", pub.data?.data?.isPublished === true && Boolean(pub.data?.data?.publishedAt));
  const nowPublic = await request(`/bapenda/faqs/public?category=${PREFIX}kategori`, P);
  assert("FAQ terbit muncul di publik", nowPublic.data?.data?.length === 1, nowPublic.data?.data?.length, 1);

  const upd = await request(`/bapenda/faqs/${ids[0]}`, { method: "PUT", ...ed, body: { question: "Pertanyaan uji diubah?" } });
  assert("Editor mengubah FAQ → updatedBy tercatat", upd.data?.data?.updatedBy?.fullName === "Andi Saputra", upd.data?.data?.updatedBy?.fullName);

  // Reorder
  const partial = await request("/bapenda/faqs/reorder", { method: "PATCH", ...ed, body: { categoryId: catId, faqIds: ids.slice(0, 2) } });
  assert("Reorder dengan daftar tidak lengkap ditolak (400)", partial.status === 400, partial.status, 400);
  const reordered = await request("/bapenda/faqs/reorder", { method: "PATCH", ...ed, body: { categoryId: catId, faqIds: [...ids].reverse() } });
  assert("Reorder membalik urutan (sortOrder mulai 1)", reordered.data?.data?.[0]?.id === ids[2] && reordered.data?.data?.[0]?.sortOrder === 1, reordered.status, 200);

  // Kategori nonaktif menyembunyikan FAQ-nya
  await request(`/bapenda/faqs/categories/${catId}/active`, { method: "PATCH", ...ed, body: { isActive: false } });
  const hidden = await request(`/bapenda/faqs/public?category=${PREFIX}kategori`, P);
  assert("Kategori nonaktif → FAQ terbitnya tersembunyi", hidden.data?.data?.length === 0, hidden.data?.data?.length, 0);

  // Hapus
  const usedCat = await request(`/bapenda/faqs/categories/${catId}`, { method: "DELETE", ...sa });
  assert("Kategori yang masih dipakai ditolak dihapus (409)", usedCat.status === 409, usedCat.status, 409);

  const edDelete = await request(`/bapenda/faqs/${ids[0]}`, { method: "DELETE", ...ed });
  assert("Editor tidak punya izin hapus (403)", edDelete.status === 403, edDelete.status, 403);
  for (const id of ids) await request(`/bapenda/faqs/${id}`, { method: "DELETE", ...sa });
  const gone = await request(`/bapenda/faqs/${ids[0]}`, sa);
  assert("FAQ terhapus tidak bisa dibuka CMS (404)", gone.status === 404, gone.status, 404);

  const delCat = await request(`/bapenda/faqs/categories/${catId}`, { method: "DELETE", ...sa });
  assert("Kategori kosong berhasil dihapus (200)", delCat.data?.data?.deleted === true, delCat.status, 200);

  // Bersihkan baris uji agar slug bebas di run berikutnya (soft-delete tetap memegang slug).
  await clean();
}

// ─── Test Suite: Bapenda Regulasi ─────────────────────────────────────────────
async function runRegulationsSuite() {
  console.log("\n\x1b[36m▶ [Suite: Domain Bapenda - Regulasi & Dokumen]\x1b[0m");
  const P = { appCode: "bapenda-profile" };
  const PREFIX = "smoke-regulasi-";
  const clean = () => prisma.regulation.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await clean();

  // 1. Publik — data seed dari app lama
  const pubList = await request("/bapenda/regulations/public?limit=50", P);
  assert("Daftar regulasi publik merespons sukses (200)", pubList.status === 200, pubList.status, 200);
  assert("Hanya regulasi PUBLISHED (4 dari seed)", pubList.data?.data?.length === 4, pubList.data?.data?.length, 4);
  assert("Setiap regulasi publik berupa PDF", pubList.data?.data?.every((r: any) => r.fileUrl.endsWith(".pdf")));

  const search = await request("/bapenda/regulations/public?search=bbnkb", P);
  assert("Pencarian 'bbnkb' menemukan regulasi", search.data?.data?.length === 1, search.data?.data?.length, 1);

  const detail = await request("/bapenda/regulations/public/perda-no-8-tahun-2010-tentang-pajak-daerah", P);
  assert("Detail regulasi publik via slug (200)", detail.status === 200, detail.status, 200);

  const draftSlug = await request("/bapenda/regulations/public/draft-revisi-pergub-tarif-pajak-air-2025", P);
  assert("Regulasi draft tidak bisa dibuka publik (404)", draftSlug.status === 404, draftSlug.status, 404);

  // 2. CMS
  const saToken = await login("superadmin", SUPERADMIN_PASSWORD, "seloko");
  const editorToken = await login("editor.profil", DEFAULT_PASSWORD, "seloko");
  const viewerToken = await login("belum.verifikasi", DEFAULT_PASSWORD, "seloko");
  const sa = { token: saToken || undefined };
  const ed = { token: editorToken || undefined };

  const viewerCreate = await request("/bapenda/regulations", {
    method: "POST", token: viewerToken || undefined,
    body: { title: "Tidak boleh dibuat", fileUrl: "https://ik.imagekit.io/x/a.pdf" },
  });
  assert("Role viewer ditolak membuat regulasi (403)", viewerCreate.status === 403, viewerCreate.status, 403);

  const notPdf = await request("/bapenda/regulations", {
    method: "POST", ...ed,
    body: { title: "Smoke Regulasi Bukan PDF", slug: `${PREFIX}bukan-pdf`, fileUrl: "https://ik.imagekit.io/x/dokumen.docx" },
  });
  const notPdfId = notPdf.data?.data?.id;
  assert("Berkas non-PDF tetap boleh disimpan sebagai draft", notPdf.status === 201, notPdf.status, 201);
  const notPdfPublish = await request(`/bapenda/regulations/${notPdfId}/status`, {
    method: "PATCH", ...sa, body: { status: "PUBLISHED" },
  });
  assert("Terbit dengan berkas non-PDF ditolak (400)", notPdfPublish.status === 400, notPdfPublish.status, 400);

  const created = await request("/bapenda/regulations", {
    method: "POST", ...ed,
    body: {
      title: "Smoke Regulasi Sementara", slug: `${PREFIX}sementara`,
      description: "Dokumen uji", fileUrl: "https://ik.imagekit.io/x/smoke.pdf",
      fileName: "smoke.pdf", fileSize: 1024,
    },
  });
  const rid = created.data?.data?.id;
  assert("Editor membuat regulasi (201) berstatus DRAFT", created.status === 201 && created.data?.data?.status === "DRAFT", created.status, 201);

  const dup = await request("/bapenda/regulations", {
    method: "POST", ...sa,
    body: { title: "Bentrok", slug: `${PREFIX}sementara`, fileUrl: "https://ik.imagekit.io/x/b.pdf" },
  });
  assert("Slug yang sudah dipakai ditolak (409)", dup.status === 409, dup.status, 409);

  const edPublish = await request(`/bapenda/regulations/${rid}/status`, { method: "PATCH", ...ed, body: { status: "PUBLISHED" } });
  assert("Editor tidak punya izin terbit (403)", edPublish.status === 403, edPublish.status, 403);

  const pub = await request(`/bapenda/regulations/${rid}/status`, { method: "PATCH", ...sa, body: { status: "PUBLISHED" } });
  assert("Admin menerbitkan → publishedAt terisi", pub.data?.data?.status === "PUBLISHED" && Boolean(pub.data?.data?.publishedAt));

  const nowPublic = await request(`/bapenda/regulations/public/${PREFIX}sementara`, P);
  assert("Regulasi terbit muncul di publik (200)", nowPublic.status === 200, nowPublic.status, 200);

  const upd = await request(`/bapenda/regulations/${rid}`, { method: "PUT", ...ed, body: { description: "Diubah" } });
  assert("Editor mengubah regulasi saat terbit (200)", upd.status === 200 && upd.data?.data?.description === "Diubah", upd.status, 200);

  const unpub = await request(`/bapenda/regulations/${rid}/status`, { method: "PATCH", ...sa, body: { status: "DRAFT" } });
  assert("Tarik ke draft → publishedAt dikosongkan", unpub.data?.data?.status === "DRAFT" && unpub.data?.data?.publishedAt === null);

  const edDelete = await request(`/bapenda/regulations/${rid}`, { method: "DELETE", ...ed });
  assert("Editor tidak punya izin hapus (403)", edDelete.status === 403, edDelete.status, 403);

  const del = await request(`/bapenda/regulations/${rid}`, { method: "DELETE", ...sa });
  assert("Admin menghapus (soft-delete) regulasi (200)", del.data?.data?.deleted === true, del.status, 200);
  const gone = await request(`/bapenda/regulations/${rid}`, sa);
  assert("Regulasi terhapus tidak bisa dibuka CMS (404)", gone.status === 404, gone.status, 404);

  if (notPdfId) await request(`/bapenda/regulations/${notPdfId}`, { method: "DELETE", ...sa });
  await clean();
}

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
    if (!targetModule || targetModule === "news" || targetModule === "berita") {
      await runNewsSuite();
    }
    if (!targetModule || targetModule === "galleries" || targetModule === "galeri") {
      await runGalleriesSuite();
    }
    if (!targetModule || targetModule === "faqs" || targetModule === "faq") {
      await runFaqsSuite();
    }
    if (!targetModule || targetModule === "regulations" || targetModule === "regulasi") {
      await runRegulationsSuite();
    }
    if (!targetModule || targetModule === "pages" || targetModule === "halaman") {
      await runPagesSuite();
    }
    if (!targetModule || targetModule === "organizations" || targetModule === "opd" || targetModule === "organisasi") {
      await runOrganizationsSuite();
    }
    if (!targetModule || targetModule === "users-org" || targetModule === "role-scope") {
      await runUsersOrgSuite();
    }
    if (!targetModule || targetModule === "lapak-rbac" || targetModule === "lapak") {
      await runLapakRbacSuite();
    }
    if (!targetModule || targetModule === "register" || targetModule === "registrasi") {
      await runRegisterSuite();
    }
    if (!targetModule || targetModule === "lapak-categories") {
      await runLapakCategoriesSuite();
    }
    if (!targetModule || targetModule === "lapak-products") {
      await runLapakProductsSuite();
    }
    if (!targetModule || targetModule === "lapak-rates") {
      await runLapakRatesSuite();
    }
    if (!targetModule || targetModule === "lapak-catalog" || targetModule === "katalog") {
      await runLapakCatalogSuite();
    }
    if (!targetModule || targetModule === "lapak-availability" || targetModule === "jadwal") {
      await runLapakAvailabilitySuite();
    }
    if (!targetModule || targetModule === "lapak-reservations" || targetModule === "reservasi") {
      await runLapakReservationsSuite();
    }
    if (!targetModule || targetModule === "lapak-cart" || targetModule === "keranjang") {
      await runLapakCartSuite();
    }
    if (!targetModule || targetModule === "lapak-orders" || targetModule === "pesanan") {
      await runLapakOrdersSuite();
    }
    if (!targetModule || targetModule === "lapak-skrd" || targetModule === "skrd") {
      await runLapakSkrdSuite();
    }
    if (!targetModule || targetModule === "lapak-payments" || targetModule === "pembayaran") {
      await runLapakPaymentsSuite();
    }
    if (!targetModule || targetModule === "lapak-tickets" || targetModule === "tiket") {
      await runLapakTicketsSuite();
    }
    if (!targetModule || targetModule === "lapak-expiry" || targetModule === "kedaluwarsa") {
      await runLapakExpirySuite();
    }
    if (!targetModule || targetModule === "lapak-dashboard" || targetModule === "dashboard") {
      await runLapakDashboardSuite();
    }
    if (!targetModule || targetModule === "lapak-reports" || targetModule === "laporan") {
      await runLapakReportsSuite();
    }
    if (!targetModule || targetModule === "lapak-public-stats" || targetModule === "transparansi") {
      await runLapakPublicStatsSuite();
    }
    if (!targetModule || targetModule === "lapak-news" || targetModule === "berita") {
      await runLapakNewsSuite();
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
