# Banners

- **Aplikasi:** `bapenda-profile`
- **Prefix:** `/api/bapenda/banners`
- **Sumber kode:** `src/modules/bapenda/banners/banners.routes.ts`
- **Jumlah endpoint:** 8

Banner promosi portal, mendukung gambar desktop **dan** mobile terpisah.

## Ringkasan Endpoint

| No | Method | Path | Akses | Deskripsi |
|:--:|---|---|---|---|
| 1 | `GET` | `/public` | publik | Banner aktif untuk carousel portal, urut `sortOrder`. |
| 2 | `GET` | `/` | `banner:list` | Daftar CMS: paginasi, cari, urut. |
| 3 | `GET` | `/:id` | `banner:read` | Detail banner. |
| 4 | `POST` | `/` | `banner:create` | Tambah banner. |
| 5 | `PUT` | `/:id` | `banner:update` | Perbarui banner. |
| 6 | `PATCH` | `/:id/active` | `banner:update` | Aktif/nonaktif. |
| 7 | `PATCH` | `/reorder` | `banner:update` | Urutkan ulang massal. |
| 8 | `DELETE` | `/:id` | `banner:delete` | Soft-delete. |

## Detail Endpoint

### GET /bapenda/banners/public
- **Query:** `limit` (1–20, bawaan 10).
- **Response 200:** banner `isActive: true` urut `sortOrder`:
  ```json
  {
    "statusCode": 200, "code": "SUCCESS", "message": "...",
    "data": [{
      "id": "...", "title": "...", "description": null,
      "imageUrl": "https://ik.imagekit.io/...", "imageFileId": "abc123",
      "mobileImageUrl": "...", "mobileImageFileId": "...",
      "linkUrl": "https://...", "sortOrder": 1, "isActive": true,
      "createdAt": "...", "updatedAt": "..."
    }]
  }
  ```

### GET /bapenda/banners
- **Query:** `page`, `limit` (1–100), `search?` (judul),
  `sortBy` (`sortOrder`/`createdAt`/`title`), `sortOrder` (`asc`/`desc`).
- **Response 200:** `data[]` + `meta`.

### GET /bapenda/banners/:id
- **Response 200:** satu objek. **Error:** `404`.

### POST /bapenda/banners
- **Body:** `title`, `description?`, `imageUrl` (wajib, URL), `imageFileId?`,
  `mobileImageUrl?`, `mobileImageFileId?`, `linkUrl?`, `sortOrder?`, `isActive?`.
- **Aturan media:** saat `isActive: true`, `imageFileId`/`mobileImageFileId` divalidasi ke ImageKit
  (harus ada, ukuran & dimensi memenuhi batas). Draft boleh tanpa validasi.
- **Response 201:** objek banner.
- **Error:** `400` fileId tidak ditemukan di ImageKit / berkas terlalu besar.

### PUT /bapenda/banners/:id
- **Body:** subset field `POST`. Minimal satu.
- **Perilaku:** mengganti `imageFileId` menghapus berkas lama di ImageKit secara asinkron.
- **Response 200:** objek banner.

### PATCH /bapenda/banners/:id/active
- **Body:** `{ "isActive": boolean }`

### PATCH /bapenda/banners/reorder
- **Body:** `{ "items": [{ "id": "uuid", "sortOrder": 1 }, ...] }`
- **Response 200:** `{ statusCode, code, message, data: { updated: N } }`

### DELETE /bapenda/banners/:id
- **Perilaku:** soft-delete + hapus berkas ImageKit terkait.

## Catatan Perilaku
- Bila `mobileImageUrl` kosong, frontend dianjurkan memakai `imageUrl` untuk semua perangkat.
- Seed: 3 banner (`prisma/seeds/bapenda/banners.json`).
- Urutan tampil sepenuhnya ditentukan `sortOrder` (asc), bukan tanggal dibuat.
