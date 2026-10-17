# Banners

- **Aplikasi:** `bapenda-profile` · **Prefix:** `/api/bapenda/banners` · **Jumlah endpoint:** 8
- **Sumber kode:** `src/modules/bapenda/banners/banners.routes.ts`

Banner promosi portal, mendukung gambar **desktop** dan **mobile** terpisah.

## Ringkasan Endpoint

| No | Method | Path | Guard | Deskripsi |
|:--:|---|---|---|---|
| 1 | `GET` | `/public` | publik | Banner aktif untuk carousel |
| 2 | `GET` | `/` | `banner:list` | Daftar CMS berpaginasi |
| 3 | `GET` | `/:id` | `banner:read` | Detail |
| 4 | `POST` | `/` | `banner:create` | Tambah |
| 5 | `PUT` | `/:id` | `banner:update` | Perbarui |
| 6 | `PATCH` | `/:id/active` | `banner:update` | Aktif/nonaktif |
| 7 | `PATCH` | `/reorder` | `banner:update` | Urutkan ulang massal |
| 8 | `DELETE` | `/:id` | `banner:delete` | Soft-delete |

> `/reorder` didaftarkan **sebelum** `/:id`.

## Bentuk Objek

| Field | Tipe | Keterangan |
|---|---|---|
| `id`, `applicationId` | string | — |
| `title` | string | — |
| `description` | string \| null | — |
| `imageUrl` | string | Wajib |
| `imageFileId` | string \| null | Untuk hapus berkas lama |
| `mobileImageUrl` | string \| null | Kosong → frontend pakai `imageUrl` |
| `mobileImageFileId` | string \| null | — |
| `buttonText` | string \| null | ≤50 |
| `buttonUrl` | string \| null | ≤255 |
| `sortOrder` | integer | — |
| `isActive` | boolean | — |
| `createdAt`, `updatedAt` | string | ISO 8601 |

---

## 1. GET /api/bapenda/banners/public

**Akses:** publik.

### Query Parameter

| Nama | Wajib | Tipe | Aturan | Default | Keterangan |
|---|:--:|---|---|---|---|
| `limit` | — | integer | 1–20 | `10` | Jumlah banner |

Hanya `isActive: true`, urut `sortOrder ASC`.

### Response 200

```json
{
  "statusCode": 200, "code": "SUCCESS", "message": "Daftar banner berhasil diambil",
  "data": [{
    "id": "...", "applicationId": "...", "title": "Pemutihan Pajak 2026",
    "description": null,
    "imageUrl": "https://ik.imagekit.io/.../banner.jpg", "imageFileId": "abc123",
    "mobileImageUrl": null, "mobileImageFileId": null,
    "buttonText": "Selengkapnya", "buttonUrl": "https://...",
    "sortOrder": 1, "isActive": true,
    "createdAt": "...", "updatedAt": "..."
  }]
}
```

---

## 2. GET /api/bapenda/banners

**Akses:** `authenticate` + `banner:list`.

### Query Parameter

| Nama | Wajib | Tipe | Aturan | Default | Keterangan |
|---|:--:|---|---|---|---|
| `page` | — | integer | ≥ 1 | `1` | — |
| `limit` | — | integer | 1–100 | `20` | — |
| `search` | — | string | ≤100 karakter | — | Cari di `title` |
| `sortBy` | — | enum | `sortOrder` \| `createdAt` \| `title` | `sortOrder` | — |
| `sortOrder` | — | enum | `asc` \| `desc` | `asc` | — |

**Response 200:** `data[]` + `meta`.

---

## 3. GET /api/bapenda/banners/:id

**Akses:** `authenticate` + `banner:read`.

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `id` | ✓ | uuid | — |

**Response 200:** satu objek. **Error:** `404`.

---

## 4. POST /api/bapenda/banners

**Akses:** `authenticate` + `banner:create`.

### Request Body

| Field | Wajib | Tipe | Aturan | Default | Nullable | Keterangan |
|---|:--:|---|---|---|:--:|---|
| `title` | ✓ | string | 3–150 | — | — | — |
| `imageUrl` | ✓ | string | URL valid | — | — | Gambar desktop |
| `description` | — | string | — | — | ✓ | — |
| `imageFileId` | — | string | ≤100 | — | ✓ | Divalidasi ke ImageKit bila `isActive: true` |
| `mobileImageUrl` | — | string | URL valid | — | ✓ | — |
| `mobileImageFileId` | — | string | ≤100 | — | ✓ | Divalidasi ke ImageKit bila `isActive: true` |
| `buttonText` | — | string | ≤50 | — | ✓ | — |
| `buttonUrl` | — | string | ≤255 | — | ✓ | — |
| `sortOrder` | — | integer | — | `0` | — | — |
| `isActive` | — | boolean | — | `true` | — | — |

### Aturan Media

Saat `isActive: true`, `imageFileId` / `mobileImageFileId` **wajib valid** di ImageKit (ada,
ukuran & dimensi memenuhi batas). Draft boleh tanpa validasi.

```json
{
  "title": "Pemutihan Pajak 2026",
  "imageUrl": "https://ik.imagekit.io/o7kpef481o/bapenda/banner.jpg",
  "imageFileId": "66abc123def",
  "buttonText": "Selengkapnya",
  "buttonUrl": "https://bapenda.jambiprov.go.id/pemutihan",
  "sortOrder": 1,
  "isActive": true
}
```

**Response 201:** objek banner.
**Error:** `400` fileId tidak ditemukan di ImageKit / berkas terlalu besar.

---

## 5. PUT /api/bapenda/banners/:id

**Akses:** `authenticate` + `banner:update`.

### Path Parameter

| Nama | Wajib | Tipe |
|---|:--:|---|
| `id` | ✓ | uuid |

### Request Body

`CreateBannerBodySchema.partial()` — semua field `POST` opsional. Mengganti `imageFileId`
menghapus berkas lama di ImageKit secara asinkron.

**Response 200:** objek banner.

---

## 6. PATCH /api/bapenda/banners/:id/active

**Akses:** `authenticate` + `banner:update`.

### Request Body

| Field | Wajib | Tipe |
|---|:--:|---|
| `isActive` | ✓ | boolean |

**Response 200:** `{ statusCode, code, message, data: objek }`

---

## 7. PATCH /api/bapenda/banners/reorder

**Akses:** `authenticate` + `banner:update`.

### Request Body

| Field | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `items` | ✓ | array | minimal 1 item |
| `items[].id` | ✓ | uuid | — |
| `items[].sortOrder` | ✓ | integer | — |

```json
{ "items": [{ "id": "<uuid a>", "sortOrder": 1 }, { "id": "<uuid b>", "sortOrder": 2 }] }
```

**Response 200:** `{ statusCode, code, message, data: { updated: 2 } }`

---

## 8. DELETE /api/bapenda/banners/:id

**Akses:** `authenticate` + `banner:delete`.

### Path Parameter

| Nama | Wajib | Tipe |
|---|:--:|---|
| `id` | ✓ | uuid |

**Perilaku:** soft-delete + hapus berkas ImageKit terkait (asinkron).

**Response 200:** `{ statusCode, code, message, data: { id, deleted: true } }`

---

## Catatan Perilaku

- Bila `mobileImageUrl` kosong, frontend dianjurkan memakai `imageUrl` untuk semua perangkat.
- Seed: 3 banner (`prisma/seeds/bapenda/banners.json`).
- Urutan tampil sepenuhnya ditentukan `sortOrder`, bukan tanggal dibuat.
