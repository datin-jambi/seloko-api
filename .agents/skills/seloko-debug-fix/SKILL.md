---
name: seloko-debug-fix
description: >-
  Runbook diagnosis, troubleshooting, dan perbaikan error umum pada SELOKO API.
  Gunakan skill ini saat terjadi error TypeScript (exactOptionalPropertyTypes), Prisma (P2002, P2025), Redis cache stale, atau kegagalan smoke test.
---

# 🔧 SELOKO Debug & Troubleshooting Runbook

Gunakan panduan ini saat mendiagnosis dan memperbaiki masalah teknis atau kegagalan uji coba pada `seloko-api`.

---

## 1. Error TypeScript: `exactOptionalPropertyTypes: true`

### Gejala:
```text
Type 'undefined' is not assignable to type 'string | null' with 'exactOptionalPropertyTypes: true'.
Consider adding 'undefined' to the types of the target's properties.
```

### Penyebab:
Properti opsional di Zod body bernilai `undefined`, lalu diteruskan langsung ke objek Prisma kueri.

### Solusi Cepat:
Gunakan *conditional property spreading* untuk kueri update, atau *null coalescing* untuk kueri create:

```typescript
// UPDATE: Hanya masukkan key jika field bukan undefined
const data: Prisma.EntityUpdateInput = {
  ...(body.name !== undefined && { name: body.name }),
  ...(body.description !== undefined && { description: body.description ?? null }),
  ...(body.fileId !== undefined && { fileId: body.fileId ?? null }),
};

// CREATE: Konversi undefined menjadi null eksplisit jika kolom DB nullable
const data: Prisma.EntityCreateInput = {
  name: body.name,
  description: body.description ?? null,
  fileId: body.fileId ?? null,
};
```

---

## 2. Error Prisma: `P2002` (Unique Constraint Violated)

### Gejala:
```text
Unique constraint failed on the fields: (`app_id`, `slug`)
```

### Penyebab:
1. Data dengan kombinasi `[applicationId, slug]` sudah ada di tabel.
2. Data yang ada berstatus **soft-deleted** (`deletedAt !== null`), tetapi index PostgreSQL tetap mendeteksinya sebagai duplikasi.

### Solusi Cepat:
Periksa keberadaan data terlebih dahulu sebelum melakukan create:
```typescript
const existing = await prisma.article.findFirst({
  where: { applicationId, slug: body.slug },
});

if (existing) {
  // Jika sebelumnya sudah di-soft-delete, restore kembali
  if (existing.deletedAt !== null) {
    return prisma.article.update({
      where: { id: existing.id },
      data: {
        ...payload,
        deletedAt: null,
        updatedAt: new Date(),
      },
    });
  }
  // Jika masih aktif, lemparkan ConflictError (409)
  throw new ConflictError(`Artikel dengan slug "${body.slug}" sudah digunakan`);
}
```

---

## 3. Error Prisma: `P2025` (Record Not Found on Delete/Update)

### Gejala:
```text
An operation failed because it depends on one or more records that were required but not found.
```

### Penyebab:
Pemanggilan `prisma.entity.update()` atau `prisma.entity.delete()` pada ID yang tidak ada atau sudah terhapus.

### Solusi Cepat:
Gunakan kueri `findFirst({ where: { id, deletedAt: null } })` lebih dulu:
```typescript
const existing = await prisma.entity.findFirst({
  where: { id, deletedAt: null },
});

if (!existing) {
  throw new NotFoundError("Entitas", id);
}
```

---

## 4. Cache Stale / Izin User Tidak Berubah di Redis

### Gejala:
Role atau permission pengguna sudah diubah di database, tetapi request API berikutnya masih membaca izin lama atau ditolak `requirePermission`.

### Solusi Cepat:
1. Pastikan controller atau service memanggil helper invalidasi Redis:
   ```typescript
   import { invalidatePermissionCache, invalidateAllUserPermissionCaches } from "~/config/redis.js";

   // Hapus cache izin spesifik satu aplikasi:
   await invalidatePermissionCache(userId, appCode);

   // Atau bersihkan izin di seluruh aplikasi:
   await invalidateAllUserPermissionCaches(userId);
   ```
2. Periksa apakah Redis server aktif. Jika Redis down, pastikan sistem menyertakan catatan degradasi (`CACHE_DEGRADED_NOTE`).

---

## 5. Kegagalan Smoke Test (`npm run db:smoke`)

Jika smoke test gagal:
1. Periksa apakah server Fastify sedang berjalan di latar belakang:
   - Server harus running di port 3000 (`http://localhost:3000/api`).
2. Jalankan smoke test per modul spesifik untuk mengisolasi masalah:
   ```bash
   npm run db:smoke -- applications
   npm run db:smoke -- banners
   npm run db:smoke -- uptds
   ```
3. Periksa status database dengan menjalankan typecheck:
   ```bash
   npm run typecheck
   ```
   *(Wajib 0 error sebelum menjalankan smoke test).*
