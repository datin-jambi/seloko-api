---
trigger: always_on
project: seloko-api
description: Standar pengkodean, penulisan Zod DTO, penanganan error, dan konvensi respons API SELOKO
---

# 💻 Coding Standards & API Conventions — SELOKO API

Dokumen ini memuat standar penulisan kode TypeScript, validasi Zod DTO, format respons HTTP, dan penanganan error untuk seluruh modul di `seloko-api`.

---

## 1. Konvensi 4-Layer Modular Monolith

Setiap modul di `src/modules/<domain>/<feature>/` atau `src/modules/shared/<group>/<feature>/` WAJIB dipisahkan ke dalam 4 berkas utama (pembagian domain vs shared: lihat `seloko-api-general.md` §1). Pengecualian: modul `shared/` hanya `*.schema.ts` + `*.service.ts`; modul domain pemakainya hanya `*.controller.ts` + `*.routes.ts`.

1. **`*.schema.ts` (Zod DTO & Contracts):**
   - Mendefinisikan schema untuk Query Params, URL Params, Body, dan Responses.
   - Menggunakan Zod tipe inferensi (`export type ... = z.infer<typeof ...>`).
   - Query schema WAJIB menggunakan sanitasi `.trim()` untuk teks dan `.coerce` untuk angka/boolean query.
   - Body update schema WAJIB menggunakan `.refine((data) => Object.keys(data).length > 0)` untuk mencegah request update kosong.

2. **`*.service.ts` (Business Logic & Database Access):**
   - Murni fungsi JavaScript/TypeScript tanpa dependensi ke objek `FastifyRequest` atau `FastifyReply`.
   - Mengakses database melalui instance `prisma` dari `~/config/database.js`.
   - Seluruh kueri wajib menyertakan filter soft delete `deletedAt: null` (kecuali kasus audit/restore khusus).
   - Selalu perhatikan aturan `exactOptionalPropertyTypes: true` (lihat bagian 2).

3. **`*.controller.ts` (HTTP Transport Handler):**
   - Bertanggung jawab mengekstrak data dari `request` (body, params, query, headers, auth user).
   - Memanggil service yang sesuai.
   - Mengembalikan response dengan HTTP Status Code yang benar dan payload seragam.
   - Dilarang menaruh kueri Prisma langsung di controller!

4. **`*.routes.ts` (Routing & Guards):**
   - Mendaftarkan rute Fastify menggunakan type provider Zod (`fastify.withTypeProvider<ZodTypeProvider>()`).
   - Menyertakan metadata OpenAPI (`description`, `tags`, `schema`) — wajib, karena itu satu-satunya sumber bentuk respons.
   - **Wajib langsung memperbarui `docs/api/<app>/<modul>.md`** pada perubahan yang sama (rute baru/berubah/hapus), plus entri `CHANGELOG.md`. Lihat `docs/api/README.md` §Aturan Wajib. `npm test` akan gagal bila jumlah/rute di dokumen tidak cocok dengan kode (`docs/api/check.ts`).
   - Menetapkan guard wajib:
     - Autentikasi: `preHandler: [fastify.authenticate]`
     - RBAC: `fastify.requirePermission("<entity>:<action>", { app: APP_CODES.<APP> })`

---

## 2. Aturan Ketat TypeScript (`exactOptionalPropertyTypes: true`)

File `tsconfig.json` mengaktifkan `exactOptionalPropertyTypes: true`. Ini berarti TypeScript membedakan secara tegas antara properti yang **tidak ada** (`undefined`) dengan properti bernilai **kosong** (`null`).

### ❌ Dilarang Keras:
```typescript
// ERROR: undefined tidak boleh dioper ke field nullable di Prisma saat exactOptionalPropertyTypes aktif
await prisma.banner.update({
  where: { id },
  data: {
    description: body.description, // jika body.description bernilai undefined, Prisma/TS akan error!
  },
});
```

### ✅ Pola yang Wajib Digunakan:
```typescript
// Opsi A: Menggunakan ternary/coalescing eksplisit untuk field nullable
await prisma.banner.create({
  data: {
    title: body.title,
    description: body.description ?? null,
  },
});

// Opsi B: Untuk update dinamis, hanya sertakan key jika nilainya bukan undefined
await prisma.banner.update({
  where: { id },
  data: {
    ...(body.title !== undefined && { title: body.title }),
    ...(body.description !== undefined && { description: body.description ?? null }),
  },
});
```

---

## 3. Format Respons API Standar

Semua respons JSON dari endpoint publik maupun CMS wajib mengikuti format standar respons:

### A. Respons Sukses Tunggal:
```json
{
  "statusCode": 200,
  "code": "SUCCESS",
  "message": "Data berhasil diperbarui",
  "data": { ... }
}
```

### B. Respons Sukses Terpaginasi:
```json
{
  "statusCode": 200,
  "code": "SUCCESS",
  "message": "Daftar data berhasil diambil",
  "data": [ ... ],
  "meta": {
    "page": 1,
    "limit": 20,
    "totalItems": 150,
    "totalPages": 8,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

Gunakan helper dari `~/common/types/index.js` (`ok()`, `accepted()`, `buildPaginatedResult()`) untuk menjaga konsistensi response.

---

## 4. Penanganan Error & Eksepsi Baku

**Dilarang** melempar `new Error("...")` sembarangan di service atau controller. Selalu gunakan error classes resmi dari `~/common/errors/index.js`:

| Error Class | HTTP Status | Kapan Digunakan |
|---|:---:|---|
| `BadRequestError` | 400 | Validasi bisnis gagal (misal: format dimensi ImageKit tidak valid, parent menu circular). |
| `UnauthorizedError` | 401 | Autentikasi gagal, kredensial salah, atau token kedaluwarsa. |
| `ForbiddenError` | 403 | Pengguna tidak berhak mengakses aplikasi/fitur, atau mencoba mengubah data sistem yang dilindungi. |
| `NotFoundError` | 404 | Data entitas tidak ditemukan di database atau sudah terhapus (`deletedAt !== null`). |
| `ConflictError` | 409 | Nilai unik sudah dipakai (misal: slug bentrok, kode aplikasi ganda, username sudah terdaftar). |

```typescript
import { NotFoundError, ConflictError } from "~/common/errors/index.js";

const existing = await prisma.article.findUnique({ where: { slug } });
if (existing) {
  throw new ConflictError(`Artikel dengan slug "${slug}" sudah terdaftar`);
}
```

---

## 5. Praktik Logging & Debugging

- **Dilarang** menggunakan `console.log()` untuk data sensitif di production.
- Gunakan Fastify logger terstruktur (`request.log.info()`, `request.log.error()`).
- Untuk error asinkron pada background cleanup (misal ImageKit auto-delete), tangani dengan `.catch()` dan log secara aman:
  ```typescript
  ImageKitService.deleteFile(oldFileId).catch((err) => {
    request.log.warn({ err, fileId: oldFileId }, "Gagal menghapus file lama di ImageKit");
  });
  ```
