# Galeri

- **Aplikasi:** `bapenda-profile` · **Prefix:** `/api/bapenda/galleries` · **Jumlah endpoint:** 11
- **Sumber kode:** `src/modules/bapenda/galleries/galleries.routes.ts`
- **Logika bersama:** alur status & validasi gambar dari `src/modules/shared/article/` (sama dengan berita, PRD 02 §4)

## Ringkasan Endpoint

| No | Method | Path | Guard | Deskripsi |
|:--:|---|---|---|---|
| 1 | `GET` | `/public` | publik | Galeri terbit + `itemCount` |
| 2 | `GET` | `/public/:slug` | publik | Detail galeri terbit + item |
| 3 | `GET` | `/` | `gallery:list` | Daftar CMS |
| 4 | `GET` | `/:id` | `gallery:read` | Detail + item untuk edit |
| 5 | `POST` | `/` | `gallery:create` | Buat (status `DRAFT`), item awal opsional |
| 6 | `PUT` | `/:id` | `gallery:update` | Ubah data (penulis: hanya `DRAFT`/`REJECTED`) |
| 7 | `PATCH` | `/:id/status` | `gallery:read` + izin aksi | Transisi alur review |
| 8 | `DELETE` | `/:id` | `gallery:delete` | Soft-delete + bersihkan berkas ImageKit |
| 9 | `POST` | `/:id/items` | `gallery:update` | Tambah item (di urutan akhir) |
| 10 | `PATCH` | `/:id/items/reorder` | `gallery:update` | Atur ulang urutan item |
| 11 | `DELETE` | `/:id/items/:itemId` | `gallery:update` | Hapus satu item + berkasnya |

## Alur Status

Sama dengan berita ([news.md](./news.md)) — satu sumber aturan `TRANSITIONS` di `shared/article`.

| Aksi | Dari | Izin yang diperiksa |
|---|---|---|
| `submit` | `DRAFT`, `REJECTED` | tidak perlu izin khusus |
| `approve` | `PENDING_REVIEW` | `gallery:approve` |
| `reject` | `PENDING_REVIEW` | `gallery:reject` |
| `publish` | `APPROVED`, `DRAFT` | `gallery:publish` |
| `unpublish` | `PUBLISHED` | `gallery:publish` |

Aturan tambahan khusus galeri:
- **Galeri tanpa item ditolak terbit** (`400`) — halaman publiknya akan kosong.
- **Item terakhir galeri yang terbit tidak boleh dihapus** (`400`); tarik dulu dari publikasi.
- Penulis tanpa `gallery:approve` hanya melihat & mengubah galeri miliknya, dan hanya saat
  `DRAFT`/`REJECTED` — termasuk menambah, mengurutkan, dan menghapus item.

## Bentuk Objek Galeri

| Field | Tipe | Keterangan |
|---|---|---|
| `id` | string | UUID v7 |
| `title` | string | 5–200 karakter |
| `slug` | string | Unik per aplikasi |
| `description` | string \| null | Teks polos |
| `coverImageUrl`, `coverImageFileId` | string \| null | ImageKit |
| `status` | enum | `DRAFT` \| `PENDING_REVIEW` \| `APPROVED` \| `REJECTED` \| `PUBLISHED` |
| `publishedAt` | string \| null | ISO 8601 |
| `author` | object | `{ id, fullName }` — tanpa email/NIP |
| `items` | array | Hanya di detail; urut `sortOrder` |
| `itemCount` | integer | Hanya di daftar |
| `createdAt`, `updatedAt` | string | ISO 8601 |

**Objek item:** `id`, `mediaType` (`IMAGE`\|`VIDEO`\|`PDF`), `fileUrl`, `fileId`, `title`,
`description`, `sortOrder`, `createdAt`.

---

## 1. GET /api/bapenda/galleries/public

**Akses:** publik.

### Query Parameter

| Nama | Wajib | Tipe | Aturan | Default | Keterangan |
|---|:--:|---|---|---|---|
| `page` | — | integer | ≥ 1 | `1` | — |
| `limit` | — | integer | 1–50 | `12` | — |
| `search` | — | string | ≤100 karakter | — | Cari di judul |

Hanya `status: PUBLISHED`, urut `publishedAt DESC`. Galeri milik OPD (Lapak) tidak ikut.

### Response 200

```json
{
  "statusCode": 200, "code": "SUCCESS", "message": "Daftar galeri berhasil diambil",
  "data": [{
    "id": "...", "title": "Bapenda Provinsi Jambi Ikuti Workshop ... TP2DD Tahun 2026",
    "slug": "bapenda-provinsi-jambi-ikuti-workshop-...", "description": "Jambi, 23 April 2026 – ...",
    "coverImageUrl": "https://ik.imagekit.io/...", "status": "PUBLISHED",
    "publishedAt": "2026-06-26T00:52:32.889Z",
    "author": { "id": "...", "fullName": "Andi Saputra" },
    "itemCount": 2, "createdAt": "...", "updatedAt": "..."
  }],
  "meta": { "page": 1, "limit": 12, "totalItems": 1, "totalPages": 1, "hasNextPage": false, "hasPreviousPage": false }
}
```

---

## 2. GET /api/bapenda/galleries/public/:slug

**Akses:** publik.

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `slug` | ✓ | string | 1–220 |

**Response 200:** satu galeri terbit beserta `items[]` (item terhapus tidak ikut).
**Error:** `404` slug tidak ada, terhapus, atau belum `PUBLISHED`.

---

## 3. GET /api/bapenda/galleries

**Akses:** `authenticate` + `gallery:list`.

### Query Parameter

| Nama | Wajib | Tipe | Aturan | Default | Keterangan |
|---|:--:|---|---|---|---|
| `page` | — | integer | ≥ 1 | `1` | — |
| `limit` | — | integer | 1–100 | `20` | — |
| `search` | — | string | ≤100 karakter | — | Cari di judul |
| `status` | — | enum | 5 status konten | — | — |
| `sortBy` | — | enum | `createdAt`\|`updatedAt`\|`publishedAt`\|`title` | `createdAt` | — |
| `sortOrder` | — | enum | `asc`\|`desc` | `desc` | — |

Penulis tanpa `gallery:approve` hanya menerima galeri miliknya.

---

## 4. GET /api/bapenda/galleries/:id

**Akses:** `authenticate` + `gallery:read`.

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `id` | ✓ | string | UUID |

**Error:** `404` tidak ada, terhapus, atau milik penulis lain (bagi penulis tanpa hak approve).

---

## 5. POST /api/bapenda/galleries

**Akses:** `authenticate` + `gallery:create`.

### Body

| Nama | Wajib | Tipe | Aturan | Keterangan |
|---|:--:|---|---|---|
| `title` | ✓ | string | 5–200 | — |
| `slug` | — | string | ≤220 | Kosong = dibentuk dari judul; bila diisi & sudah dipakai → `409` |
| `description` | — | string \| null | ≤10000 | — |
| `coverImageUrl` | — | string \| null | URL | Dari `/api/storage/upload` |
| `coverImageFileId` | — | string \| null | ≤100 | Untuk validasi & pembersihan ImageKit |
| `items` | — | array | ≤50 | Item awal; bentuk sama dengan `items[]` di endpoint 9 |

**Response 201:** galeri `DRAFT` beserta item.

---

## 6. PUT /api/bapenda/galleries/:id

**Akses:** `authenticate` + `gallery:update`.

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `id` | ✓ | string | UUID |

### Body

Semua field endpoint 5 kecuali `items`, seluruhnya opsional (minimal satu).

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `title` | — | string | 5–200 |
| `slug` | — | string | ≤220 |
| `description` | — | string \| null | ≤10000 |
| `coverImageUrl` | — | string \| null | URL |
| `coverImageFileId` | — | string \| null | ≤100 |

- Sampul diganti → berkas lama dihapus dari ImageKit **setelah** DB tersimpan.
- Galeri `PUBLISHED` yang sampulnya diganti divalidasi ke ImageKit (≤3 MB, landscape, lebar ≥600 px).
- **Error:** `403` penulis mengubah galeri di luar `DRAFT`/`REJECTED`.

---

## 7. PATCH /api/bapenda/galleries/:id/status

**Akses:** `authenticate` + `gallery:read`, lalu izin aksi pada tabel Alur Status.

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `id` | ✓ | string | UUID |

### Body

| Nama | Wajib | Tipe | Aturan | Keterangan |
|---|:--:|---|---|---|
| `action` | ✓ | enum | `submit`\|`approve`\|`reject`\|`publish`\|`unpublish` | — |
| `note` | — | string | ≤500 | Masuk audit log (mis. alasan tolak) |

- `publish` mengisi `publishedAt`; `unpublish` mengosongkannya dan kembali ke `DRAFT`.
- Setiap transisi tercatat di audit log (`gallery.<aksi>`).
- **Error:** `400` transisi tidak sah / galeri tanpa item saat `publish`; `403` tanpa izin aksi.

---

## 8. DELETE /api/bapenda/galleries/:id

**Akses:** `authenticate` + `gallery:delete`.

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `id` | ✓ | string | UUID |

Soft-delete galeri **dan** seluruh itemnya dalam satu transaksi, lalu berkas sampul + item
dihapus dari ImageKit secara asinkron (PRD 02 §E).

**Response 200:** `{ "id": "...", "deleted": true }`.

---

## 9. POST /api/bapenda/galleries/:id/items

**Akses:** `authenticate` + `gallery:update`.

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `id` | ✓ | string | UUID |

### Body

| Nama | Wajib | Tipe | Aturan | Keterangan |
|---|:--:|---|---|---|
| `items` | ✓ | array | 1–50 | Daftar item baru |
| `items[].mediaType` | — | enum | `IMAGE`\|`VIDEO`\|`PDF` | Default `IMAGE` |
| `items[].fileUrl` | ✓ | string | URL | Dari `/api/storage/upload` |
| `items[].fileId` | — | string \| null | ≤100 | Untuk pembersihan ImageKit |
| `items[].title` | — | string \| null | ≤150 | — |
| `items[].description` | — | string \| null | ≤1000 | — |

Item baru ditaruh setelah item terakhir. **Response 201:** seluruh item aktif galeri.

---

## 10. PATCH /api/bapenda/galleries/:id/items/reorder

**Akses:** `authenticate` + `gallery:update`.

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `id` | ✓ | string | UUID |

### Body

| Nama | Wajib | Tipe | Aturan | Keterangan |
|---|:--:|---|---|---|
| `itemIds` | ✓ | string[] | UUID, 1–200 | **Seluruh** item aktif dalam urutan baru |

Daftar yang kurang, berlebih, atau berisi duplikat ditolak `400` — mencegah item "hilang"
dari urutan karena klien memakai data basi. Diperbarui dalam satu transaksi.

**Response 200:** seluruh item aktif dalam urutan baru.

---

## 11. DELETE /api/bapenda/galleries/:id/items/:itemId

**Akses:** `authenticate` + `gallery:update`.

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `id` | ✓ | string | UUID galeri |
| `itemId` | ✓ | string | UUID item |

Soft-delete item lalu berkasnya dihapus dari ImageKit secara asinkron.

**Error:** `404` item bukan milik galeri ini; `400` item terakhir galeri `PUBLISHED`.

---

## Data Awal

`prisma/seeds/bapenda/galleries.json` — dimigrasi dari aplikasi lama (3 galeri, 7 item).
Galeri & item yang sudah terhapus di aplikasi lama ikut dibawa beserta `deletedAt`, sehingga
yang tampil publik: **1 galeri, 2 item**. `publishedAt` galeri lama tidak tercatat, diisi
dari `updatedAt`.
