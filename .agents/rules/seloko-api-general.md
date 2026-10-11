---
trigger: always_on
project: seloko-api
description: Standar arsitektur, konvensi kode, dan workflow implementasi modul SELOKO API BPKPD Jambi
---

# 🏛️ Project: seloko-api (BPKPD Jambi)

Repositori ini adalah **SELOKO API** — Centralized Core API & Multi-App Engine untuk Pemerintah Provinsi Jambi.

---

## 1. Prinsip Arsitektur Utama
- **Multi-Tenancy (`X-App-Code`):** Wajib di seluruh rute `/api/*`. Pegawai (`INTERNAL`) login hanya lewat gateway `seloko`. Warga (`PUBLIC`) login langsung di aplikasi publik masing-masing.
- **Dynamic RBAC & Redis Cache:** Pemeriksaan izin per user di-cache di Redis (`perms:user:{userId}:app:{appCode}`, TTL 5 menit) dan otomatis di-invalidate saat ada mutasi role/permission.
- **Centralized Storage (ImageKit):** Upload multipart melalui `/api/storage/upload` dengan path folder otomatis `/{appCode}/{module}/{subFolder}` dan auto-generated hash filename `{prefix}_{YYYYMMDD}_{HHmmss}_{hash8}{ext}`.
- **Konvensi 4-Layer Modular Monolith:**
  - `*.schema.ts` (Zod DTO & validation)
  - `*.service.ts` (Business logic murni & Prisma query, filter `deletedAt: null`)
  - `*.controller.ts` (HTTP handler)
  - `*.routes.ts` (Pendaftaran endpoint & guard `fastify.authenticate`, `fastify.requirePermission`)

---

## 2. Aturan Ketat TypeScript & Database
- `exactOptionalPropertyTypes: true`: Dilarang mengoper `{ field: undefined }` ke Prisma jika field bersifat optional/nullable. Gunakan `null` secara eksplisit untuk mengosongkan nilai atau hilangkan key tersebut.
- Seluruh Primary Key menggunakan **UUID v7** (`@id @default(uuid(7)) @db.VarChar(36)`).
- Slug konten unik dalam lingkup aplikasi: `@@unique([applicationId, slug])`.

---

## 3. Database Seeding & Smoke Testing
- **Seeder:** Dikelompokkan per domain di `prisma/seeds/<domain>/` (misal: `prisma/seeds/bapenda/uptds.json` & `uptds.seeder.ts`). Bersifat idempoten (upsert) dan dijalankan via `npm run db:seed`.
- **Smoke Test:** Pengujian end-to-end terpusat di `prisma/smoke/runner.ts` (100% native TypeScript). Dijalankan via `npm run db:smoke` (atau `npm run db:smoke -- <nama-modul>`).

---

## 4. Status Roadmap Modul Bapenda Profile
- ✅ **UPTD Samsat** (`/api/bapenda/uptds`) — *Selesai & ter-seed 11 kantor Samsat se-Provinsi Jambi*.
- ✅ **Banners** (`/api/bapenda/banners`) — *Selesai, verifikasi ImageKit, & ter-seed 3 Banner*.
- ⏳ **Articles & Categories** (`/api/bapenda/articles`) — *Target pengerjaan berikutnya*.
- ⏳ **FAQs** (`/api/bapenda/faqs`).
- ⏳ **Regulations** (`/api/bapenda/regulations`).