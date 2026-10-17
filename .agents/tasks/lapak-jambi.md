# 🛒 Pipeline Tugas — Lapak Jambi

- **PRD:** [`../prd/04-lapak-jambi.prd.md`](../prd/04-lapak-jambi.prd.md) · **Aturan pipeline:** [`README.md`](./README.md)
- **Kode aplikasi (MVP):** `lapak-jambi-web` · **Prefix API:** `/api/lapak` · **Prefix menu CMS:** `/lapak/...`
- **Target MVP:** masyarakat dapat bertransaksi (katalog → keranjang per OPD → checkout → SKRD → transfer → tiket) dan Bapenda/OPD melihat arus penerimaan secara transparan lewat seloko-web. Frontend publik prototipe: `lj-app`.
- **Tugas aktif:** `LJ-0.6`

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
| LJ-0.6 | Seed RBAC `lapak-jambi-web` baru (permission §6 PRD, role `admin-opd`/`manajer-opd`/`petugas-lokasi`/`warga`, menu `/lapak/...`, akun uji multi-OPD); hapus merchant/pedagang | 0.2, 0.5 | `menus.check`, smoke `auth` | ⏳ |
| LJ-0.7 | Registrasi akun PUBLIC `POST /api/auth/register` (+ kolom `users.nik` opsional, unik, dimasking) | — | smoke `register` | ⏳ |

## Fase 1 — Katalog
| ID | Tugas | Butuh | Bukti selesai | Status |
|---|---|---|---|---|
| LJ-1.1 | Kategori layanan (Bapenda): skema, CRUD, publik, seed 8 kategori | 0.6 | smoke `lapak-categories` | ⏳ |
| LJ-1.2 | Produk (per OPD, lingkup OPD, alur `DRAFT→PENDING_REVIEW→APPROVED→PUBLISHED`) | 1.1, 0.3 | smoke `lapak-products` | ⏳ |
| LJ-1.3 | Tarif (status + `effectiveFrom`) & layanan tambahan | 1.2 | smoke `lapak-rates` | ⏳ |
| LJ-1.4 | Persyaratan/dokumen per produk | 1.2 | smoke `lapak-products` | ⏳ |
| LJ-1.5 | Media (ImageKit) & fasilitas produk | 1.2 | smoke `lapak-products` | ⏳ |
| LJ-1.6 | API katalog publik (list/filter/cari, detail by slug, profil OPD) | 1.2–1.5 | smoke `lapak-catalog` | ⏳ |
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
| 2026-10-18 | LJ-0.5 | smoke `users-org` 13 lolos · total `db:smoke` 130 lolos · typecheck/test/build 0 | `POST /users/:id/roles` menerima `organizationIds[]` (mengganti lingkup, kosong = seluruh OPD; OPD tak dikenal → 400). Endpoint baru `GET /users/:id/roles` dengan paginasi + filter `applicationId`/`roleId`/`organizationId`/`status` + `sortBy` (`createdAt`/`expiresAt`/`application`) dan `summary` lintas halaman (total/aktif/kedaluwarsa/aplikasi/OPD/global). Detail user & grup aplikasi kini membawa `organizations` per penugasan. Permission `user-app-role:list`.
| 2026-10-18 | LJ-0.4 | smoke `organizations` 18 lolos · total `db:smoke` 117 lolos · `menus.check` 22 ok · typecheck/test/build 0 | Modul core `src/modules/core/organizations/` (4-layer) + `/api/organizations` (publik: list & profil via kode; CMS: CRUD, toggle aktif, soft-delete). Permission `organization:*` (28 permission seloko), menu `sistem.organisasi`. Aturan: kode unik global; induk wajib ada; induk ≠ diri sendiri; siklus ditolak; nonaktifkan induk menonaktifkan turunan; hapus ditolak bila masih punya turunan/penugasan (abaikan yang sudah soft-delete). Dua bug ditemukan smoke & diperbaiki: respons Prisma membawa `Date` (dibungkus `iso()` di semua jalur) dan hitungan turunan ikut menghitung baris terhapus. |
