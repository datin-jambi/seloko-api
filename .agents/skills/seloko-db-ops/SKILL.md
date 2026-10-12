---
name: seloko-db-ops
description: >-
  Prosedur operasional database, manajemen migrasi Prisma, pembuatan database seeder idempoten, dan eksekusi smoke test pada SELOKO API.
  Gunakan skill ini saat melakukan migrasi skema database baru, menambahkan data seeder domain, atau mereset data pengujian.
---

# 🗃️ SELOKO Database Operations & Seeding Runbook

Dokumen ini memuat prosedur standar untuk eksekusi migrasi database, pembuatan seeder idempoten, dan pengujian smoke test pada `seloko-api`.

---

## 1. Migrasi Skema Database (`prisma/schema.prisma`)

Setiap kali menambahkan atau mengubah tabel di `prisma/schema.prisma`:

### Langkah-langkah:
1. **Validasi Skema:**
   Pastikan skema Prisma valid dan tidak ada sintaks rusak:
   ```bash
   npx prisma validate
   ```
2. **Buat dan Terapkan Migrasi (Development):**
   ```bash
   npm run db:migrate:dev -- --name <nama_migrasi_deskriptif>
   ```
   *Contoh:* `npm run db:migrate:dev -- --name add_articles_and_categories`
3. **Regenerate Prisma Client:**
   ```bash
   npm run db:generate
   ```
4. **Verifikasi Kompatibilitas TypeScript:**
   ```bash
   npm run typecheck
   ```
   *(Wajib 0 error sebelum melangkah ke tahap berikutnya).*

---

## 2. Pembuatan Database Seeder Idempoten

Data awal domain disimpan secara modular di `prisma/seeds/<domain>/`:

### Struktur Seeder:
```text
prisma/seeds/<domain>/
├── <feature>.json          # Data mentah awal (misal: articles.json, faqs.json)
└── <feature>.seeder.ts     # Logika upsert idempoten
```

### Standar Penulisan Seeder:
1. **Wajib Idempoten (Upsert):**
   Gunakan `upsert` berdasarkan field unik (`code` atau `[applicationId, slug]`) sehingga script dapat dijalankan berkali-kali tanpa menghasilkan duplikasi:
   ```typescript
   await prisma.article.upsert({
     where: {
       applicationId_slug: {
         applicationId,
         slug: item.slug,
       },
     },
     update: { ...data },
     create: { ...data },
   });
   ```
2. **Daftarkan Interface Tipe:**
   Tambahkan tipe data JSON di [prisma/seeds/shared/types.ts](file:///c:/Users/ASUS/Documents/BPKPD/Code/seloko-api/prisma/seeds/shared/types.ts).
3. **Daftarkan di Runner Seeder:**
   Panggil fungsi seeder baru di [prisma/seed.ts](file:///c:/Users/ASUS/Documents/BPKPD/Code/seloko-api/prisma/seed.ts) dan sertakan ke dalam tabel ringkasan `printSummary()`.
4. **Eksekusi Seeding:**
   ```bash
   npm run db:seed
   ```

---

## 3. Menjalankan Smoke Test

Uji coba menyeluruh end-to-end dilakukan menggunakan native runner TypeScript di `prisma/smoke/runner.ts`:

- **Jalankan Seluruh Test Suite:**
  ```bash
  npm run db:smoke
  ```
- **Jalankan Modul Spesifik:**
  ```bash
  npm run db:smoke -- applications
  npm run db:smoke -- uptds
  npm run db:smoke -- banners
  ```
- **Catatan Penting:** Pastikan server Fastify sedang berjalan (`npm run dev`) sebelum mengeksekusi smoke test.
