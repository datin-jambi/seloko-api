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

## 🚀 Perintah Standar Pengembangan
- `npm run dev` — Menjalankan development server Fastify.
- `npm run typecheck` — Memverifikasi seluruh kode TypeScript (wajib 0 error).
- `npm run db:seed` — Menjalankan database seeder idempoten.
- `npm run db:smoke` — Menjalankan unified smoke test suite (~0.8s).
- `npm run db:smoke -- <modul>` — Menjalankan pengujian spesifik per modul.

---

## 🗺️ Roadmap Modul Bapenda Profile
> *(AI Agent WAJIB otomatis mengupdate status di bawah ini menjadi ✅ setelah modul selesai dan smoke test lolos)*

1. ✅ **UPTD Samsat** (`/api/bapenda/uptds`) — *Selesai & ter-seed 11 Samsat*.
2. ✅ **Banners** (`/api/bapenda/banners`) — *Selesai, verifikasi ImageKit, & ter-seed 3 Banner*.
3. ✅ **Berita & Kategori** (`/api/bapenda/news`, tabel universal `articles` `type=NEWS`) — *Selesai, alur review, & ter-seed 5 kategori + 7 berita dari app lama*.
4. ✅ **Halaman Profil** (`/api/bapenda/pages`) — *Selesai & ter-seed 5 halaman dari app lama*.
5. ⏳ **Galeri** (`/api/bapenda/galleries`) — *Target pengerjaan berikutnya*.
6. ⏳ **FAQs** (`/api/bapenda/faqs`).
7. ⏳ **Regulations** (`/api/bapenda/regulations`).
8. ⏳ **Pengaturan Situs** (via `Application.settings`).

> ⏸️ Bapenda Profile **dijeda** (2026-10-17) — fokus pindah ke Lapak Jambi. Lanjut dari Modul 5 Galeri bila kembali.

---

## 🛒 Roadmap Lapak Jambi (`/api/lapak`, PRD 04)
> *(Fokus aktif. **Sumber kebenaran progres = pipeline tugas [`.agents/tasks/lapak-jambi.md`](file:///.agents/tasks/lapak-jambi.md)** — baca sebelum mulai, kerjakan satu tugas `🟡` saja, tandai ✅ hanya setelah buktinya lolos, lalu salin status fase ke sini. Aturan pipeline: [`.agents/tasks/README.md`](file:///.agents/tasks/README.md).)*

0. 🟡 **Fondasi core** (`LJ-0.x`) — OPD + lingkup penugasan, API OPD, seed RBAC/menu Lapak, registrasi akun PUBLIC — *sedang dikerjakan*.
1. ⏳ **Katalog** (`LJ-1.x`) — kategori, produk + tarif/persyaratan/media, alur persetujuan, katalog publik.
2. ⏳ **Transaksi** (`LJ-2.x`) — ketersediaan, keranjang per OPD, checkout, SKRD, transfer manual, tiket QR.
3. ⏳ **Monitoring PAD** (`LJ-3.x`) — dashboard, transaksi & ekspor, transparansi publik. *(MVP = Fase 0–3)*
4. ⏳ **Pasca-MVP** (`LJ-4.x`) — konten OPD, ulasan, komentar, wishlist, target OPD.
5. ⏳ **Lanjutan** (`LJ-5.x`) — VA/QRIS, gabung web+mobile & auth PUBLIC, mobile.
