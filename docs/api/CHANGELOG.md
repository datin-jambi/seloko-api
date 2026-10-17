# Changelog Kontrak API

Catatan perubahan kontrak yang **terlihat oleh klien** (path, query, body, bentuk respons, guard).
Perubahan internal yang tidak mengubah kontrak tidak perlu dicatat di sini.

Format tanggal: `YYYY-MM-DD`. Urut terbaru di atas.

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
