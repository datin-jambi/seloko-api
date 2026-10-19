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
- **Dokumentasi API Wajib Ikut Berubah:** Setiap rute baru, atau perubahan path/query/body/response/guard pada rute lama, WAJIB memperbarui `docs/api/<app>/<modul>.md`, menambah entri di `docs/api/CHANGELOG.md`, dan menyesuaikan jumlah endpoint di `docs/api/README.md` + `docs/api/<app>/README.md` — dalam perubahan yang SAMA. Endpoint tanpa dokumentasi dianggap fitur belum selesai. Format & aturan lengkap: `docs/api/README.md` §Aturan Wajib.
- **Centralized Storage (ImageKit): Upload multipart melalui `/api/storage/upload` dengan path folder otomatis `/{appCode}/{module}/{subFolder}` dan auto-generated hash filename `{prefix}_{YYYYMMDD}_{HHmmss}_{hash8}{ext}`.
- **Konvensi 4-Layer Modular Monolith:**
  - `*.schema.ts` (Zod DTO & validation)
  - `*.service.ts` (Business logic murni & Prisma query, filter `deletedAt: null`)
  - `*.controller.ts` (HTTP handler)
  - `*.routes.ts` (Pendaftaran endpoint & guard `fastify.authenticate`, `fastify.requirePermission`)
- **Struktur Folder Modul (Domain vs Shared):**
  ```text
  src/modules/
    core/                   # identitas, RBAC, aplikasi, menu, storage (milik seloko)
    shared/                 # logika bersama lintas aplikasi — TIDAK tahu domain mana pun
      article/              # konten artikel universal (tabel articles; jenis via ArticleType NEWS/ARTICLE/…)
        article.schema.ts   #   Zod DTO bersama
        article.service.ts  #   logika & Prisma, menerima ArticleScope dari domain
      <modul-shared-lain>/
    <domain>/               # mis. bapenda/, lapak/ — semua fitur & route domain ada di sini
      uptds/                # fitur khas domain: 4-layer lengkap
      news/                 # fitur pemakai shared: hanya controller + routes
        news.controller.ts  #   tetapkan ArticleScope domain (appCode, type, entity, label), panggil shared service
        news.routes.ts      #   route & guard eksplisit seperti modul domain lain, schema dari shared
  ```
  - `shared/` hanya berisi **schema + service** (logika). Route & controller selalu milik domain, sehingga URL tetap `/api/<domain>/<fitur>` dan didaftarkan di `app.ts` seperti modul domain lain.
  - Service shared menerima konteks lewat parameter (mis. `ArticleScope`). Dilarang menulis `APP_CODES.<domain>` di dalam `shared/`.
  - **Kapan jadi shared:** modul dibuat di folder domain dulu. Pindahkan logikanya ke `shared/` saat domain KEDUA butuh fitur yang sama — bukan karena "mungkin nanti".
  - **Domain butuh perilaku berbeda** — naik bertahap, berhenti di tahap pertama yang cukup:
    1. Atur di controller/routes domain (validasi tambahan, endpoint tidak dipasang).
    2. Tambah opsi pada scope service shared — dibuat hanya saat diminta.
    3. Fork menjadi modul domain sendiri bila field/alur/aturan sudah jauh berbeda (biasanya disertai tabel sendiri).
- **Path Menu Sidebar (`prisma/seeds/core/menus.json`):** path internal menu CMS WAJIB diawali prefix aplikasi agar frontend super app dapat merutekan semua aplikasi tanpa bentrok: `/seloko/...`, `/bapenda/...`, `/lapak/...` (mis. `/seloko/dashboard`, `/bapenda/berita`). Aplikasi baru memakai prefix pendeknya sendiri. Pengecualian: tautan eksternal (`isExternal`) dan aplikasi warga non-CMS (mis. `lapak-jambi-app`). Diverifikasi `prisma/smoke/menus.check.ts`.
- **Public App Config Endpoint:** Setiap aplikasi front-end publik didukung endpoint unauthenticated `GET /api/applications/public-config/:code` yang menyediakan informasi branding, kontak, SEO, dan status fitur tanpa autentikasi.
- **Transparansi Hak Akses User:** Endpoint list users menyertakan ringkasan jumlah aplikasi per role, dan endpoint detail user memetakan secara eksplisit daftar aplikasi serta role yang dimiliki pengguna.

---

## 2. Aturan Ketat TypeScript & Database
- `exactOptionalPropertyTypes: true`: Dilarang mengoper `{ field: undefined }` ke Prisma jika field bersifat optional/nullable. Gunakan `null` secara eksplisit untuk mengosongkan nilai atau hilangkan key tersebut.
- Seluruh Primary Key menggunakan **UUID v7** (`@id @default(uuid(7)) @db.VarChar(36)`).
- Slug konten unik dalam lingkup aplikasi: `@@unique([applicationId, slug])`.
- Setiap URL media wajib memiliki padanan kolom `FileId` (misal: `avatarUrl` & `avatarFileId`, `logoUrl` & `logoFileId`, `faviconUrl` & `faviconFileId`, `ogImageUrl` & `ogImageFileId`).

---

## 3. Database Seeding & Smoke Testing
- **Seeder:** Dikelompokkan per domain di `prisma/seeds/<domain>/` (misal: `prisma/seeds/bapenda/uptds.json` & `uptds.seeder.ts`). Bersifat idempoten (upsert) dan dijalankan via `npm run db:seed`.
- **Smoke Test:** Pengujian end-to-end terpusat di `prisma/smoke/runner.ts` (100% native TypeScript). Dijalankan via `npm run db:smoke` (atau `npm run db:smoke -- <nama-modul>`).

---

## 4. Status Roadmap Modul Bapenda Profile
- ✅ **UPTD Samsat** (`/api/bapenda/uptds`) — *Selesai & ter-seed 11 kantor Samsat se-Provinsi Jambi*.
- ✅ **Banners** (`/api/bapenda/banners`) — *Selesai, verifikasi ImageKit, & ter-seed 3 Banner*.
- ✅ **Berita & Kategori** (`/api/bapenda/news`) — *`bapenda/news` memakai `shared/article` (type `NEWS`), alur review, ter-seed dari app lama*.
- ✅ **Halaman Profil** (`/api/bapenda/pages`) — *Selesai & ter-seed 5 halaman dari app lama*.
- ✅ **Galeri** (`/api/bapenda/galleries`) — *Selesai, alur review dari `shared/article`*.
- ✅ **FAQ & Kategori** (`/api/bapenda/faqs`) — *Selesai*
- ✅ **Regulasi & Dokumen** (`/api/bapenda/regulations`) — *Selesai*
- ⏳ **Pengaturan Situs** — *Target pengerjaan berikutnya*

---

## 5. Standar Manajemen Media & Gambar (ImageKit Lifecycle)
- **Two-Step Upload:** Upload file fisik via `/api/storage/upload` lebih dulu $\rightarrow$ dapatkan `url` & `fileId` $\rightarrow$ kirim via JSON body ke endpoint modul terkait.
- **Dual Device Support (Desktop vs Mobile):** Konten visual publik (seperti Banner) menyediakan slot ganda: `imageUrl`/`imageFileId` (Desktop / default) dan `mobileImageUrl`/`mobileImageFileId` (Mobile opsional / fallback).
- **Validasi Dimensi & Ukuran Toleran (Tidak Kaku):**
  - Mengambil metadata fisik dari `ImageKitService.getFileDetails(fileId)`.
  - Desktop: Max 3MB, orientasi landscape (`width >= height`), min lebar 800px.
  - Mobile: Max 1.5MB, min lebar 360px.
- **Validasi Bersyarat Status Aktif (`isActive: true`):**
  - Pemeriksaan `fileId` ke ImageKit **hanya dijalankan jika data berstatus aktif (`isActive === true`)** atau saat data diubah menjadi aktif.
  - Data dalam status draft / nonaktif (`isActive === false`) diizinkan disimpan tanpa pengecekan ImageKit ketat.
  - Saat entitas diaktifkan kembali (`isActive` dibuat `true`), sistem memvalidasi seluruh berkas `fileId` yang tersimpan ke ImageKit sebelum aktivasi disetujui.
- **Auto-Cleanup Background:** Saat media diganti (`fileId` baru) atau dihapus, picu `ImageKitService.deleteFile(oldFileId)` secara asinkron tanpa memblokir response HTTP.