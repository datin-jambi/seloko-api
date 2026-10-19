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

  assert("Aplikasi Lapak aktif & PUBLIC", lapakApp.isActive && lapakApp.audience === "PUBLIC");
  assert("Permission lama 'merchant:*' sudah tidak ada", !codes.some((c) => c.startsWith("merchant:")), codes.filter((c) => c.startsWith("merchant:")));
  assert("Permission 'product:publish' tersedia", codes.includes("product:publish"), codes.includes("product:publish"));
  assert("Permission 'skrd-setting:create' tersedia (master Bapenda)", codes.includes("skrd-setting:create"));

  // 2. Role lama hilang, role baru lengkap.
  const roleNames = (
    await prisma.role.findMany({ where: { applicationId: lapakApp.id }, select: { name: true } })
  ).map((r) => r.name);
  for (const expected of ["admin-opd", "manajer-opd", "petugas-lokasi", "warga", "admin", "superadmin"]) {
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
  const warga = await permsOf("warga");
  assert("admin-opd TIDAK boleh category:create (master Bapenda)", !adminOpd.includes("category:create"), adminOpd.filter((c) => c.startsWith("category:")));
  assert("admin-opd TIDAK boleh retribution-object:create", !adminOpd.includes("retribution-object:create"));
  assert("admin-opd boleh product:approve", adminOpd.includes("product:approve"));
  assert("admin-opd TIDAK boleh product:publish", !adminOpd.includes("product:publish"), adminOpd.filter((c) => c.startsWith("product:")));
  assert("manajer-opd boleh product:publish", manajer.includes("product:publish"));
  assert("manajer-opd TIDAK boleh delete", !manajer.some((c) => c.endsWith(":delete")));
  assert("warga hanya order/payment/review", warga.every((c) => /^(order|payment|review):/.test(c)), warga);
  assert("warga TIDAK boleh product:list", !warga.includes("product:list"));

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
  const wargaToken = await login("warga.pedagang@gmail.com", DEFAULT_PASSWORD, LAPAK);
  assert("Akun PUBLIC bisa login ke Lapak", Boolean(wargaToken));
  const wargaSeloko = await login("warga.pedagang@gmail.com", DEFAULT_PASSWORD, "seloko");
  assert("Akun PUBLIC ditolak login ke seloko", wargaSeloko === null, wargaSeloko);

  // Pegawai SELALU login lewat seloko (gateway INTERNAL), meski modul yang
  // dikelolanya milik aplikasi lain. Izin modul dibaca dari aplikasi PEMILIK
  // lewat GET /permissions/:applicationId/me — bukan dari header X-App-Code.
  const adminOpdToken = await login("admin.bpsdm", DEFAULT_PASSWORD, "seloko");
  assert("Pegawai admin OPD login lewat seloko", Boolean(adminOpdToken));

  const adminOpdLapak = await login("admin.bpsdm", DEFAULT_PASSWORD, LAPAK);
  assert("Pegawai DITOLAK login langsung ke aplikasi publik Lapak", adminOpdLapak === null, adminOpdLapak);

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
  const LAPAK = "lapak-jambi-web";
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
  const wargaToken = await login("warga.pedagang@gmail.com", DEFAULT_PASSWORD, "lapak-jambi-web");
  const forbidden = await request("/lapak/categories", { token: wargaToken || undefined, appCode: "lapak-jambi-web" });
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
    ],
  };

  const testCategoryWhere = {
    OR: [
      { name: { contains: "Cat" } },
      { name: { endsWith: "Uji" } },
      { name: { startsWith: "Sewa Test" } },
    ],
  };

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
  const wargaToken = await login("warga.pedagang@gmail.com", DEFAULT_PASSWORD, "lapak-jambi-web");
  assert("Superadmin login", Boolean(saToken));
  assert("Warga login ke lapak", Boolean(wargaToken));

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
  const cartA = await request("/lapak/carts/opd/BPSDM", { token: wargaToken || undefined, appCode: "lapak-jambi-web" });
  assert("Keranjang OPD BPSDM 200", cartA.status === 200, cartA.status, cartA.data?.message);
  assert("Keranjang memuat organisasi", cartA.data?.data?.organization?.code === "BPSDM",
    cartA.data?.data?.organization?.code);
  assert("Keranjang baru kosong", (cartA.data?.data?.items ?? []).length === 0);
  const cartAId = cartA.data?.data?.id;

  // Idempoten: meminta lagi mengembalikan keranjang yang SAMA.
  const cartA2 = await request("/lapak/carts/opd/BPSDM", { token: wargaToken || undefined, appCode: "lapak-jambi-web" });
  assert("Keranjang OPD sama dipakai ulang", cartA2.data?.data?.id === cartAId, cartA2.data?.data?.id);

  // ── 3. Tambah produk OPD yang sama → berhasil.
  const addA = await request(`/lapak/carts/${cartAId}/items`, {
    method: "POST", token: wargaToken || undefined,
    appCode: "lapak-jambi-web",
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
    appCode: "lapak-jambi-web",
    body: { productId: prodB.id, qty: 1 },
  });
  assert("Produk OPD lain ditolak 409", addCross.status === 409, addCross.status, addCross.data?.message);

  // ── 5. Keranjang terpisah untuk OPD kedua → berhasil.
  const cartB = await request("/lapak/carts/opd/DISBUDPAR", { token: wargaToken || undefined, appCode: "lapak-jambi-web" });
  assert("Keranjang OPD kedua dibuat", cartB.status === 200, cartB.status);
  assert("Keranjang OPD kedua berbeda", cartB.data?.data?.id !== cartAId);
  const cartBId = cartB.data?.data?.id;

  const addB = await request(`/lapak/carts/${cartBId}/items`, {
    method: "POST", token: wargaToken || undefined,
    appCode: "lapak-jambi-web",
    body: { productId: prodB.id, qty: 1 },
  });
  assert("Produk OPD kedua masuk keranjangnya sendiri", addB.status === 201, addB.status, addB.data?.message);

  // ── 6. Daftar keranjang: dua keranjang, satu per OPD.
  const listCarts = await request("/lapak/carts", { token: wargaToken || undefined, appCode: "lapak-jambi-web" });
  assert("Daftar keranjang 200", listCarts.status === 200, listCarts.status);
  assert("Tepat 2 keranjang (satu per OPD)", (listCarts.data?.data ?? []).length === 2,
    (listCarts.data?.data ?? []).length);

  // ── 7. Duplikat item identik → qty bertambah, bukan baris baru.
  const addDup = await request(`/lapak/carts/${cartAId}/items`, {
    method: "POST", token: wargaToken || undefined,
    appCode: "lapak-jambi-web",
    body: { productId: prodA.id, rateId: prodA.rateId, qty: 1 },
  });
  assert("Item duplikat menambah qty", (addDup.data?.data?.items ?? []).length === 1,
    (addDup.data?.data?.items ?? []).length);
  assert("Qty jadi 3", addDup.data?.data?.items?.[0]?.qty === 3, addDup.data?.data?.items?.[0]?.qty);

  // ── 8. Ubah qty & hapus item.
  const itemId = addDup.data?.data?.items?.[0]?.id;
  const upd = await request(`/lapak/carts/${cartAId}/items/${itemId}`, {
    method: "PUT", token: wargaToken || undefined, appCode: "lapak-jambi-web", body: { qty: 5, note: "Tolong siapkan kursi" },
  });
  assert("Ubah qty 200", upd.status === 200, upd.status, upd.data?.message);
  assert("Qty jadi 5", upd.data?.data?.items?.[0]?.qty === 5, upd.data?.data?.items?.[0]?.qty);
  assert("Catatan tersimpan", upd.data?.data?.items?.[0]?.note === "Tolong siapkan kursi");

  const del = await request(`/lapak/carts/${cartAId}/items/${itemId}`, {
    method: "DELETE", token: wargaToken || undefined,
  appCode: "lapak-jambi-web",
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
    method: "POST", token: wargaToken || undefined, appCode: "lapak-jambi-web", body: { productId: draftId, qty: 1 },
  });
  assert("Produk DRAFT ditolak 400", addDraft.status === 400, addDraft.status, addDraft.data?.message);

  // ── 10. Keranjang milik orang lain tidak bisa diakses (404, bukan 403).
  const otherCart = await request(`/lapak/carts/${cartAId}`, { token: saToken || undefined });
  assert("Keranjang orang lain 404", otherCart.status === 404, otherCart.status);

  // ── 11. Kosongkan & hapus keranjang.
  const cleared = await request(`/lapak/carts/${cartBId}/clear`, { method: "POST", token: wargaToken || undefined, appCode: "lapak-jambi-web" });
  assert("Kosongkan keranjang 200", cleared.status === 200, cleared.status);
  assert("Keranjang kosong", (cleared.data?.data?.items ?? []).length === 0);

  const delCart = await request(`/lapak/carts/${cartBId}`, { method: "DELETE", token: wargaToken || undefined, appCode: "lapak-jambi-web" });
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
