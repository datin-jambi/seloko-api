# 🌐 PRD 02: Bapenda Profile & Portal Publik BPKPD Jambi

- **Kode Aplikasi Tenant:** `bapenda-profile`
- **Tipe Domain:** Portal Informasi Publik Resmi, Direktori Layanan Samsat, Publikasi Berita, Galeri, FAQ, & Regulasi
- **Referensi Aplikasi Lama:** [`datin-jambi/Bapenda-Jambi-Profile`](https://github.com/datin-jambi/Bapenda-Jambi-Profile) (Next.js 15 + Prisma, single-tenant, ID integer, role hardcode). Lokal: `C:\Users\ASUS\Documents\BPKPD\Code\Bapeda-Jambi-Profile-CRF`.
- **Status Modul Saat Ini:** 🟡 **Dalam Pengerjaan (Modul 5: Galeri)**

---

## 1. Latar Belakang & Masalah Bisnis
Masyarakat Provinsi Jambi membutuhkan portal resmi yang transparan, terpercaya, dan mudah diakses untuk memperoleh informasi mengenai:
- Lokasi dan jam operasional 11 kantor Samsat se-Provinsi Jambi.
- Program keringanan pajak / pemutihan denda pajak kendaraan bermotor.
- Berita resmi, pengumuman, kegiatan, dan inovasi Bapenda.
- Profil lembaga (sejarah, visi-misi, tupoksi, struktur organisasi, pejabat).
- Tanya jawab seputar perpajakan daerah (FAQ).
- Dokumen produk hukum dan regulasi daerah (Perda, Pergub) yang dapat diunduh.

Aplikasi lama di-*rebuild* menjadi tenant `bapenda-profile` di SELOKO API. Frontend portal publik & CMS tetap terpisah; seluruh data & auth dilayani SELOKO.

---

## 2. Prinsip Rebuild dari Aplikasi Lama

| Aspek | Aplikasi Lama | SELOKO API |
|---|---|---|
| Primary key | `Int autoincrement` | UUID v7 |
| Tenancy | Single-tenant | Kolom `applicationId` + unique per tenant |
| User & login | Tabel `users` sendiri, JWT sendiri | Identity SELOKO (akun `INTERNAL`), tidak dibangun ulang |
| Hak akses | Enum `Role` + `ROLE_PERMISSIONS` hardcode | Dynamic RBAC per aplikasi (`requirePermission(code, { app })`) |
| Audit log | Tabel `audit_logs` sendiri | `AuditLog` core SELOKO |
| Pengaturan situs | Tabel `settings` key-value | `Application.settings` JSON (contact, seo, branding, features) — tidak ada modul baru |
| Cek pajak kendaraan + log petugas | Ada di app profil | **Dipindah** ke domain `simpad` (PRD 03), bukan bagian portal profil |
| Upload file | Route `/api/upload/*` | Standar media ImageKit dua-tahap SELOKO |
| Nama field | `thumbnailUrl`, `seoTitle`, `seoDescription` | **Dipertahankan** (skema universal sudah memakai nama ini) |

---

## 3. Keputusan Arsitektur: Berita vs Artikel (Universal Content)

**Masalah:** Bapenda hanya punya *berita*. Tapi di super app, satu aplikasi bisa punya **berita dan artikel sekaligus** (mis. portal lain punya rubrik berita + artikel edukasi), dengan menu, kategori, dan hak akses terpisah.

**Keputusan:** Satu tabel konten universal (`articles` + `article_categories`) dibedakan oleh kolom **`type`**, bukan tabel terpisah per jenis.

- `type` (enum PostgreSQL `ArticleType`): nilai awal `NEWS` | `ARTICLE`. **Tidak terbatas 2** — jenis baru = tambah nilai enum.
- Kategori terikat ke satu `type` → kategori berita tidak bercampur dengan kategori artikel.
- Slug unik per `(applicationId, type, slug)` → `/berita/x` dan `/artikel/x` boleh bentrok slug.
- Setiap `type` = **entity permission & menu sendiri** (`news:*`, `article:*`), sehingga editor berita tidak otomatis bisa mengelola artikel.
- Satu service/controller dipakai bersama, di-*mount* per type: `/api/<domain>/news` (type `NEWS`), `/api/<domain>/articles` (type `ARTICLE`).
- **Bapenda Profile hanya memakai `NEWS`.** "Pengumuman", "Kegiatan", "Inovasi", "Layanan" adalah **kategori** berita (sama seperti app lama), bukan type terpisah. Entity permission `announcement` di seed dihapus.

**Aturan Type vs Kategori:**
- **Type baru** bila butuh menu, permission, atau halaman frontend berbeda (Berita vs Artikel).
- **Kategori** bila hanya pengelompokan dalam satu menu (Pengumuman/Kegiatan di dalam Berita). Kategori dibuat admin lewat CMS tanpa deploy.

**Langkah menambah type baru (scaling):**
1. Tambah nilai di `enum ArticleType` → migrasi (`ALTER TYPE ... ADD VALUE`, data lama aman).
2. Daftarkan route: mount service yang sama dengan prefix & type baru.
3. Daftarkan entity permission + menu di `applications.json` / `menus.json` aplikasi pemilik.

**Mekanisme penyimpanan `type` — dipilih enum:**

| Opsi | Tambah jenis | Kelebihan | Kekurangan |
|---|---|---|---|
| **Enum PostgreSQL** ✅ | Migrasi + deploy | Type-safe Prisma/TS, DB tolak nilai salah | Berlaku global semua aplikasi |
| String + validasi Zod | Ubah kode saja | Tanpa migrasi | DB tidak menjaga integritas |
| Tabel `content_types` per app | Lewat CMS, tanpa deploy | Tiap app punya daftar sendiri | Permission, menu, & route harus dinamis — berlebihan saat ini |

Alasan: jenis konten baru tetap butuh route, permission, dan menu baru yang juga lewat deploy, jadi keunggulan tabel lookup tidak terpakai. Upgrade ke tabel `content_types` bila admin perlu membuat jenis konten sendiri; migrasi enum → tabel bisa tanpa kehilangan data.

**Alternatif ditolak:**
- Tabel terpisah `news` & `articles` → duplikasi skema, service, dan migrasi untuk struktur identik.
- Dibedakan via kategori saja → tidak bisa pisah menu & permission per jenis konten.

---

## 4. Alur Status Konten (Review Workflow)

Dipertahankan dari app lama, berlaku untuk **Berita** dan **Galeri** (`ContentStatus` sudah ada di skema):

```text
DRAFT ──submit──▶ PENDING_REVIEW ──approve──▶ APPROVED ──publish──▶ PUBLISHED
  ▲                    │                                              │
  │                  reject                                       unpublish
  │                    ▼                                              │
  └──── (edit) ──── REJECTED                     DRAFT ◀──────────────┘
```

| Aksi | Dari status | Permission |
|---|---|---|
| `submit` | DRAFT, REJECTED | `<entity>:update` (pemilik) |
| `approve` / `reject` | PENDING_REVIEW | `<entity>:approve` / `<entity>:reject` |
| `publish` | APPROVED (atau langsung dari DRAFT untuk pemegang `publish`) | `<entity>:publish` |
| `unpublish` | PUBLISHED | `<entity>:publish` |

- Data baru selalu `DRAFT`.
- `publishedAt` diisi saat `publish`, dikosongkan saat `unpublish`.
- **Scope kepemilikan:** user tanpa permission `<entity>:approve` hanya melihat & mengubah konten miliknya (`authorId = user.id`) — pengganti aturan lama Editor/Admin_Uptd/Ketua_Uptd.
- Endpoint aksi: `PATCH /:id/status` body `{ action: "submit" | "approve" | "reject" | "publish" | "unpublish" }`. Transisi tidak valid → `BadRequestError`.
- Setiap perubahan status dicatat ke `AuditLog` (old/new status).
- Grup aksi baru di `roles.json`: `reviewable` = `create, read, update, delete, list, approve, reject, publish` (`submit` cukup pakai `update`).

Pemetaan role lama → role SELOKO (`roles.json`):

| Role Lama | Role SELOKO | Keterangan |
|---|---|---|
| Super_Admin | `superadmin` | Semua permission |
| Admin | `admin` | Semua permission |
| Editor, Ketua_Uptd, Admin_Uptd | `editor` | create/read/update/list, scope konten sendiri (role UPTD tidak dibawa, lihat §8) |
| — | `verifikator` | approve/reject |
| Petugas | — | Pindah ke `simpad` (cek pajak) |

---

## 5. Roadmap & Status Fitur

| No | Modul Fitur | Endpoint Prefix | Status | Sumber Data Lama |
|:---:|:---|:---|:---:|:---|
| **1** | **UPTD Samsat** | `/api/bapenda/uptds` | ✅ **Selesai** | `uptds.json` (11) |
| **2** | **Carousel Banners** | `/api/bapenda/banners` | ✅ **Selesai** | `banners.json` (6) |
| **3** | **Berita & Kategori** | `/api/bapenda/news` | ✅ **Selesai** | `news.json` (7), `news_categories.json` (5) |
| **4** | **Halaman Profil (Pages)** | `/api/bapenda/pages` | ✅ **Selesai** | `pages.json` (5) |
| **5** | **Galeri** | `/api/bapenda/galleries` | ⏳ **Target Berikutnya** | `galleries.json` (3), `gallery_items.json` (7) |
| **6** | **FAQ & Kategori** | `/api/bapenda/faqs` | ⏳ *Antrean* | `faqs.json` (18), `faq_categories.json` (7) |
| **7** | **Regulasi & Dokumen** | `/api/bapenda/regulations` | ⏳ *Antrean* | `regulations.json` (5) |
| **8** | **Pengaturan Situs** | via `Application.settings` (core) | ⏳ *Antrean* | `settings.json` (18 key) |

---

## 6. Spesifikasi Rinci Modul

### A. Modul 1: UPTD Samsat (`/api/bapenda/uptds`) — ✅ Selesai
- **Publik:** `GET /public` (semua kantor aktif), `GET /public/:code` (detail per kantor).
- **CMS:** CRUD lengkap, filter kota, sorting, toggle status operasional (`/active`), dan toggle pin peta (`/map`).
- **Geolokasi:** `latitude`, `longitude`, `googleMapsUrl` untuk integrasi Leaflet / Google Maps.

### B. Modul 2: Banners (`/api/bapenda/banners`) — ✅ Selesai
- **Dual-Device:** Slot Desktop (lebar ≥ 800 px, max 3MB) dan Slot Mobile (lebar ≥ 360 px, max 1.5MB).
- **Validasi Toleran ImageKit:** Hanya diperiksa jika banner berstatus aktif (`isActive: true`).
- **CMS Reorder:** `PATCH /reorder` untuk update urutan `sortOrder` massal.

---

### C. Modul 3: Berita & Kategori (`/api/bapenda/news`) — ✅ Selesai
Memakai tabel universal `articles` / `article_categories` dengan `type = NEWS` (lihat §3).

**Implementasi:** schema + service bersama di `src/modules/shared/article/`; route & controller milik Bapenda di `src/modules/bapenda/news/` (scope `bapenda-profile`, `NEWS`, `news:*`), terdaftar `/api/bapenda/news` seperti modul bapenda lain. Migrasi `20261012095431_add_article_type`. Uji: `npm test` (`article.check.ts`) & `npm run db:smoke -- news` (27 skenario).

#### 1. Perubahan Skema (migrasi baru)
- `enum ArticleType { NEWS ARTICLE }`.
- `ArticleCategory.type ArticleType` → unique diganti `@@unique([applicationId, type, slug])`.
- `Article.type ArticleType` → unique diganti `@@unique([applicationId, type, slug])`, index `[applicationId, type, status, publishedAt]`.

#### 2. Entitas Kategori (`ArticleCategory`) — sudah ada
`id`, `applicationId`, `type`, `name` (≤100), `slug` (≤120), `description?`, `isActive`, `sortOrder`, timestamps, `deletedAt`.
- Kategori yang masih dipakai berita tidak boleh dihapus (`onDelete: Restrict` → `ConflictError`).

#### 3. Entitas Berita (`Article`) — sudah ada
`id`, `applicationId`, `type`, `categoryId`, `authorId` (user SELOKO), `title` (≤255), `slug` (≤255), `excerpt?` (≤1000, data lama sampai 634 karakter), `content` (HTML), `thumbnailUrl?` + `thumbnailFileId?` (ImageKit, landscape, max 3MB, min lebar 600px), `status`, `publishedAt?`, `viewCount`, `seoTitle?`, `seoDescription?`, timestamps, `deletedAt`.
- Slug otomatis dari judul (slugify); bila bentrok, tambahkan suffix `-2`, `-3`, …. Slug yang diketik manual dan bentrok → `ConflictError`.
- Konten HTML wajib disanitasi sebelum simpan.
- Ganti/hapus thumbnail → auto-cleanup file ImageKit lama secara asinkron.
- `isFeatured` & status `ARCHIVED` **tidak** dibuat (tidak ada di app lama). Tambah bila portal butuh headline.

#### 4. Endpoint
- **Publik (tanpa login, hanya `PUBLISHED`, `deletedAt: null`):**
  - `GET /public` — pagination, filter `categorySlug`, `search`, urut `publishedAt desc`.
  - `GET /public/:slug` — detail + increment `viewCount`.
  - `GET /public/categories` — kategori aktif.
- **CMS:**
  - `GET /` — list, filter `status`, `categoryId`, `search`, pagination (scope pemilik, §4).
  - `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id` (soft-delete).
  - `PATCH /:id/status` — aksi workflow (§4).
  - Kategori: `GET|POST /categories`, `PUT|DELETE /categories/:id`, `PATCH /categories/:id/active`.

#### 5. Permission (`applications.json`, app `bapenda-profile`)
- `news` (grup `reviewable`), `news-category` (grup `content`).
- Entity `article` & `announcement` lama dihapus dari seed bapenda; menu `konten.berita`, `konten.berita.review` (`news:approve`), `konten.berita.kategori`.
- Perubahan status dikirim ke audit lewat routing key `audit.content.status` (action `news.<aksi>`, metadata from/to/note).

#### 6. Seeder
- `prisma/seeds/bapenda/news.json` dari `prisma/data/news.json` + `news_categories.json` app lama.
- `authorId` dipetakan ke user internal SELOKO yang ter-seed (user lama tidak dimigrasi).
- ID lama tidak dipakai; relasi dipetakan via slug.

---

### D. Modul 4: Halaman Profil (`/api/bapenda/pages`) — ✅ Selesai
- Modul khas domain `src/modules/bapenda/pages/` (4-layer). Tanpa migrasi — skema `Page` sudah ada: `title`, `slug`, `content` (HTML), `seoTitle?`, `seoDescription?`, `isPublished`, `publishedAt?`.
- Halaman statis per slug: `sejarah`, `visi-misi`, `tupoksi`, `struktur-organisasi`, `pejabat` (ter-seed dari app lama, waktu WIB → UTC; app lama tanpa `publishedAt` → diisi `updatedAt`).
- Tanpa review workflow: halaman baru selalu draft, terbit/tarik via `PATCH /:id/publish` `{ isPublished }` (`publishedAt` diisi saat terbit, dikosongkan saat ditarik).
- Slug = URL tetap `/profil/<slug>`: bentrok → `ConflictError` (tanpa akhiran otomatis).
- **Publik:** `GET /public` (daftar terbit tanpa isi, untuk menu), `GET /public/:slug`. **CMS:** list (filter `isPublished`, search), detail, create, update, publish, soft-delete.
- Permission: `page` (grup `publishable`); menu `konten.halaman` (`page:list`).
- Konten HTML disanitasi lewat `src/common/utils/html.ts` (dipakai bersama berita): tabel `colspan/rowspan` & `style` aman (`color`, `background-color`, `text-align`, `width`, `min-width`) dipertahankan agar tabel halaman Pejabat utuh.
- Uji: `npm run db:smoke -- pages` (20 skenario), `src/common/utils/html.check.ts`.

### E. Modul 5: Galeri (`/api/bapenda/galleries`) — ⏳ Antrean
- Skema `Gallery` (+ `slug`, `coverImageUrl/FileId`, `status`, `authorId`) & `GalleryItem` (`mediaType` IMAGE/VIDEO/PDF, `fileUrl/fileId`, `title?`, `description?`, `sortOrder`).
- Review workflow sama dengan berita (§4).
- Item: tambah, hapus, reorder (`PATCH /:id/items/reorder`). Hapus galeri/item → cleanup ImageKit.
- **Publik:** `GET /public`, `GET /public/:slug` (beserta item). **CMS:** CRUD + status + item.
- Permission: `gallery` (grup `reviewable`).

### F. Modul 6: FAQ & Kategori (`/api/bapenda/faqs`) — ⏳ Antrean
- Skema `FaqCategory` & `Faq` sudah ada: `question`, `slug`, `answer`, `sortOrder`, `isPublished`, `viewCount`, `publishedAt?`, `authorId`, `updatedById?`.
- Tanpa review workflow (toggle publish).
- **Publik:** `GET /public` (filter kategori, search), `GET /public/categories`, `POST /public/:id/view` (increment `viewCount`, dari app lama).
- **CMS:** CRUD FAQ & kategori, `PATCH /:id/publish`, `PATCH /reorder`.
- Permission: `faq` (grup `content` + `publish`), `faq-category` (grup `content`).

### G. Modul 7: Regulasi & Dokumen (`/api/bapenda/regulations`) — ⏳ Antrean
- Skema `Regulation` sudah ada: `title`, `slug`, `description?`, `fileUrl` + `fileId?` + `fileName?` + `fileSize?` (PDF ImageKit), `status`, `publishedAt?`.
- Status cukup `DRAFT` / `PUBLISHED` (tanpa review).
- **Publik:** `GET /public` (pagination, search). **CMS:** CRUD + `PATCH /:id/status`.
- Permission: `regulation` (grup `content` + `publish`).
- *Ekstensi opsional (belum ada di app lama):* `type` (PERDA/PERGUB/UU), `number`, `year`, `about`, status BERLAKU/DICABUT — tambahkan bila diminta.

### H. Modul 8: Pengaturan Situs — ⏳ Antrean
- Key lama (`site_name`, `contact_*`, `social_*`, `office_hours`, `location_*`, `google_analytics_id`, `footer_text`, `logo_url`, `favicon_url`) dipetakan ke `Application.settings` (`branding`, `contact`, `seo`, `features`) milik `bapenda-profile`.
- Tidak ada tabel/modul baru; pakai endpoint pengelolaan aplikasi di core SELOKO.

---

## 7. Di Luar Cakupan PRD Ini
- **Cek Pajak Kendaraan, Info Kendaraan, log cek pajak petugas** (`VehicleTaxCheckLog`, proxy API Samsat) → PRD 03 `simpad`.
- **User, login, audit log, dashboard stats** → core SELOKO (PRD 01).

## 8. Keputusan
- ✅ **Role UPTD:** Tidak dipakai di modul Bapenda Profile. Scope konten cukup per pemilik (§4). Bila nanti dibutuhkan, keterikatan user ke UPTD diatur di core SELOKO, bukan di modul bapenda.
- ✅ **Mekanisme `type` konten:** enum PostgreSQL `ArticleType`, dapat ditambah lebih dari 2 jenis (lihat §3).
