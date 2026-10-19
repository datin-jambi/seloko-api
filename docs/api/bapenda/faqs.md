# FAQ & Kategori FAQ

- **Aplikasi:** `bapenda-profile` · **Prefix:** `/api/bapenda/faqs` · **Jumlah endpoint:** 15
- **Sumber kode:** `src/modules/bapenda/faqs/faqs.routes.ts`
- **Alur terbit:** toggle `PATCH /:id/publish` — tanpa alur review (PRD 02 §F)

## Ringkasan Endpoint

| No | Method | Path | Guard | Deskripsi |
|:--:|---|---|---|---|
| 1 | `GET` | `/public` | publik | Seluruh FAQ terbit, filter kategori + cari |
| 2 | `GET` | `/public/categories` | publik | Kategori aktif |
| 3 | `POST` | `/public/:id/view` | publik | Tambah hitungan pembaca |
| 4 | `GET` | `/categories` | `faq-category:list` | Kategori untuk CMS |
| 5 | `POST` | `/categories` | `faq-category:create` | Tambah kategori |
| 6 | `PUT` | `/categories/:id` | `faq-category:update` | Perbarui kategori |
| 7 | `PATCH` | `/categories/:id/active` | `faq-category:update` | Aktif/nonaktif |
| 8 | `DELETE` | `/categories/:id` | `faq-category:delete` | Soft-delete; `409` bila dipakai |
| 9 | `PATCH` | `/reorder` | `faq:update` | Atur ulang urutan FAQ satu kategori |
| 10 | `GET` | `/` | `faq:list` | Daftar CMS |
| 11 | `GET` | `/:id` | `faq:read` | Detail untuk edit |
| 12 | `POST` | `/` | `faq:create` | Buat (selalu draft) |
| 13 | `PUT` | `/:id` | `faq:update` | Ubah |
| 14 | `PATCH` | `/:id/publish` | `faq:publish` | Terbit / tarik ke draft |
| 15 | `DELETE` | `/:id` | `faq:delete` | Soft-delete |

> `/reorder` didaftarkan sebelum `/:id` agar tidak tertangkap sebagai param.

## Bentuk Objek FAQ

| Field | Tipe | Keterangan |
|---|---|---|
| `id` | string | UUID v7 |
| `question` | string | 5–500 karakter |
| `slug` | string | Unik per aplikasi |
| `answer` | string | HTML tersanitasi |
| `sortOrder` | integer | Urutan dalam kategori (mulai 1) |
| `isPublished` | boolean | — |
| `viewCount` | integer | — |
| `publishedAt` | string \| null | ISO 8601 |
| `category` | object | `{ id, name, slug }` |
| `author`, `updatedBy` | object \| null | `{ id, fullName }` — **hanya CMS**; publik tidak membawa penulis |
| `createdAt`, `updatedAt` | string | ISO 8601 |

**Objek kategori:** `id`, `name`, `slug`, `description`, `sortOrder`, `isActive`.

---

## 1. GET /api/bapenda/faqs/public

**Akses:** publik.

### Query Parameter

| Nama | Wajib | Tipe | Aturan | Keterangan |
|---|:--:|---|---|---|
| `category` | — | string | ≤120 karakter | **Slug** kategori |
| `search` | — | string | ≤100 karakter | Cari di pertanyaan & jawaban |

- Tanpa paginasi (jumlah FAQ puluhan) — portal mengelompokkan per kategori.
- Urut `kategori.sortOrder`, lalu `sortOrder` FAQ.
- FAQ di **kategori nonaktif** ikut tersembunyi walau `isPublished: true`.

### Response 200

```json
{
  "statusCode": 200, "code": "SUCCESS", "message": "Daftar FAQ berhasil diambil",
  "data": [{
    "id": "...", "question": "Apa itu Pajak Kendaraan Bermotor (PKB)?",
    "slug": "apa-itu-pajak-kendaraan-bermotor-pkb",
    "answer": "Pajak Kendaraan Bermotor (PKB) adalah ...",
    "sortOrder": 1, "isPublished": true, "viewCount": 20,
    "publishedAt": "2026-06-17T04:25:45.546Z",
    "category": { "id": "...", "name": "Pajak Kendaraan Bermotor (PKB)", "slug": "pkb" },
    "createdAt": "...", "updatedAt": "..."
  }]
}
```

---

## 2. GET /api/bapenda/faqs/public/categories

**Akses:** publik.

### Query Parameter

Tidak ada.

**Response 200:** `data[]` kategori aktif, urut `sortOrder`.

---

## 3. POST /api/bapenda/faqs/public/:id/view

**Akses:** publik. Dipanggil portal saat pengunjung membuka jawaban (perilaku app lama).

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `id` | ✓ | string | UUID |

**Response 200:** `{ "id": "...", "viewCount": 21 }`.
**Error:** `404` FAQ tidak ada, draft, terhapus, atau kategorinya nonaktif — hitungan hanya
untuk FAQ yang benar-benar tayang.

---

## 4. GET /api/bapenda/faqs/categories

**Akses:** `authenticate` + `faq-category:list`.

### Query Parameter

| Nama | Wajib | Tipe | Aturan | Keterangan |
|---|:--:|---|---|---|
| `search` | — | string | ≤100 karakter | Cari di `name` |
| `isActive` | — | `"true"`\|`"false"` | — | Filter status |

---

## 5. POST /api/bapenda/faqs/categories

**Akses:** `authenticate` + `faq-category:create`.

### Body

| Nama | Wajib | Tipe | Aturan | Default | Keterangan |
|---|:--:|---|---|---|---|
| `name` | ✓ | string | 2–100 | — | — |
| `slug` | — | string | ≤120 | dari `name` | Bila diisi & sudah dipakai → `409` |
| `description` | — | string \| null | ≤1000 | — | — |
| `sortOrder` | — | integer | ≥ 0 | `0` | — |
| `isActive` | — | boolean | — | `true` | — |

**Response 201:** objek kategori.

---

## 6. PUT /api/bapenda/faqs/categories/:id

**Akses:** `authenticate` + `faq-category:update`.

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `id` | ✓ | string | UUID |

### Body

Semua field endpoint 5, opsional (minimal satu).

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `name` | — | string | 2–100 |
| `slug` | — | string | ≤120 |
| `description` | — | string \| null | ≤1000 |
| `sortOrder` | — | integer | ≥ 0 |
| `isActive` | — | boolean | — |

---

## 7. PATCH /api/bapenda/faqs/categories/:id/active

**Akses:** `authenticate` + `faq-category:update`.

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `id` | ✓ | string | UUID |

### Body

| Nama | Wajib | Tipe |
|---|:--:|---|
| `isActive` | ✓ | boolean |

Menonaktifkan kategori menyembunyikan seluruh FAQ-nya dari publik tanpa mengubah
`isPublished` masing-masing.

---

## 8. DELETE /api/bapenda/faqs/categories/:id

**Akses:** `authenticate` + `faq-category:delete`.

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `id` | ✓ | string | UUID |

**Error:** `409` kategori masih dipakai FAQ yang belum dihapus.

---

## 9. PATCH /api/bapenda/faqs/reorder

**Akses:** `authenticate` + `faq:update`.

### Body

| Nama | Wajib | Tipe | Aturan | Keterangan |
|---|:--:|---|---|---|
| `categoryId` | ✓ | string | UUID | Kategori yang diurutkan |
| `faqIds` | ✓ | string[] | UUID, 1–500 | **Seluruh** FAQ kategori itu dalam urutan baru |

Daftar kurang, berlebih, atau berisi duplikat ditolak `400` — mencegah FAQ tertinggal karena
klien memakai data basi. `sortOrder` ditulis ulang mulai 1 dalam satu transaksi.

**Response 200:** `data[]` FAQ kategori itu dalam urutan baru.

---

## 10. GET /api/bapenda/faqs

**Akses:** `authenticate` + `faq:list`.

### Query Parameter

| Nama | Wajib | Tipe | Aturan | Default | Keterangan |
|---|:--:|---|---|---|---|
| `page` | — | integer | ≥ 1 | `1` | — |
| `limit` | — | integer | 1–100 | `20` | — |
| `search` | — | string | ≤100 karakter | — | Cari di pertanyaan & jawaban |
| `categoryId` | — | string | UUID | — | — |
| `isPublished` | — | `"true"`\|`"false"` | — | — | — |
| `sortBy` | — | enum | `sortOrder`\|`createdAt`\|`updatedAt`\|`viewCount`\|`question` | `sortOrder` | — |
| `sortOrder` | — | enum | `asc`\|`desc` | `asc` | — |

**Response 200:** `data[]` + `meta` paginasi.

---

## 11. GET /api/bapenda/faqs/:id

**Akses:** `authenticate` + `faq:read`.

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `id` | ✓ | string | UUID |

---

## 12. POST /api/bapenda/faqs

**Akses:** `authenticate` + `faq:create`.

### Body

| Nama | Wajib | Tipe | Aturan | Keterangan |
|---|:--:|---|---|---|
| `categoryId` | ✓ | string | UUID | Kategori belum terhapus; selain itu `400` |
| `question` | ✓ | string | 5–500 | — |
| `slug` | — | string | ≤500 | Kosong = dari pertanyaan; bila diisi & dipakai → `409` |
| `answer` | ✓ | string | ≥5 | HTML, disanitasi server |
| `sortOrder` | — | integer | ≥ 0 | Kosong = di akhir kategori |

FAQ baru **selalu draft** (`isPublished: false`). **Response 201.**

---

## 13. PUT /api/bapenda/faqs/:id

**Akses:** `authenticate` + `faq:update`.

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `id` | ✓ | string | UUID |

### Body

Semua field endpoint 12, opsional (minimal satu).

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `categoryId` | — | string | UUID |
| `question` | — | string | 5–500 |
| `slug` | — | string | ≤500 |
| `answer` | — | string | ≥5 |
| `sortOrder` | — | integer | ≥ 0 |

`updatedBy` diisi pengubah terakhir.

---

## 14. PATCH /api/bapenda/faqs/:id/publish

**Akses:** `authenticate` + `faq:publish`.

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `id` | ✓ | string | UUID |

### Body

| Nama | Wajib | Tipe | Keterangan |
|---|:--:|---|---|
| `isPublished` | ✓ | boolean | `true` = terbit (`publishedAt` = sekarang), `false` = draft (`publishedAt` = null) |

---

## 15. DELETE /api/bapenda/faqs/:id

**Akses:** `authenticate` + `faq:delete`.

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `id` | ✓ | string | UUID |

**Response 200:** `{ "id": "...", "deleted": true }` (soft-delete).

---

## Izin

| Entity | Grup | Aksi |
|---|---|---|
| `faq` | `publishable` | create, read, update, delete, list, publish |
| `faq-category` | `content` | create, read, update, delete, list |

Role `editor` boleh membuat & mengubah, tanpa `publish`/`delete`.

## Data Awal

`prisma/seeds/bapenda/faqs.json` — dimigrasi dari aplikasi lama: 7 kategori (1 nonaktif:
*Program PEMUTIHAN*) dan 18 FAQ terbit. Yang tampil publik: **6 kategori, 17 FAQ**.
`viewCount` hanya ditulis saat baris dibuat — seed ulang tidak menimpa hitungan pembaca.
