---
trigger: always_on
project: seloko-api
description: Standar konvensi skema database Prisma, UUID v7, indexing, dan relasi multi-tenancy SELOKO
---

# 🗄️ Database Conventions & Prisma Guidelines — SELOKO API

Dokumen ini memuat standar penulisan skema database Prisma, pemodelan entitas, dan konvensi pengindeksan di PostgreSQL untuk **SELOKO API**.

---

## 1. Konvensi Primary Key & Tipe Data

1. **UUID Versi 7 Wajib untuk Seluruh Primary Key:**
   - Seluruh tabel entitas wajib menggunakan **UUID v7** terurut waktu (*time-ordered*):
     ```prisma
     id String @id @default(uuid(7)) @db.VarChar(36)
     ```
   - UUID v7 memberikan performa indeks B-Tree yang optimal menyerupai autoincrement integer, namun aman dari tebakan ID eksternal.

2. **Penamaan Tabel & Kolom:**
   - Model Prisma: PascalCase tunggal (misal: `Article`, `ArticleCategory`, `BapendaUptd`).
   - Tabel PostgreSQL: snake_case jamak melalui `@@map("...")` (misal: `@@map("articles")`, `@@map("article_categories")`).
   - Field Prisma: camelCase (misal: `authorId`, `imageUrl`).
   - Kolom PostgreSQL: snake_case melalui `@map("...")` (misal: `@map("author_id")`, `@map("image_url")`).

---

## 2. Standar Multi-Tenancy & Pengindeksan

1. **Relasi Wajib ke `Application`:**
   - Semua entitas domain konten atau manajemen wajib terhubung ke tabel `applications`:
     ```prisma
     applicationId String      @map("app_id") @db.VarChar(36)
     application   Application @relation(fields: [applicationId], references: [id], onDelete: Cascade)
     ```
2. **Keunikan Bersifat Per-Aplikasi (Compound Unique):**
   - Kolom penanda seperti `slug` atau `code` **DILARANG** dibuat unik secara global jika entitas milik tenant tertentu.
   - Wajib menggunakan compound unique:
     ```prisma
     @@unique([applicationId, slug], map: "uq_articles_app_slug")
     @@unique([applicationId, code], map: "uq_categories_app_code")
     ```
   - Ini memungkinkan aplikasi `bapenda-profile` dan `lapak-jambi-web` memiliki artikel atau kategori dengan slug yang sama tanpa saling mengunci.

---

## 3. Standar Pasangan Kolom Media (ImageKit)

Setiap entitas yang menyimpan berkas gambar atau dokumen **WAJIB menyediakan pasangan kolom URL dan FileId**:

```prisma
imageUrl      String?  @map("image_url") @db.VarChar(500)
imageFileId   String?  @map("image_file_id") @db.VarChar(100)

// Contoh dukungan dual-device (seperti pada Banner):
mobileImageUrl    String?  @map("mobile_image_url") @db.VarChar(500)
mobileImageFileId String?  @map("mobile_image_file_id") @db.VarChar(100)
```
- `imageUrl`: URL publik yang diakses oleh front-end browser.
- `imageFileId`: ID berkas ImageKit untuk kebutuhan validasi fisik (`getFileDetails`) dan auto-cleanup (`deleteFile`).

---

## 4. Timestamps & Pola Soft Delete

1. **Timestamps Standar:**
   - Semua tabel wajib memiliki kolom waktu dengan zona waktu PostgreSQL (`timestamptz`):
     ```prisma
     createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz()
     updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz()
     ```
2. **Pola Soft Delete:**
   - Entitas konten bisnis (Articles, Banners, UPTD, Users) wajib memiliki kolom `deletedAt`:
     ```prisma
     deletedAt DateTime? @map("deleted_at") @db.Timestamptz()
     ```
   - Kueri Prisma secara default WAJIB menyertakan kondisi:
     ```typescript
     where: { deletedAt: null }
     ```
   - Jika entitas memiliki indeks unik, pastikan saat proses create memeriksa apakah data lama dengan slug tersebut berada dalam status soft-deleted untuk di-restore atau dilaporkan konflik secara tepat.

---

## 5. Prosedur Migrasi Skema (`npm run db:migrate:dev`)

1. Setiap perubahan pada `prisma/schema.prisma` wajib dibuatkan migrasi bernama deskriptif:
   ```bash
   npm run db:migrate:dev -- --name add_article_and_categories_model
   ```
2. Jangan pernah mengedit berkas SQL migrasi yang sudah pernah diaplikasikan ke database bersama.
3. Setelah migrasi berhasil, pastikan Prisma Client ter-regenerate:
   ```bash
   npm run db:generate
   ```
