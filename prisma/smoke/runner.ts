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
    if (!targetModule || targetModule === "news" || targetModule === "berita") {
      await runNewsSuite();
    }
    if (!targetModule || targetModule === "pages" || targetModule === "halaman") {
      await runPagesSuite();
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
