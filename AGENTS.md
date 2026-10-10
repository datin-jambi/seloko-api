# SELOKO API — Agent Instructions & Conventions

Selamat datang di proyek **SELOKO API** (Backend Inti & Identity Gateway BPKPD Provinsi Jambi).

Sebelum melakukan tugas pengkodean, perbaikan, atau penambahan modul pada repositori ini, setiap AI Agent **wajib** membaca dan mematuhi aturan serta skill yang telah disiapkan:

---

## 📌 Panduan & Aturan Resmi Proyek
1. **Aturan Umum & Arsitektur:** Buka [`.agents/rules/seloko-api-general.md`](file:///.agents/rules/seloko-api-general.md)
   - Konvensi 4-layer modular monolith (`schema` $\rightarrow$ `service` $\rightarrow$ `controller` $\rightarrow$ `routes`).
   - Multi-tenancy header wajib `X-App-Code`.
   - Pemisahan akun `INTERNAL` (gateway `seloko`) vs `PUBLIC`.
   - Integrasi centralized storage ImageKit (`/api/storage/upload`).
   - Caching izin RBAC Redis dan invalidasi seketika.
   - Aturan ketat TypeScript (`exactOptionalPropertyTypes: true`, UUID v7).
2. **SOP Pembuatan & Pengembangan Modul:** Buka [`.agents/skills/seloko-module-workflow/SKILL.md`](file:///.agents/skills/seloko-module-workflow/SKILL.md)
   - Tahap 1: Skema Prisma & migrasi.
   - Tahap 2: Registrasi permission di `prisma/seeds/core/applications.json`.
   - Tahap 3: Implementasi 4-Layer Module dengan auto-cleanup ImageKit & resolusi `applicationId`.
   - Tahap 4: Seeder terisolasi di `prisma/seeds/<domain>/`.
   - Tahap 5: Typecheck & pendaftaran uji coba di `prisma/smoke/runner.ts`.

---

## 🚀 Perintah Standar Pengembangan
- `npm run dev` — Menjalankan development server Fastify.
- `npm run typecheck` — Memverifikasi seluruh kode TypeScript (wajib 0 error).
- `npm run db:seed` — Menjalankan database seeder idempoten.
- `npm run db:smoke` — Menjalankan unified smoke test suite (~0.8s).
- `npm run db:smoke -- <modul>` — Menjalankan pengujian spesifik per modul.

---

## 🗺️ Roadmap Modul Bapenda Profile
1. ✅ **UPTD Samsat** (`/api/bapenda/uptds`) — *Selesai & ter-seed 11 Samsat*.
2. ⏳ **Banners** (`/api/bapenda/banners`) — *Target berikutnya*.
3. ⏳ **Articles & Categories** (`/api/bapenda/articles`).
4. ⏳ **FAQs** (`/api/bapenda/faqs`).
5. ⏳ **Regulations** (`/api/bapenda/regulations`).
