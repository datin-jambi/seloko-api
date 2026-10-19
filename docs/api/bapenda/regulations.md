# Regulasi & Dokumen

- **Aplikasi:** `bapenda-profile` · **Prefix:** `/api/bapenda/regulations` · **Jumlah endpoint:** 8
- **Sumber kode:** `src/modules/bapenda/regulations/regulations.routes.ts`
- **Status:** cukup `DRAFT` / `PUBLISHED` — tanpa alur review (PRD 02 §G)

## Ringkasan Endpoint

| No | Method | Path | Guard | Deskripsi |
|:--:|---|---|---|---|
| 1 | `GET` | `/public` | publik | Regulasi terbit (PDF), paginasi + cari |
| 2 | `GET` | `/public/:slug` | publik | Detail regulasi terbit |
| 3 | `GET` | `/` | `regulation:list` | Daftar CMS |
| 4 | `GET` | `/:id` | `regulation:read` | Detail untuk edit |
| 5 | `POST` | `/` | `regulation:create` | Buat (selalu draft) |
| 6 | `PUT` | `/:id` | `regulation:update` | Ubah |
| 7 | `PATCH` | `/:id/status` | `regulation:publish` | Terbit / tarik ke draft |
| 8 | `DELETE` | `/:id` | `regulation:delete` | Soft-delete + bersihkan berkas |

## Bentuk Objek Regulasi

| Field | Tipe | Keterangan |
|---|---|---|
| `id` | string | UUID v7 |
| `title` | string | 5–255 karakter |
| `slug` | string | Unik per aplikasi |
| `description` | string \| null | ≤5000 |
| `fileUrl` | string | URL PDF di ImageKit (wajib) |
| `fileId` | string \| null | ID ImageKit — untuk validasi & pembersihan |
| `fileName` | string \| null | Nama berkas asli |
| `fileSize` | integer \| null | Byte, ≤20 MB |
| `status` | enum | `DRAFT` \| `PUBLISHED` |
| `publishedAt` | string \| null | ISO 8601 |
| `createdAt`, `updatedAt` | string | ISO 8601 |

---

## 1. GET /api/bapenda/regulations/public

**Akses:** publik.

### Query Parameter

| Nama | Wajib | Tipe | Aturan | Default | Keterangan |
|---|:--:|---|---|---|---|
| `page` | — | integer | ≥ 1 | `1` | — |
| `limit` | — | integer | 1–50 | `10` | — |
| `search` | — | string | ≤100 karakter | — | Cari di judul & deskripsi |

Hanya `status: PUBLISHED`, urut `publishedAt DESC`.

### Response 200

```json
{
  "statusCode": 200, "code": "SUCCESS", "message": "Daftar regulasi berhasil diambil",
  "data": [{
    "id": "...", "title": "Pergub No. 12 Tahun 2024 tentang Tarif PKB",
    "slug": "pergub-no-12-tahun-2024-tentang-tarif-pkb",
    "description": "Peraturan Gubernur tentang Tarif Pajak Kendaraan Bermotor",
    "fileUrl": "https://ik.imagekit.io/.../pergub-12-2024.pdf",
    "fileId": null, "fileName": "pergub-12-2024.pdf", "fileSize": null,
    "status": "PUBLISHED", "publishedAt": "2024-01-14T17:00:00.000Z",
    "createdAt": "...", "updatedAt": "..."
  }],
  "meta": { "page": 1, "limit": 10, "totalItems": 4, "totalPages": 1, "hasNextPage": false, "hasPreviousPage": false }
}
```

---

## 2. GET /api/bapenda/regulations/public/:slug

**Akses:** publik.

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `slug` | ✓ | string | 1–255 |

**Error:** `404` slug tidak ada, terhapus, atau belum `PUBLISHED`.

---

## 3. GET /api/bapenda/regulations

**Akses:** `authenticate` + `regulation:list`.

### Query Parameter

| Nama | Wajib | Tipe | Aturan | Default |
|---|:--:|---|---|---|
| `page` | — | integer | ≥ 1 | `1` |
| `limit` | — | integer | 1–100 | `20` |
| `search` | — | string | ≤100 karakter | — |
| `status` | — | enum | 5 status konten | — |
| `sortBy` | — | enum | `createdAt`\|`updatedAt`\|`publishedAt`\|`title` | `createdAt` |
| `sortOrder` | — | enum | `asc`\|`desc` | `desc` |

---

## 4. GET /api/bapenda/regulations/:id

**Akses:** `authenticate` + `regulation:read`.

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `id` | ✓ | string | UUID |

---

## 5. POST /api/bapenda/regulations

**Akses:** `authenticate` + `regulation:create`.

### Body

| Nama | Wajib | Tipe | Aturan | Keterangan |
|---|:--:|---|---|---|
| `title` | ✓ | string | 5–255 | — |
| `slug` | — | string | ≤255 | Kosong = dari judul; bila diisi & dipakai → `409` |
| `description` | — | string \| null | ≤5000 | — |
| `fileUrl` | ✓ | string | URL | Dari `POST /api/storage/upload` |
| `fileId` | — | string \| null | ≤100 | Untuk validasi & pembersihan ImageKit |
| `fileName` | — | string \| null | ≤255 | — |
| `fileSize` | — | integer \| null | 0–52428800 | Byte |

Regulasi baru **selalu draft**. Berkas non-PDF tetap boleh disimpan sebagai draft, tetapi
**ditolak saat diterbitkan**.

**Response 201:** objek regulasi.

---

## 6. PUT /api/bapenda/regulations/:id

**Akses:** `authenticate` + `regulation:update`.

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `id` | ✓ | string | UUID |

### Body

Semua field endpoint 5, opsional (minimal satu).

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `title` | — | string | 5–255 |
| `slug` | — | string | ≤255 |
| `description` | — | string \| null | ≤5000 |
| `fileUrl` | — | string | URL |
| `fileId` | — | string \| null | ≤100 |
| `fileName` | — | string \| null | ≤255 |
| `fileSize` | — | integer \| null | 0–52428800 |

Bila regulasi sedang `PUBLISHED` dan berkas diganti, berkas pengganti divalidasi lebih dulu.
Berkas lama dihapus dari ImageKit **setelah** DB tersimpan.

---

## 7. PATCH /api/bapenda/regulations/:id/status

**Akses:** `authenticate` + `regulation:publish`.

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `id` | ✓ | string | UUID |

### Body

| Nama | Wajib | Tipe | Keterangan |
|---|:--:|---|---|
| `status` | ✓ | `DRAFT` \| `PUBLISHED` | `PUBLISHED` mengisi `publishedAt`; `DRAFT` mengosongkannya |

**Validasi saat terbit:**
- URL wajib berakhiran `.pdf` → selain itu `400`.
- Bila `fileId` terisi: berkas harus ada di ImageKit dan ≤20 MB.

`fileId` kosong **tidak** menghalangi penerbitan — dokumen hasil migrasi dari aplikasi lama
tidak menyimpan `fileId`, padahal sudah tayang di portal sebelumnya.

---

## 8. DELETE /api/bapenda/regulations/:id

**Akses:** `authenticate` + `regulation:delete`.

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `id` | ✓ | string | UUID |

Soft-delete, lalu berkas ImageKit dihapus asinkron (hanya bila `fileId` ada).

**Response 200:** `{ "id": "...", "deleted": true }`.

---

## Izin

| Entity | Grup | Aksi |
|---|---|---|
| `regulation` | `publishable` | create, read, update, delete, list, publish |

Role `editor` boleh membuat & mengubah, tanpa `publish`/`delete`.

## Data Awal

`prisma/seeds/bapenda/regulations.json` — dimigrasi dari aplikasi lama: **5 dokumen**
(4 `PUBLISHED`, 1 `DRAFT`). Semua `fileId` kosong karena aplikasi lama tidak menyimpannya.

## Ekstensi yang Belum Ada

PRD 02 §G menyebut opsi (belum ada di aplikasi lama, jadi belum dibuat): `type`
(PERDA/PERGUB/UU), `number`, `year`, `about`, serta status BERLAKU/DICABUT. Tambahkan bila
Bapenda memintanya — saat ini pengelompokan hanya lewat judul & pencarian.
