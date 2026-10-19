# SELOKO API — Agent Instructions & Conventions

Selamat datang di proyek **SELOKO API** (Backend Inti & Identity Gateway BPKPD Provinsi Jambi).

Sebelum melakukan tugas pengkodean, perbaikan, atau penambahan modul pada repositori ini, setiap AI Agent **wajib** membaca dan mematuhi aturan serta skill yang telah disiapkan (penjelasan detail sistem agen dapat dibaca di [`.agents/README.md`](file:///.agents/README.md)):

---

## 📌 Panduan & Aturan Resmi Proyek
### A. Living PRD & Arsitektur Produk:
- **Master PRD Index:** Buka [`.agents/prd/README.md`](file:///.agents/prd/README.md)
  - Arsitektur Super App BPKPD Provinsi Jambi.
  - Domain 1: Identity & Multi-Tenancy Gateway ([`01-seloko-identity.prd.md`](file:///.agents/prd/01-seloko-identity.prd.md)).
  - Domain 2: Portal Bapenda Profile ([`02-bapenda-profile.prd.md`](file:///.agents/prd/02-bapenda-profile.prd.md)).
  - Domain 4: Lapak Jambi — E-Marketplace Layanan Aset Daerah ([`04-lapak-jambi.prd.md`](file:///.agents/prd/04-lapak-jambi.prd.md)).
  - Aturan *Living Document*: Wajib update PRD setiap kali ada pembahasan atau perubahan spesifikasi modul baru.

### B. Aturan Wajib (Rules):
1. **Arsitektur Umum & Multi-Tenancy:** Buka [`.agents/rules/seloko-api-general.md`](file:///.agents/rules/seloko-api-general.md)
   - Konvensi 4-layer modular monolith (`schema` $\rightarrow$ `service` $\rightarrow$ `controller` $\rightarrow$ `routes`).
   - Multi-tenancy header wajib `X-App-Code` & pemisahan akun `INTERNAL` vs `PUBLIC`.
   - Standar media ImageKit: dua-tahap, dukungan dual-device, validasi bersyarat `isActive: true`, auto-cleanup asinkron.
2. **Standar Pengkodean & API Contract:** Buka [`.agents/rules/coding-standards.md`](file:///.agents/rules/coding-standards.md)
   - Aturan Zod DTO, sanitasi string, penanganan `exactOptionalPropertyTypes: true`.
   - Format standar respons API (`{ statusCode, code, message, data, meta }`).
   - Penanganan error resmi (`BadRequestError`, `NotFoundError`, `ConflictError`, `ForbiddenError`).
3. **Keamanan & Perlindungan Data (Security):** Buka [`.agents/rules/security-guidelines.md`](file:///.agents/rules/security-guidelines.md)
   - Proteksi data PII (NIP ASN, NIK wajib pajak, kontak, larangan bocor passwordHash).
   - Dynamic RBAC & invalidasi seketika cache izin Redis.
   - Keamanan JWT, HttpOnly refresh token cookie, token reuse detection, & Redis blocklist logout.
4. **Konvensi Database & Prisma:** Buka [`.agents/rules/database-conventions.md`](file:///.agents/rules/database-conventions.md)
   - Primary key wajib UUID v7 (`@id @default(uuid(7)) @db.VarChar(36)`).
   - Compound unique index per-tenant (`@@unique([applicationId, slug])`).
   - Timestamps PostgreSQL `timestamptz` & konvensi soft delete `deletedAt: null`.

### C. Prosedur Operasional (Skills):
1. **SOP Pembuatan Modul Baru:** Buka [`.agents/skills/seloko-module-workflow/SKILL.md`](file:///.agents/skills/seloko-module-workflow/SKILL.md)
   - Tahap 1: Skema Prisma & migrasi.
   - Tahap 2: Registrasi permission di `prisma/seeds/core/applications.json`.
   - Tahap 3: Implementasi 4-Layer Module dengan auto-cleanup ImageKit & resolusi `applicationId`.
   - Tahap 4: Seeder terisolasi di `prisma/seeds/<domain>/`.
   - Tahap 5: Typecheck & pendaftaran uji coba di `prisma/smoke/runner.ts`.
2. **Perencanaan Fitur & PRD Blueprint:** Buka [`.agents/skills/seloko-feature-planner/SKILL.md`](file:///.agents/skills/seloko-feature-planner/SKILL.md)
   - Checklist analisis domain, ERD, matriks permission, dan perancangan kontrak endpoint sebelum coding.
3. **Troubleshooting & Debug Runbook:** Buka [`.agents/skills/seloko-debug-fix/SKILL.md`](file:///.agents/skills/seloko-debug-fix/SKILL.md)
   - Solusi error Prisma P2002/P2025, TypeScript type mismatch, Redis cache desync, dan smoke test failures.
4. **Operasional Database & Seeding:** Buka [`.agents/skills/seloko-db-ops/SKILL.md`](file:///.agents/skills/seloko-db-ops/SKILL.md)
   - Prosedur migrasi aman, pembuatan seeder idempoten, dan pengetesan smoke runner.

---

## 📡 Dokumentasi API (`docs/api/`)
Dokumentasi kontrak API tinggal di repo, dikelompokkan **per aplikasi → per modul** (mengikuti pola Apidog): `core/` (auth, users, applications, permissions, roles, menus, organizations, storage), `bapenda/` (uptds, banners, news, pages), dan `lapak/` (categories, products, rates, catalog, availability), plus `00-konvensi.md` & `CHANGELOG.md`.

**Wajib:** rute baru atau perubahan kontrak → perbarui `docs/api/<app>/<modul>.md` + entri `CHANGELOG.md` + jumlah endpoint di kedua `README.md`, **pada perubahan yang sama**. Format baku: [`docs/api/README.md`](file:///docs/api/README.md).

> Dijaga otomatis oleh `docs/api/check.ts` (ikut `npm test`): memverifikasi klaim jumlah
> endpoint = jumlah rute di kode, setiap rute muncul di dokumen, setiap field request
> terdokumentasi, dan total indeks cocok. Bila checker menolak, **perbaiki dokumennya**,
> bukan checker-nya.

---

## 🚀 Perintah Standar Pengembangan
- `npm run dev` — Menjalankan development server Fastify.
- `npm run typecheck` — Memverifikasi seluruh kode TypeScript + project `prisma/` (wajib 0 error).
- `npm test` — Unit/checker suite (`docs.check`, `menus.check`, `org-scope.check`, dll).
- `npm run build` — Kompilasi produksi (`tsc` + `tsc-alias`) — wajib lolos sebelum commit.
- `npm run db:seed` — Menjalankan database seeder idempoten. Cakupan Lapak: kategori (8),
  produk + tarif (7/18 dari Perda 5/2024), **jam operasional** (45 baris), **tanggal tutup**
  (4), dan **target penerimaan per OPD per tahun** (4).
- `npm run db:smoke` — Menjalankan unified smoke test suite (~0.8s, butuh server dev hidup).
- `npm run db:smoke -- <modul>` — Menjalankan pengujian spesifik per modul.

**Bukti selesai satu tugas = 4 kanal hijau:** typecheck → test → build → db:smoke.
Jalankan `db:smoke` dengan server dev di port **3100** (`PORT=3100 npx tsx src/server.ts`),
lalu matikan setelahnya.

### ⚠️ Jebakan operasional yang sudah memakan waktu (wajib diingat)
1. **`tsx watch` tidak andal me-reload service di Windows.** Perubahan pada `*.service.ts`
   sering tidak ikut termuat, sehingga UI/HTTP menyajikan kode LAMA dan menyesatkan
   diagnosis. **Selalu restart server dev** sebelum menyimpulkan ada bug — dan pastikan
   tidak ada proses lama yang masih memegang port.
2. **Jangan pernah menaruh `new Date()` di konstanta modul.** Nilainya membeku saat modul
   dimuat; filter waktu jadi salah setelah server berjalan lama. Pakai **fungsi** yang
   dievaluasi per-request (`publicRateFilter()`).
3. **Seeder harus idempoten** (kunci: slug/kode) dan produk hasil seed tetap `DRAFT` —
   data riset wajib ditinjau manusia sebelum terbit.
4. **`npm run db:seed` me-reset tabel aplikasi**, sehingga aplikasi `lapak-jambi-web`
   bisa hilang dan semua endpoint lapak balas `500`. Jalankan ulang seed bila itu terjadi.
5. **Smoke suite wajib idempoten** — bersihkan artefak run sebelumnya **berbasis pola**
   (mis. `slug endsWith "-prod"`), bukan daftar manual yang cepat basi.

---

## 🗺️ Roadmap Modul Bapenda Profile
> *(AI Agent WAJIB otomatis mengupdate status di bawah ini menjadi ✅ setelah modul selesai dan smoke test lolos)*

1. ✅ **UPTD Samsat** (`/api/bapenda/uptds`) — *Selesai & ter-seed 11 Samsat*.
2. ✅ **Banners** (`/api/bapenda/banners`) — *Selesai, verifikasi ImageKit, & ter-seed 3 Banner*.
3. ✅ **Berita & Kategori** (`/api/bapenda/news`, tabel universal `articles` `type=NEWS`) — *Selesai, alur review, & ter-seed 5 kategori + 7 berita dari app lama*.
4. ✅ **Halaman Profil** (`/api/bapenda/pages`) — *Selesai & ter-seed 5 halaman dari app lama*.
5. ✅ **Galeri** (`/api/bapenda/galleries`) — *Selesai, alur review + item & urutan, ter-seed 1 galeri dari app lama*.
6. ✅ **FAQ & Kategori** (`/api/bapenda/faqs`) — *Selesai, toggle terbit + urutan, ter-seed 18 FAQ dari app lama*.
7. ✅ **Regulasi & Dokumen** (`/api/bapenda/regulations`) — *Selesai, validasi PDF saat terbit, ter-seed 5 dokumen*.
8. ⏳ **Pengaturan Situs** (`Application.settings`) — *Target pengerjaan berikutnya*.
8. ⏳ **Pengaturan Situs** (via `Application.settings`).

> ▶️ Bapenda Profile **dilanjutkan** (2026-10-24) — Lapak dijeda di LJ-4.1 (berita OPD ✅; artikel/galeri/banner OPD menyusul). Berikutnya Modul 8 Pengaturan Situs.

---

## 🛒 Roadmap Lapak Jambi (`/api/lapak`, PRD 04)
> *(Fokus aktif. **Sumber kebenaran progres = pipeline tugas [`.agents/tasks/lapak-jambi.md`](file:///.agents/tasks/lapak-jambi.md)** — baca sebelum mulai, kerjakan satu tugas `🟡` saja, tandai ✅ hanya setelah buktinya lolos, lalu salin status fase ke sini. Aturan pipeline: [`.agents/tasks/README.md`](file:///.agents/tasks/README.md).)*

0. ✅ **Fondasi core** (`LJ-0.x`) — OPD + lingkup penugasan, API OPD, seed RBAC/menu Lapak, registrasi akun PUBLIC — *selesai (7/7)*.
1. ✅ **Katalog** (`LJ-1.x`) — kategori, produk + tarif/persyaratan/media/fasilitas, alur persetujuan tarif terpisah, katalog publik + profil OPD, seed dari Perda Jambi No. 5/2024 — *selesai (7/7)*.
2. 🟡 **Transaksi** (`LJ-2.x`) — ketersediaan & reservasi, keranjang per OPD, checkout, SKRD, transfer manual, tiket QR — *berjalan; `LJ-2.1` (jam operasional), `LJ-2.2` (reservasi + anti double-booking DB), `LJ-2.3` (keranjang per OPD), `LJ-2.4` (quote & checkout + snapshot harga/PII), `LJ-2.5` (SKRD + penomoran gapless), `LJ-2.6` (pembayaran transfer manual + bukti ImageKit), `LJ-2.7` (tiket QR & check-in sekali pakai), `LJ-2.8` (worker kedaluwarsa) ✅ — **Fase 2 selesai**. Fase 3 (Dashboard PAD) ✅ — `LJ-3.1` (dashboard & target), `LJ-3.2` (daftar transaksi & ekspor CSV), `LJ-3.3` (transparansi PAD publik + suppression). **Fase 4 (Pasca-MVP) berjalan.**
3. ⏳ **Monitoring PAD** (`LJ-3.x`) — dashboard, transaksi & ekspor, transparansi publik. *(MVP = Fase 0–3)*
4. ⏳ **Pasca-MVP** (`LJ-4.x`) — konten OPD, ulasan, komentar, wishlist, target OPD.
5. ⏳ **Lanjutan** (`LJ-5.x`) — VA/QRIS, gabung web+mobile & auth PUBLIC, mobile.

- **`resetTables` jangan pakai daftar manual.** Versi lama mendaftar tabel satu per satu dan
  terus tertinggal tiap ada modul baru → `db:seed:reset` gagal di FK tabel yang belum terdaftar
  (mis. `lapak_products`). Sekarang daftar dibaca dari `pg_tables` + `TRUNCATE ... CASCADE`.
  Jangan kecualikan `_prisma_migrations`: mengosongkannya membuat `migrate deploy` gagal P3005.
