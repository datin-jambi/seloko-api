---
name: seloko-module-workflow
description: Standard Operating Procedure (SOP) dan langkah demi langkah untuk membuat, memperbarui, seeding, dan menguji modul baru pada SELOKO API.
---

# 🚀 SELOKO Module Development SOP

Gunakan SOP ini sebagai panduan lengkap saat mengimplementasikan fitur atau modul baru pada repositori `seloko-api`.

---

## 📌 Checklist Cepat Sebelum Mulai
- [ ] Tentukan domain aplikasi target (misal: `bapenda-profile`, `seloko`, atau `lapak-jambi-web`).
- [ ] Apakah modul membutuhkan media gambar/dokumen? *(Jika ya, ikuti integrasi Storage ImageKit)*.
- [ ] Apakah modul membutuhkan slug unik? *(Jika ya, slug harus unik per `[applicationId, slug]`)*.

---

## Tahap 1: Skema Database Prisma (`prisma/schema.prisma`)

1. Buka `prisma/schema.prisma`.
2. Format standar model domain:
   ```prisma
   model <Feature> {
     id            String    @id @default(uuid(7)) @db.VarChar(36)
     applicationId String    @map("app_id") @db.VarChar(36)
     
     // Field konten / data
     title         String    @db.VarChar(150)
     slug          String    @db.VarChar(200)
     imageUrl      String?   @map("image_url") @db.VarChar(500)
     imageFileId   String?   @map("image_file_id") @db.VarChar(100)
     
     // Urutan & Status
     sortOrder     Int       @default(0) @map("sort_order")
     isActive      Boolean   @default(true) @map("is_active")
     
     // Timestamps & Soft Delete
     createdAt     DateTime  @default(now()) @map("created_at") @db.Timestamptz()
     updatedAt     DateTime  @updatedAt @map("updated_at") @db.Timestamptz()
     deletedAt     DateTime? @map("deleted_at") @db.Timestamptz()

     application   Application @relation(fields: [applicationId], references: [id], onDelete: Cascade)

     @@unique([applicationId, slug], map: "uq_app_<feature>_slug")
     @@map("<feature_plural_snake_case>")
   }
   ```
3. Tambahkan inverse relation pada model `Application` (dan `User` jika ada relasi author).
4. Jalankan migrasi & regenerate client:
   ```bash
   npm run db:migrate:dev -- --name add_<feature>_model
   npm run db:generate
   ```

---

## Tahap 2: Daftarkan Permission di Seeder (`prisma/seeds/core/applications.json`)

> ⚠️ **PENTING:** Daftarkan permission sebelum membuat endpoint CMS agar guard `requirePermission` tidak menolak request.

1. Buka [prisma/seeds/core/applications.json](file:///c:/Users/ASUS/Documents/BPKPD/Code/seloko-api/prisma/seeds/core/applications.json).
2. Temukan aplikasi target (misal: `"code": "bapenda-profile"`), tambahkan ke daftar `permissions`:
   ```json
   {
     "entity": "<entity_code>",
     "label": "<Label Bahasa Indonesia>",
     "actions": ["content"] 
   }
   ```
   *(Grup `"content"` otomatis menghasilkan aksi: `create`, `read`, `update`, `delete`, `list`)*.
3. Jalankan `npm run db:seed` agar permission masuk ke database.

---

## Tahap 3: Implementasi 4-Layer Modular Monolith

Buat folder di `src/modules/<domain>/<feature>/`:

### 1. `*.schema.ts` (Zod DTO & Validation)
- Definisikan:
  - Query: `List...QuerySchema` (page, limit, search, status, sortBy, sortOrder).
  - Params: `id` (UUID format) atau `slug`/`code`.
  - Body: `Create...BodySchema` dan `Update...BodySchema` (partial).
  - Response: `ItemSchema.passthrough()`, `List...ResponseSchema`, dll.

### 2. `*.service.ts` (Business Logic & Prisma)
- **Resolusi Application ID:** Ambil ID aplikasi target dengan aman:
  ```typescript
  const app = await prisma.application.findUniqueOrThrow({
    where: { code: APP_CODES.BAPENDA_PROFILE },
    select: { id: true },
  });
  ```
- **Filter Soft Delete:** Selalu sertakan `where: { deletedAt: null }`.
- **Integrasi ImageKit Cleanup & Validasi Bersyarat `isActive`:**
  - Validasi fisik ImageKit (`getFileDetails`) **hanya dipicu jika entitas berstatus aktif (`isActive === true`)** atau saat status diaktifkan. Mode draft (`isActive === false`) diizinkan bypass validasi.
  - Saat record di-update dengan media baru, hapus berkas lama secara background:
  ```typescript
  import { ImageKitService } from "~/common/services/storage/imagekit.service.js";
  // Hapus gambar lama jika diganti
  if (oldFileId && oldFileId !== newFileId) {
    ImageKitService.deleteFile(oldFileId).catch(() => null);
  }
  ```
- **Aturan TypeScript `exactOptionalPropertyTypes: true`:**
  - JANGAN kirim `{ field: undefined }` ke Prisma jika field nullable/optional.
  - Gunakan `null` secara eksplisit untuk menghapus nilai di DB atau hilangkan key tersebut.

### 3. `*.controller.ts` (HTTP Handlers)
- Ekstrak parameter dari `request`.
- Panggil service yang bersangkutan.
- Kembalikan response terstandarisasi:
  ```typescript
  return reply.send({
    statusCode: 200,
    code: "SUCCESS",
    message: "Data berhasil diambil",
    data,
    meta?: paginationMeta,
  });
  ```

### 4. `*.routes.ts` (Rute Fastify & Guard)
- Pisahkan endpoint publik (`/public`) dan endpoint CMS internal.
- Endpoint CMS internal wajib membawa guard:
  ```typescript
  preHandler: [
    fastify.authenticate,
    fastify.requirePermission("<entity>:list", { app: APP_CODES.BAPENDA_PROFILE }),
  ]
  ```
- Daftarkan route baru di [src/app.ts](file:///c:/Users/ASUS/Documents/BPKPD/Code/seloko-api/src/app.ts):
  ```typescript
  await app.register(<feature>Routes, { prefix: "/api/<domain>/<feature>" });
  ```

---

## Tahap 4: Seeder Data Awal (`prisma/seeds/<domain>/`)

1. Buat data JSON di `prisma/seeds/<domain>/<feature>.json`.
2. Buat seeder di `prisma/seeds/<domain>/<feature>.seeder.ts`:
   - Gunakan logika **upsert idempoten** berdasarkan field unik (`code` atau `[applicationId, slug]`).
3. Daftarkan interface di `prisma/seeds/shared/types.ts`.
4. Muat dan panggil di `prisma/seed.ts`, serta tambahkan ke tabel ringkasan `printSummary()`.
5. Tambahkan pembersihan tabel di `prisma/seeds/shared/reset.ts` untuk opsi `--reset`.
6. Jalankan:
   ```bash
   npm run db:seed
   ```

---

## Tahap 5: Verifikasi & Smoke Testing

1. **Typecheck Bebas Error:**
   ```bash
   npm run typecheck
   ```
   *(Harus lolos 0 error)*.

2. **Daftarkan Test Suite di Smoke Runner:**
   - Buka [prisma/smoke/runner.ts](file:///c:/Users/ASUS/Documents/BPKPD/Code/seloko-api/prisma/smoke/runner.ts).
   - Buat fungsi test suite (misal: `run<Feature>Suite()`).
   - Daftarkan nama modul di fungsi `main()` agar mendukung filter per modul.

3. **Eksekusi Pengujian:**
   ```bash
   npm run db:smoke -- <nama-modul>
   ```
   Pastikan seluruh skenario lolos (`✓`).

4. **Otomatis Perbarui Roadmap di `AGENTS.md` (Langkah Penutup Wajib):**
   - Setelah implementasi dan smoke test lolos, AI Agent **wajib otomatis memperbarui** [AGENTS.md](file:///c:/Users/ASUS/Documents/BPKPD/Code/seloko-api/AGENTS.md).
   - Ubah status modul yang baru selesai dari `⏳` menjadi `✅`.
   - Tandai modul berikutnya dengan label `Target pengerjaan berikutnya`.

