# 🛒 Pipeline Tugas — Lapak Jambi

- **PRD:** [`../prd/04-lapak-jambi.prd.md`](../prd/04-lapak-jambi.prd.md) · **Aturan pipeline:** [`README.md`](./README.md)
- **Kode aplikasi (MVP):** `lapak-jambi-web` · **Prefix API:** `/api/lapak` · **Prefix menu CMS:** `/lapak/...`
- **Target MVP:** masyarakat dapat bertransaksi (katalog → keranjang per OPD → checkout → SKRD → transfer → tiket) dan Bapenda/OPD melihat arus penerimaan secara transparan lewat seloko-web. Frontend publik prototipe: `lj-app`.
- **Tugas aktif:** `LJ-1.7`

Legenda: `⏳` belum · `🟡` dikerjakan · `✅` selesai · `⛔` batal

---

## Fase 0 — Fondasi Core
| ID | Tugas | Butuh | Bukti selesai | Status |
|---|---|---|---|---|
| LJ-0.1 | Skema `organizations` (OPD/UPTD, hierarki) + `user_app_role_organizations` (lingkup penugasan) + migrasi | — | `prisma validate`, migrasi ter-deploy, drift 0, typecheck | ✅ |
| LJ-0.2 | Seed OPD awal dari proposal (`prisma/seeds/core/organizations.json`) | 0.1 | `db:seed` 2× idempoten | ✅ |
| LJ-0.3 | Resolver lingkup OPD `resolveOrgScope()` + `assertOrgInScope()` (`src/common/guards/org-scope.ts`) | 0.1 | `org-scope.check.ts` di `npm test` | ✅ |
| LJ-0.4 | API core OPD `/api/organizations` (CRUD Bapenda + daftar publik), permission `organization:*` di `seloko`, menu `/seloko/...` | 0.1 | smoke `organizations` | ✅ |
| LJ-0.5 | Penugasan role berlingkup OPD: `POST /api/users/:id/roles` terima `organizationIds[]`, detail user menampilkan OPD per penugasan | 0.1, 0.3 | smoke `users-org` | ✅ |
| LJ-0.6 | Seed RBAC `lapak-jambi-web` baru (permission §6 PRD, role `admin-opd`/`manajer-opd`/`petugas-lokasi`/`warga`, menu `/lapak/...`, akun uji multi-OPD); hapus merchant/pedagang | 0.2, 0.5 | `menus.check`, smoke `auth` | ✅ |
| LJ-0.7 | Registrasi akun PUBLIC `POST /api/auth/register` (+ kolom `users.nik` opsional, unik, dimasking) | — | smoke `register` | ✅ |
| LJ-0.8 | Dokumentasi API di repo: `docs/api/` (per aplikasi + per modul) & aturan update wajib | — | folder lengkap + rule di `.agents` | ✅ |

## Fase 1 — Katalog
| ID | Tugas | Butuh | Bukti selesai | Status |
|---|---|---|---|---|
| LJ-1.1 | Kategori layanan (Bapenda): skema, CRUD, publik, seed 8 kategori | 0.6 | smoke `lapak-categories` | ✅ |
| LJ-1.2 | Produk (per OPD, lingkup OPD, alur `DRAFT→PENDING_REVIEW→APPROVED→PUBLISHED`) — tarif/addon/persyaratan/media/fasilitas ikut di sini | 1.1, 0.3 | smoke `lapak-products` 37/37 | ✅ |
| LJ-1.3 | Tarif (status + `effectiveFrom`) & layanan tambahan | 1.2 | smoke `lapak-rates` 25/25 | ✅ |
| LJ-1.4 | Persyaratan/dokumen per produk | 1.2 | smoke `lapak-products` 42/42 | ✅ |
| LJ-1.5 | Media (ImageKit) & fasilitas produk | 1.2 | smoke `lapak-products` 47/47 | ✅ |
| LJ-1.6 | API katalog publik (list/filter/cari, detail by slug, profil OPD) | 1.2–1.5 | smoke `lapak-catalog` 15/15 | ✅ |
| LJ-1.7 | Seed produk & tarif dari infografis proposal | 1.3 | `db:seed` idempoten | ⏳ |

## Fase 2 — Transaksi
| ID | Tugas | Butuh | Bukti selesai | Status |
|---|---|---|---|---|
| LJ-2.1 | Jam operasional & tanggal tutup | 1.2 | smoke `lapak-availability` | ⏳ |
| LJ-2.2 | Ketersediaan + reservasi (`tstzrange` + exclusion constraint, kuota, hold) | 2.1 | smoke `lapak-availability` (uji bentrok) | ⏳ |
| LJ-2.3 | Keranjang (satu keranjang per OPD per warga) | 1.3 | smoke `lapak-cart` | ⏳ |
| LJ-2.4 | Quote & checkout → pesanan (snapshot harga & pemohon) | 2.2, 2.3 | smoke `lapak-orders` | ⏳ |
| LJ-2.5 | Pengaturan SKRD (penerbit Bapenda/OPD) + penomoran gapless + terbit saat checkout | 2.4 | smoke `lapak-skrd` | ⏳ |
| LJ-2.6 | Pembayaran transfer manual: unggah bukti → konfirmasi OPD | 2.5 | smoke `lapak-payments` | ⏳ |
| LJ-2.7 | Tiket/kontrak QR + check-in petugas | 2.6 | smoke `lapak-tickets` | ⏳ |
| LJ-2.8 | Worker kedaluwarsa (hold & pesanan belum bayar) | 2.4 | check worker | ⏳ |
| LJ-2.9 | Pesanan saya (warga) + kelola pesanan CMS (lingkup OPD) | 2.4 | smoke `lapak-orders` | ⏳ |

## Fase 3 — Monitoring PAD (bagian MVP)
| ID | Tugas | Butuh | Bukti selesai | Status |
|---|---|---|---|---|
| LJ-3.1 | Dashboard penerimaan per OPD/kategori/periode (lingkup OPD) | 2.6 | smoke `lapak-dashboard` | ⏳ |
| LJ-3.2 | Daftar transaksi lintas OPD + ekspor | 2.6 | smoke `lapak-dashboard` | ⏳ |
| LJ-3.3 | Ringkasan transparansi PAD publik (agregat, tanpa PII) | 3.1 | smoke `lapak-dashboard` | ⏳ |

## Fase 4 — Pasca-MVP (rencana; skema boleh disiapkan lebih awal)
| ID | Tugas | Status |
|---|---|---|
| LJ-4.1 | Konten per OPD: berita/artikel (`shared/article` + `organizationId`), galeri, banner | ⏳ |
| LJ-4.2 | Ulasan & rating produk (hanya dari pesanan selesai) + moderasi | ⏳ |
| LJ-4.3 | Komentar berita | ⏳ |
| LJ-4.4 | Wishlist & notifikasi | ⏳ |
| LJ-4.5 | Target penerimaan OPD per tahun | ⏳ |

## Fase 5 — Lanjutan
| ID | Tugas | Status |
|---|---|---|
| LJ-5.1 | Payment gateway VA/QRIS Bank Jambi (adapter + callback) | ⏳ |
| LJ-5.2 | Gabung `lapak-jambi-web` + `lapak-jambi-app` & strategi auth akun PUBLIC lintas aplikasi | ⏳ |
| LJ-5.3 | Aplikasi mobile | ⏳ |
| LJ-5.4 | `retribution_objects` sebagai master lintas domain | ⏳ |
| LJ-5.5 | Verifikasi email/OTP akun PUBLIC; NPWP badan usaha | ⏳ |

---

## Log
| Tanggal | ID | Bukti | Catatan |
|---|---|---|---|
| 2026-10-17 | LJ-0.1 | `prisma validate` ok · migrasi `20261017120000_add_organizations` deploy · drift 0 · typecheck 0 | Tabel `organizations` (+enum `organization_type`, hierarki `parent_id`) & `user_app_role_organizations`. Murni aditif — tidak menyentuh tabel lama. Shadow DB sekali pakai `seloko_shadow_lj01`, bukan `DATABASE_URL`. |
| 2026-10-17 | LJ-0.2 | `db:seed` 2× → 9 organisasi, idempoten | Seed dari infografis proposal: BPKPD, BPSDM, Badan Penghubung, Disbudpar, Dinkes, Bapelkes (UPTD di bawah Dinkes), Diskop, Dinsos, Dishut. |
| 2026-10-17 | LJ-0.3 | `org-scope.check` ok · `npm test` 0 · `build` 0 · `db:smoke` 99 lolos | `resolveOrgScope`, `assertOrgInScope`, `buildOrgScope`, `isOrgInScope`, `orgScopeFilter`. Aturan: tanpa baris OPD = seluruh OPD; union antar penugasan; lingkup kosong gagal tertutup (`{ in: [] }`). |
| 2026-10-21 | LJ-1.6 | smoke `lapak-catalog` **15/15** · total `db:smoke` **295 lolos** (0 gagal) · `docs.check` 16 modul / 123 endpoint / 439 field · typecheck/test/build 0 | Modul baru `src/modules/lapak/catalog/` (schema+service+controller+routes, 2 endpoint publik): `GET /lapak/organizations/:code` (profil + `productCount`) dan `GET /lapak/organizations/:code/products` (katalog OPD). Memakai ulang `getPublicProducts()` dengan `organization` dipaksa ke `:code` — tidak menduplikasi logika filter. Suite smoke baru `lapak-catalog` (16). Dokumentasi `lapak/catalog.md`. | **Keputusan arsitektur:** endpoint ditaruh di modul lapak, bukan `core/organizations` — bila di core, core harus mengimpor lapak (coupling terbalik). **Keputusan kontrak:** kode OPD salah → 404, bukan katalog kosong; katalog kosong menyamarkan typo di URL SEO publik. `productCount` sengaja dihitung per-aplikasi lapak, bukan seluruh produk OPD. Smoke menangkap satu kesalahan saya: prefix route `/api/lapak` (bukan `/api/lapak/organizations`) karena `:code` menempati segmen pertama — check.ts menolak dokumen yang tidak cocok dengan kode. |
| 2026-10-21 | LJ-1.5 | smoke `lapak-products` **47/47** (naik dari 42) · total `db:smoke` **280 lolos** (0 gagal) · typecheck/test/build 0 | Audit: tabel images/facilities + Zod + nested CRUD sudah ada sejak LJ-1.2; unggah berkas memakai core `POST /api/storage/upload` (folder per aplikasi), bukan endpoint lapak baru. Celah nyata yang ditutup: `isPrimary` tak pernah divalidasi → klien bisa kirim 3 gambar `true` dan katalog punya 3 "gambar utama"; kini dinormalisasi (tepat satu, `sortOrder` terkecil diprioritaskan, otomatis diangkat bila tak ada yang ditandai). `coverUrl`/`coverFileId` diisi otomatis dari gambar primer. Smoke +5: 3 gambar semua `true` → 1 primer, tanpa primer → diangkat otomatis, coverUrl sinkron. Dokumentasi: seksi "Media Produk" di `products.md` + CHANGELOG. | Prinsip normalisasi dipilih **menurunkan, bukan menolak**: UI checkbox "jadikan utama" gampang terkirim ganda; menolak 400 akan memaksa klien menebak. Berbeda dari LJ-1.4 (SELECT tanpa opsi → 400) karena di situ data mustahil dirender, sedangkan di sini cukup dipilih satu. |
| 2026-10-21 | LJ-1.4 | smoke `lapak-products` **42/42** (naik dari 37) · total `db:smoke` **275 lolos** (0 gagal) · `docs.check` 15 modul / 121 endpoint / 432 field · typecheck/test/build 0 | Model `lapak_product_requirements` + nested CRUD sudah ada sejak LJ-1.2; LJ-1.4 menutup celah validasi: `options` **wajib** untuk `SELECT` (tanpa opsi form publik mustahil dirender) dan **dilarang** pada tipe lain (data mati) via `superRefine`. Smoke diperluas ke kelima tipe (`FILE`/`TEXT`/`NUMBER`/`DATE`/`SELECT`), penjagaan `sortOrder`, plus 2 asersi penolakan 400. Dokumentasi `products.md` diperjelas, CHANGELOG mencatat perubahan validasi. | Temuan: tugas ini ternyata 90% sudah terwujud di LJ-1.2 — risiko over-engineering bila membuat modul baru. Pendekatan benar: audit dulu apa yang belum ada, baru isi celah. Cleanup smoke berbasis pola (`startsWith("produk-")`) otomatis menyapu produk gagal-validasi. |
| 2026-10-21 | LJ-1.3 | smoke `lapak-rates` 25/25 · total `db:smoke` **270 lolos** (0 gagal) · `docs.check` 15 modul / 121 endpoint / 432 field · typecheck/test/build 0 | Modul `/api/lapak/rates` 8 endpoint: list/detail, tambah tarif per produk, ubah (hanya belum disetujui), `revise` (baris baru PENDING_REVIEW), transisi `submit|approve|reject`, deactivate, soft-delete. Tarif kini entitas ber-status sendiri: revisi harga tidak menurunkan status produk. `admin-opd` memegang `product:approve` untuk OPD-nya; batasnya lingkup OPD. Dokumentasi `lapak/rates.md` + CHANGELOG memuat dua **perubahan kontrak**. Cleanup smoke diubah jadi berbasis pola (bukan daftar manual). | **Dua bug nyata tertangkap:** (1) `PUBLIC_RATE_FILTER` berupa konstanta modul sehingga `new Date()` membeku saat server start — tarif yang dibuat setelahnya tak pernah tampil sampai restart (gejala menyesatkan: probe langsung selalu benar, HTTP selalu kosong); diperbaiki jadi fungsi `publicRateFilter()` per-request. (2) `reviseRate` langsung menonaktifkan tarif lama sehingga produk tampak tanpa harga selama revisi; dipindah ke saat approve. **Pelajaran besar:** `tsx watch` di Windows tidak andal me-reload perubahan service — banyak jam terbuang mengejar "bug" yang sebenarnya proses basi; selalu restart server dev sebelum menyimpulkan bug. Jangan pernah menaruh `new Date()` di konstanta modul. |
| 2026-10-20 | LJ-1.2 | smoke `lapak-products` 37/37 · total `db:smoke` **245 lolos** · `menus.check` 22 ok · `docs.check` 14 modul / 113 endpoint / 406 field · typecheck/test/build 0 | 6 tabel produk (migrasi `20261020090000_add_lapak_products`, drift 0). Modul 8 endpoint: publik (katalog + filter kategori/OPD/harga) & CMS (`product:*`, replace-set anak, transisi status pakai izin `product:approve|reject|publish` dalam lingkup OPD). Atribut produk diwarisi bawaan kategori. Penjaga `DELETE /categories/:id` → 409 saat dipakai produk aktif. Dokumentasi `lapak/products.md`. | Empat bug tertangkap smoke: (1) `syncChildren` salah nama model Prisma → peta `CHILD_MODELS`; (2) `null` eksplisit ditolak Zod → `nullable()`; (3) tarif publik kosong (filter APPROVED) → DRAFT sementara ikut sampai LJ-2; (4) suite tak idempoten (slug bentrok antar-run) → pembersihan awal hard-delete. Pelajaran: suite smoke WAJIB idempoten sejak baris pertama. |
| 2026-10-19 | LJ-1.1 | smoke `lapak-categories` 29/29 · total `db:smoke` **208 lolos** · `menus.check` 22 ok · `docs.check` 13 modul / 105 endpoint / 355 field · typecheck/test/build 0 | Tabel `lapak_categories` + 3 kolom bawaan (2 migrasi aditif, drift 0). Modul 4-layer 9 endpoint (`category:*`, khusus Bapenda) + publik. Seed 8 kategori PRD §3. Dokumentasi: folder `docs/api/lapak/` baru. | Dua bug tertangkap smoke: (1) respons schema `/public/:slug` tak cocok shape publik → 500, diperbaiki dengan envelope `PublicGetCategoryResponseSchema`; (2) create menolak slug milik baris soft-delete → kini revive. Insiden infrastruktur: kontainer Docker Postgres baru (volume kosong) merebut port 5432 menggantikan Laragon yang crash (0xC0000142); `.env` tetap diarahkan ke Laragon, kontainer distop. Pelajaran: edit file migrasi setelah dijalankan = dilarang; koreksi lewat migrasi kedua. |
| 2026-10-18 | LJ-0.7 | smoke `register` 19 lolos · total `db:smoke` **179 lolos** · `menus.check` 22 ok · `docs.check` 96 endpoint / 338 field · typecheck/test/build 0 | `POST /api/auth/register` (hanya aplikasi PUBLIC; role ditetapkan server; `passwordConfirm`) + kolom `users.nik` (VARCHAR(16), unique, nullable) via migrasi aditif `20261018100000_add_user_nik`. NIK **selalu termasking** di API (`••••••••••••1234`); `PATCH /users/:id` menerima `nik`. Dokumentasi: `core/auth.md` +6 endpoint, `core/users.md`, CHANGELOG. | Pesan konflik sengaja umum ("Email atau NIK sudah terdaftar") agar tidak membocorkan NIK orang lain. `emailVerifiedAt` null — verifikasi email/OTP tetap backlog `LJ-5.5`. Prisma generate gagal EPERM lagi (server dev user di :3000) tapi client sudah memuat `nik`. |
| 2026-10-18 | LJ-0.6 | smoke `lapak-rbac` 30 lolos · total `db:smoke` **160 lolos** · `menus.check` 22 ok · typecheck/test/build 0 | Seed RBAC Lapak baru: 13 entity (category, retribution-object, skrd-setting, product, order, payment, ticket, news, article, gallery, banner, review, report) = 73 permission; role `admin-opd`/`manajer-opd`/`petugas-lokasi`/`warga` menggantikan `pedagang`; menu CMS 20 item berawalan `/lapak`. 5 akun uji berlingkup OPD. **Tiga perbaikan seeder:** (1) `allowedEntities` — filter entity agar `admin-opd` tak otomatis mewarisi izin master Bapenda; (2) `organizationCodes` di users.json → baris `user_app_role_organizations`, disinkron penuh tiap seed; (3) pemangkasan permission/role usang agar entity `merchant` & role `pedagang` benar-benar hilang dari DB. | Temuan uji: pegawai **selalu** login lewat `seloko`, izin modul dibaca dari aplikasi pemilik via `GET /permissions/:appId/me` — bukan dari header `X-App-Code`. Premis uji awal salah, sudah dikoreksi. |
| 2026-10-18 | LJ-0.8 | Folder `docs/api/` dibuat: `README.md` (indeks + aturan wajib), `00-konvensi.md`, `CHANGELOG.md`, `core/` (8 modul + README), `bapenda/` (4 modul + README) — total 95 endpoint terdokumentasi. Aturan 'dokumentasi ikut berubah' ditambahkan ke `.agents/rules/seloko-api-general.md`. | Dokumentasi kontrak tinggal di repo; Apidog = salinan untuk dibaca/dicoba. Selisih dengan Apidog dicatat di `docs/api/README.md`. |
| 2026-10-18 | LJ-0.5 | smoke `users-org` 13 lolos · total `db:smoke` 130 lolos · typecheck/test/build 0 | `POST /users/:id/roles` menerima `organizationIds[]` (mengganti lingkup, kosong = seluruh OPD; OPD tak dikenal → 400). Endpoint baru `GET /users/:id/roles` dengan paginasi + filter `applicationId`/`roleId`/`organizationId`/`status` + `sortBy` (`createdAt`/`expiresAt`/`application`) dan `summary` lintas halaman (total/aktif/kedaluwarsa/aplikasi/OPD/global). Detail user & grup aplikasi kini membawa `organizations` per penugasan. Permission `user-app-role:list`.
| 2026-10-18 | LJ-0.4 | smoke `organizations` 18 lolos · total `db:smoke` 117 lolos · `menus.check` 22 ok · typecheck/test/build 0 | Modul core `src/modules/core/organizations/` (4-layer) + `/api/organizations` (publik: list & profil via kode; CMS: CRUD, toggle aktif, soft-delete). Permission `organization:*` (28 permission seloko), menu `sistem.organisasi`. Aturan: kode unik global; induk wajib ada; induk ≠ diri sendiri; siklus ditolak; nonaktifkan induk menonaktifkan turunan; hapus ditolak bila masih punya turunan/penugasan (abaikan yang sudah soft-delete). Dua bug ditemukan smoke & diperbaiki: respons Prisma membawa `Date` (dibungkus `iso()` di semua jalur) dan hitungan turunan ikut menghitung baris terhapus. |
