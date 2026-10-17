# Halaman Profil (Pages)

- **Aplikasi:** `bapenda-profile` · **Prefix:** `/api/bapenda/pages` · **Jumlah endpoint:** 8
- **Sumber kode:** `src/modules/bapenda/pages/pages.routes.ts`

Halaman statis profil lembaga: sejarah, visi-misi, tupoksi, struktur organisasi, pejabat.
Tanpa alur review — halaman baru selalu draft, terbit/tarik lewat satu endpoint.

## Ringkasan Endpoint

| No | Method | Path | Guard | Deskripsi |
|:--:|---|---|---|---|
| 1 | `GET` | `/public` | publik | Daftar terbit **tanpa isi** (menu navigasi) |
| 2 | `GET` | `/public/:slug` | publik | Isi halaman terbit |
| 3 | `GET` | `/` | `page:list` | Daftar CMS berpaginasi |
| 4 | `GET` | `/:id` | `page:read` | Detail untuk form edit |
| 5 | `POST` | `/` | `page:create` | Tambah (draft) |
| 6 | `PUT` | `/:id` | `page:update` | Perbarui |
| 7 | `PATCH` | `/:id/publish` | `page:publish` | Terbitkan / tarik |
| 8 | `DELETE` | `/:id` | `page:delete` | Soft-delete |

## Bentuk Objek

| Field | Tipe | Keterangan |
|---|---|---|
| `id` | string | UUID v7 |
| `title` | string | 2–200 |
| `slug` | string | ≤220; **URL tetap** `/profil/<slug>` |
| `content` | string | HTML tersanitasi; tidak dikirim di daftar publik |
| `seoTitle` | string \| null | ≤255 |
| `seoDescription` | string \| null | ≤500 |
| `isPublished` | boolean | — |
| `publishedAt` | string \| null | ISO 8601 |
| `createdAt`, `updatedAt` | string | ISO 8601 |

---

## 1. GET /api/bapenda/pages/public

**Akses:** publik.

### Query Parameter

Tidak ada.

Hanya `isPublished: true`, urut `createdAt ASC`.

### Response 200

```json
{
  "statusCode": 200, "code": "SUCCESS", "message": "Daftar halaman berhasil diambil",
  "data": [{
    "id": "...", "title": "Sejarah", "slug": "sejarah",
    "seoTitle": "Sejarah BAPENDA Provinsi Jambi",
    "seoDescription": "Sejarah dan latar belakang Badan Pendapatan Daerah Provinsi Jambi",
    "isPublished": true, "publishedAt": "2026-06-22T19:29:09.151Z",
    "createdAt": "...", "updatedAt": "..."
  }]
}
```

`content` sengaja tidak disertakan agar payload menu tetap ringan.

---

## 2. GET /api/bapenda/pages/public/:slug

**Akses:** publik.

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `slug` | ✓ | string | 1–220 |

**Response 200:** satu halaman lengkap termasuk `content`.
**Error:** `404` slug tidak ada atau belum terbit.

---

## 3. GET /api/bapenda/pages

**Akses:** `authenticate` + `page:list`.

### Query Parameter

| Nama | Wajib | Tipe | Aturan | Default | Keterangan |
|---|:--:|---|---|---|---|
| `page` | — | integer | ≥ 1 | `1` | — |
| `limit` | — | integer | 1–100 | `20` | — |
| `search` | — | string | ≤100 karakter | — | Cari di `title` dan `slug` |
| `isPublished` | — | string | `"true"` \| `"false"` | — | Filter status terbit |
| `sortBy` | — | enum | `title` \| `createdAt` \| `updatedAt` | `title` | — |
| `sortOrder` | — | enum | `asc` \| `desc` | `asc` | — |

**Response 200:** `data[]` + `meta`.

---

## 4. GET /api/bapenda/pages/:id

**Akses:** `authenticate` + `page:read`.

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `id` | ✓ | uuid | — |

**Response 200:** satu halaman termasuk `content`. **Error:** `404`.

---

## 5. POST /api/bapenda/pages

**Akses:** `authenticate` + `page:create`.

### Request Body

| Field | Wajib | Tipe | Aturan | Nullable | Keterangan |
|---|:--:|---|---|:--:|---|
| `title` | ✓ | string | 2–200 | — | — |
| `content` | ✓ | string | ≥10 karakter | — | HTML; disanitasi |
| `slug` | — | string | ≤220 | — | Kosong → dibentuk dari judul |
| `seoTitle` | — | string | ≤255 | ✓ | — |
| `seoDescription` | — | string | ≤500 | ✓ | — |

```json
{
  "title": "Struktur Organisasi",
  "content": "<h2>Struktur Organisasi</h2><p>Bapenda dipimpin oleh...</p>",
  "slug": "struktur-organisasi"
}
```

### Aturan Bisnis

Slug adalah URL tetap `/profil/<slug>`. **Tidak** ada akhiran otomatis `-2`: bentrok ditolak `409`
agar URL tidak berubah diam-diam.

**Response 201:** objek halaman dengan `isPublished: false`.

---

## 6. PUT /api/bapenda/pages/:id

**Akses:** `authenticate` + `page:update`.

### Path Parameter

| Nama | Wajib | Tipe |
|---|:--:|---|
| `id` | ✓ | uuid |

### Request Body

`CreatePageBodySchema.partial()` — semua field `POST` opsional. Minimal satu.

**Perilaku:** mengganti `slug` memutus URL lama — lakukan hanya bila disengaja.

**Response 200:** objek halaman.

---

## 7. PATCH /api/bapenda/pages/:id/publish

**Akses:** `authenticate` + `page:publish`.

### Path Parameter

| Nama | Wajib | Tipe |
|---|:--:|---|
| `id` | ✓ | uuid |

### Request Body

| Field | Wajib | Tipe | Keterangan |
|---|:--:|---|---|
| `isPublished` | ✓ | boolean | `true` → `publishedAt` diisi; `false` → dikosongkan |

```json
{ "isPublished": true }
```

**Response 200:** objek halaman.

---

## 8. DELETE /api/bapenda/pages/:id

**Akses:** `authenticate` + `page:delete`.

### Path Parameter

| Nama | Wajib | Tipe |
|---|:--:|---|
| `id` | ✓ | uuid |

**Response 200:** `{ statusCode, code, message, data: { id, deleted: true } }`

---

## Catatan Perilaku

- Diuji suite smoke `pages` (20 skenario) dan `src/common/utils/html.check.ts`.
- Seed: 5 halaman dari aplikasi lama, semuanya terbit. Aplikasi lama tidak menyimpan
  `publishedAt`, jadi diisi dari `updatedAt` saat migrasi.
- Halaman Pejabat berisi tabel `colspan`/`rowspan` + warna teks — sanitasi diperluas agar tabel
  tidak rusak (sebelumnya 1305 → 689 karakter).
