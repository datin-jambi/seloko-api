# Changelog Kontrak API

Catatan perubahan kontrak yang **terlihat oleh klien** (path, query, body, bentuk respons, guard).
Perubahan internal yang tidak mengubah kontrak tidak perlu dicatat di sini.

Format tanggal: `YYYY-MM-DD`. Urut terbaru di atas.

---

## 2026-10-21 — Media & Fasilitas Produk (LJ-1.5)

**Berubah — PERILAKU KONTRAK**
- `images[].isPrimary` kini **dinormalisasi server** menjadi tepat satu per produk: bila
  klien mengirim beberapa `true`, hanya yang `sortOrder` terkecil dipertahankan; bila tak
  ada yang bertanda, gambar pertama otomatis diangkat. Sebelumnya semua `true` tersimpan
  apa adanya sehingga "gambar utama" ambigu di katalog publik.
- `coverUrl`/`coverFileId` **diisi otomatis** dari gambar primer bila tidak dikirim eksplisit.

**Catatan** — tabel `lapak_product_images` & `lapak_product_facilities` sudah ada sejak
LJ-1.2; unggah berkas memakai modul core `POST /api/storage/upload` (folder per aplikasi),
bukan endpoint khusus lapak. LJ-1.5 menutup celah integritas `isPrimary` dan konsistensi
`coverUrl`.

---

## 2026-10-21 — Persyaratan/Dokumen Produk (LJ-1.4)

**Berubah — VALIDASI KONTRAK**
- `requirements[].options` kini **wajib** bila `fieldType: "SELECT"` (tanpa opsi, form publik
  tak bisa dirender) dan **dilarang** pada tipe lain (`400 VALIDATION_ERROR`). Sebelumnya
  kombinasi keduanya diterima dan menyimpan data mati.

**Catatan** — model `lapak_product_requirements` dan nested CRUD sudah ada sejak LJ-1.2;
LJ-1.4 menutup celah validasi tersebut dan memperluas cakupan smoke ke kelima tipe
(`FILE`/`TEXT`/`NUMBER`/`DATE`/`SELECT`) termasuk penjagaan `sortOrder`.

---

## 2026-10-21 — Persetujuan Tarif Terpisah Lapak (LJ-1.3)

**Ditambah** — prefix `/api/lapak/rates` (8 endpoint)
- `GET /` (filter `productId`, `status`, paginasi), `GET /:id` — lingkup OPD otomatis.
- `POST /product/:productId` — tarif baru tanpa mengubah status produk.
- `PUT /:id` — hanya untuk tarif belum disetujui (`409` bila APPROVED/PUBLISHED).
- `POST /:id/revise` — membuat baris baru `PENDING_REVIEW`; baris lama tetap aktif.
- `PATCH /:id/status/:action` — `submit` | `approve` | `reject` (`reject` wajib `note`).
- `PATCH /:id/deactivate` (`409` bila tarif aktif terakhir), `DELETE /:id` (soft-delete).

**Berubah — PERILAKU KONTRAK**
- **Tarif publik kini STRICT:** `GET /lapak/products/public` dan `/public/:slug` hanya
  menyajikan tarif `APPROVED`/`PUBLISHED`. Sebelumnya `DRAFT` ikut tampil. Produk terbit
  tanpa tarif terapprove menyajikan `rates: []` dan `startingPrice: 0`.
- **Filter waktu dinamis:** batas `effectiveFrom` dievaluasi per-request. Sebelumnya berupa
  konstanta modul yang membeku saat server start sehingga tarif baru tak pernah muncul
  sampai restart.

**Keputusan kontrak**
- Tarif adalah entitas ber-status sendiri: revisi harga tidak menurunkan status produk.
- `admin-opd` memegang `product:approve` untuk OPD-nya sendiri; batasnya adalah **lingkup OPD**,
  bukan kepemilikan izin.
- Selama revisi berjalan, publik tetap melihat harga lama; baris lama dinonaktifkan otomatis
  saat revisi **disetujui**, sehingga tidak ada jeda produk tanpa harga.

---

## 2026-10-20 — Modul Produk Katalog Lapak (LJ-1.2)

**Ditambah** — prefix `/api/lapak/products` (8 endpoint)
- Publik: `GET /public` (filter kategori/OPD/harga + paginasi), `GET /public/:slug`.
- CMS (`product:*`): list (tersaring lingkup OPD otomatis), detail, create + anak-anak,
  update (replace-set anak), `PATCH /:id/status/:action`, soft-delete.
- DB: 6 tabel — `lapak_products`, `lapak_product_rates`, `lapak_product_addons`,
  `lapak_product_requirements`, `lapak_product_images`, `lapak_product_facilities`
  (migrasi `20261020090000_add_lapak_products`).

**Keputusan kontrak**
- Tiga atribut produk (`pricingUnit/availabilityType/fulfillmentType`) **diwarisi nilai bawaan
  kategori** bila tidak dikirim; `null` eksplisit diperlakukan sama dengan tidak dikirim.
- Produk hanya boleh diedit pada `DRAFT`/`REJECTED`; hapus ditolak `409` saat masih `PUBLISHED`.
- `DELETE /lapak/categories/:id` kini ditolak `409` bila masih ada produk aktif yang memakainya.
- Tarif publik sementara menyertakan status `DRAFT` — pengetatan `APPROVED` dilakukan di LJ-2
  bersama alur persetujuan tarif terpisah (PRD 04 §C).

---

## 2026-10-19 — Modul Kategori Layanan Lapak (LJ-1.1, Fase 1 dimulai)

**Ditambah** — aplikasi `lapak-jambi-web`, prefix `/api/lapak/categories` (9 endpoint)
- Publik: `GET /public`, `GET /public/:slug`.
- CMS (`category:*`, hanya Bapenda): list, detail, create, `PATCH /reorder`, update,
  `PATCH /:id/active`, soft-delete.
- DB: tabel `lapak_categories` + 3 kolom nilai bawaan produk
  (`default_pricing_unit`, `default_availability_type`, `default_fulfillment_type`) — migrasi
  `20261019090000_add_lapak_categories` dan `20261019093000_add_lapak_category_defaults`.
- Seed: 8 kategori sesuai PRD 04 §3.

**Keputusan kontrak**
- `slug` unik per aplikasi; bentrok **ditolak** (bukan akhiran `-2`) — URL publik tidak berubah
  diam-diam. Slug milik kategori terhapus boleh dihidupkan kembali lewat create.
- Objek publik hanya 5 field (`id`, `name`, `slug`, `description`, `icon`).
- `default*` nullable: `null` = OPD memilih sendiri saat membuat produk (LJ-1.2).

---

## 2026-10-18 — Registrasi akun warga + kolom NIK

**Ditambah**
- `POST /api/auth/register` — pendaftaran mandiri akun `PUBLIC`. Hanya di aplikasi ber-audience
  `PUBLIC`; role ditetapkan server (default `warga`), bukan dari body. Body:
  `email`, `password`, `passwordConfirm`, `fullName`, `phoneNumber?`, `nik?`.
- Kolom `users.nik` (`VARCHAR(16)`, **unique**, nullable) lewat migrasi aditif
  `20261018100000_add_user_nik`.

**Diubah — aditif**
- `GET /api/users`, `GET /api/users/:id`, `POST/PATCH` — objek user kini membawa `nik`, selalu
  **termasking** (`••••••••••••1234`). Nilai penuh tidak pernah keluar lewat API.
- `PATCH /api/users/:id` menerima `nik` (16 digit atau `null` untuk mengosongkan).

**Dampak ke klien**
- `nik` **wajib ada** di response schema (`string | null`) — klien yang memvalidasi ketat perlu
  menambahkannya. Nilainya termasking, jadi tidak bisa dipakai sebagai kunci pencarian.
- `emailVerifiedAt` pada akun hasil registrasi bernilai `null`: verifikasi email/OTP belum
  dikerjakan (backlog `LJ-5.5`). Frontend sebaiknya tidak memblokir transaksi karenanya.

---

## 2026-10-18 — RBAC Lapak Jambi (aset daerah, bukan UMKM)

**Diubah — breaking untuk seed RBAC Lapak**
- Aplikasi `lapak-jambi-web`: permission `merchant:*`, `product:*` lama, `order:*` lama diganti
  13 entity baru sesuai PRD 04 §6 (73 permission).
- Role `pedagang` dihapus; diganti `warga` (PUBLIC) + `admin-opd`, `manajer-opd`,
  `petugas-lokasi` (INTERNAL).
- Menu CMS `lapak-jambi-web` disusun ulang: 20 item berawalan `/lapak` (Katalog, Transaksi,
  Master, Konten OPD, Laporan).

**Dampak ke klien**
- Frontend Lapak harus memakai nama role & permission baru. Token lama yang memegang role
  `pedagang` tidak valid lagi setelah seed ulang.

---

## 2026-10-18 — `GET /users/:id/roles` + lingkup OPD pada penugasan role

**Ditambah**
- `GET /api/users/:id/roles` — daftar penugasan role dengan paginasi (`page`, `limit`),
  filter (`applicationId`, `roleId`, `organizationId`, `status`), `sortBy`
  (`createdAt`/`expiresAt`/`application`), dan `summary` lintas halaman
  (`totalAssignments`, `activeAssignments`, `expiredAssignments`, `totalApplications`,
  `totalOrganizations`, `globalAssignments`).
- Permission baru: `user-app-role:list`.

**Diubah — aditif**
- `POST /api/users/:id/roles` menerima `organizationIds?: string[]` (maks 50, tanpa duplikat).
  Kosong = seluruh OPD. Daftar baru **mengganti** lingkup sebelumnya.
- `POST /api/users/:id/roles` — `expiresAt` kini menerima `null` secara eksplisit.
- `GET /api/users/:id` dan `GET /api/users/:id/roles` — setiap role kini membawa
  `organizations[]` (`id`, `code`, `name`, `shortName`). Array kosong = berlaku seluruh OPD.

**Error baru**
- `400` bila `organizationIds` memuat OPD yang tidak ada.

**Dampak ke klien**
- Response schema bersifat ketat: `organizations` **wajib ada** pada setiap item role. Klien yang
  memvalidasi respons dengan schema lama tetap kompatibel selama ia mengabaikan field baru.
- Frontend CMS disarankan menampilkan badge "Semua OPD" ketika `organizations` kosong, agar tidak
  terbaca sebagai "tidak punya akses".

---

## 2026-10-18 — Modul Organizations (baru)

**Ditambah** — 8 endpoint `/api/organizations`:
`GET /public`, `GET /public/:code` (publik), `GET /`, `GET /:id`, `POST /`, `PUT /:id`,
`PATCH /:id/active`, `DELETE /:id` (CMS, permission `organization:*`).
Permission baru di aplikasi `seloko`: `organization:create|read|update|delete|list`.
Menu baru: `sistem.organisasi` → `/seloko/sistem/organisasi`.

**Dampak ke klien**
- Tidak ada endpoint lama yang berubah. Tabel `organizations` & `user_app_role_organizations`
  ditambahkan lewat migrasi aditif `20261017120000_add_organizations`.

---

## 2026-10-17 — Modul Halaman Profil (belum tercatat sebelumnya)

**Ditambah** — 8 endpoint `/api/bapenda/pages` (2 publik, 6 CMS). Permission `page:*`
(grup `publishable`), menu `konten.halaman` → `/bapenda/halaman`.

---

## 2026-10-17 — Path menu CMS berawalan aplikasi

**Diubah — breaking untuk navigasi**
- `menus.path` internal kini berawalan kode aplikasi: `/seloko/...`, `/bapenda/...`, `/lapak/...`
  (prefix `/cms/` dibuang). Contoh: `/cms/berita` → `/bapenda/berita`.
- `dasbor` → `dashboard` (segmen path, bukan kode menu).
- Tautan eksternal (`isExternal`) dan aplikasi warga (`lapak-jambi-app`) tidak berubah.

**Dampak ke klien**
- Route frontend harus disesuaikan; `baseUrl` aplikasi tetap digabung dengan `path` seperti biasa.

---

## 2026-10-17 — Halaman profil & sanitasi HTML

**Diubah — perilaku**
- Sanitasi HTML dipindah ke `src/common/utils/html.ts` dan diperluas: `colspan`/`rowspan` serta
  `style` (`color`, `background-color`, `text-align`, `width`, `min-width`) kini dipertahankan
  dengan nilai berpola. Sebelumnya atribut-atribut itu dibuang, sehingga tabel halaman Pejabat
  rusak (1305 → 689 karakter).
- Berlaku untuk `news.content` dan `pages.content`.

---

## 2026-10-12 — `type` pada artikel (berita vs artikel)

**Ditambah**
- Enum PostgreSQL `ArticleType` (`NEWS`, `ARTICLE`) + kolom `type` pada `articles` dan
  `article_categories`.
- Unique slug menjadi per `(applicationId, type, slug)`; index
  `(applicationId, type, status, publishedAt)`.
- `excerpt` diperlebar dari 500 → 1000 karakter.

**Dampak ke klien**
- Respons artikel kini memuat `type`. Kategori hanya berlaku dalam `type` yang sama.

---

## Cara menambah entri

1. Tambahkan bagian baru di atas dengan tanggal hari ini.
2. Tulis **Ditambah / Diubah / Dihapus / Error baru / Dampak ke klien** — pilih yang relevan.
3. Sebut path dan nama field secara eksplisit; hindari "beberapa endpoint".
4. Tandai **breaking** bila klien lama akan gagal.
5. Perbarui juga berkas modulnya di `docs/api/<app>/<modul>.md`.
