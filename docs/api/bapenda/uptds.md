# UPTD Samsat

- **Aplikasi:** `bapenda-profile` · **Prefix:** `/api/bapenda/uptds` · **Jumlah endpoint:** 9
- **Sumber kode:** `src/modules/bapenda/uptds/uptds.routes.ts`

Direktori kantor UPTD Samsat se-Provinsi Jambi: daftar publik dan peta.

## Ringkasan Endpoint

| No | Method | Path | Guard | Deskripsi |
|:--:|---|---|---|---|
| 1 | `GET` | `/public` | publik | Daftar UPTD aktif |
| 2 | `GET` | `/public/:code` | publik | Detail via kode (`UPTD-001`) |
| 3 | `GET` | `/` | `uptd:list` | Daftar CMS berpaginasi + filter |
| 4 | `GET` | `/:id` | `uptd:read` | Detail |
| 5 | `POST` | `/` | `uptd:create` | Tambah |
| 6 | `PUT` | `/:id` | `uptd:update` | Perbarui |
| 7 | `PATCH` | `/:id/active` | `uptd:update` | Aktif/nonaktif |
| 8 | `PATCH` | `/:id/map` | `uptd:update` | Tampil/tidak di peta publik |
| 9 | `DELETE` | `/:id` | `uptd:delete` | Soft-delete |

## Bentuk Objek

| Field | Tipe | Keterangan |
|---|---|---|
| `id` | string | UUID v7 |
| `code` | string | Unik, mis. `UPTD-001` |
| `name` | string | — |
| `description`, `address`, `phone`, `email`, `headName` | string \| null | — |
| `province` | string \| null | Bawaan `"Jambi"` saat dibuat |
| `city`, `district`, `subDistrict`, `postalCode` | string \| null | Wilayah administrasi |
| `latitude` | number \| null | −90…90 |
| `longitude` | number \| null | −180…180 |
| `googleMapsUrl` | string \| null | URL |
| `isActive` | boolean | — |
| `showOnPublicMap` | boolean | — |
| `createdAt`, `updatedAt` | string | ISO 8601 |

---

## 1. GET /api/bapenda/uptds/public

**Akses:** publik.

### Query Parameter

| Nama | Wajib | Tipe | Aturan | Keterangan |
|---|:--:|---|---|---|
| `search` | — | string | ≤100 karakter | Cari di `name`, `code`, `address`, `headName` |
| `city` | — | string | ≤100 karakter | Filter kota (contains, case-insensitive) |

Hanya `isActive: true` dan belum dihapus. Tanpa paginasi.

### Response 200

```json
{
  "statusCode": 200, "code": "SUCCESS", "message": "Daftar UPTD berhasil diambil",
  "data": [{
    "id": "...", "code": "UPTD-001", "name": "UPTD Samsat Kota Jambi",
    "description": null, "address": "Jl. ...", "phone": "0741-...", "email": null,
    "headName": "...", "province": "Jambi", "city": "Kota Jambi",
    "district": null, "subDistrict": null, "postalCode": null,
    "latitude": -1.61, "longitude": 103.61, "googleMapsUrl": null,
    "isActive": true, "showOnPublicMap": true,
    "createdAt": "...", "updatedAt": "..."
  }]
}
```

---

## 2. GET /api/bapenda/uptds/public/:code

**Akses:** publik.

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `code` | ✓ | string | 2–50 |

**Response 200:** satu objek. **Error:** `404` kode tidak ada atau nonaktif.

---

## 3. GET /api/bapenda/uptds

**Akses:** `authenticate` + `uptd:list` (aplikasi `bapenda-profile`).

### Query Parameter

| Nama | Wajib | Tipe | Aturan | Default | Keterangan |
|---|:--:|---|---|---|---|
| `page` | — | integer | ≥ 1 | `1` | — |
| `limit` | — | integer | 1–100 | `20` | — |
| `search` | — | string | ≤100 karakter | — | `name`, `code`, `headName`, `address` |
| `city` | — | string | ≤100 karakter | — | Filter kota |
| `isActive` | — | string | `"true"` \| `"false"` | — | Filter status |
| `showOnPublicMap` | — | string | `"true"` \| `"false"` | — | Filter tampil di peta |
| `sortBy` | — | enum | `name` \| `code` \| `city` \| `createdAt` | `name` | — |
| `sortOrder` | — | enum | `asc` \| `desc` | `asc` | — |

**Response 200:** `data[]` + `meta` (`totalItems`, `totalPages`, `hasNextPage`, `hasPreviousPage`).

---

## 4. GET /api/bapenda/uptds/:id

**Akses:** `authenticate` + `uptd:read`.

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `id` | ✓ | uuid | — |

**Response 200:** satu objek. **Error:** `404`.

---

## 5. POST /api/bapenda/uptds

**Akses:** `authenticate` + `uptd:create`.

### Request Body

| Field | Wajib | Tipe | Aturan | Default | Nullable |
|---|:--:|---|---|---|:--:|
| `code` | ✓ | string | 2–50, `^[a-z0-9_-]+$` (case-insensitive), unik | — | — |
| `name` | ✓ | string | 3–150 | — | — |
| `description` | — | string | — | — | — |
| `address` | — | string | — | — | — |
| `phone` | — | string | ≤30 | — | — |
| `email` | — | string | email valid, ≤100 | — | — |
| `headName` | — | string | ≤150 | — | — |
| `province` | — | string | ≤50 | `"Jambi"` | — |
| `city` | — | string | ≤100 | — | — |
| `district` | — | string | ≤100 | — | — |
| `subDistrict` | — | string | ≤100 | — | — |
| `postalCode` | — | string | ≤10 | — | — |
| `latitude` | — | number | −90…90 | — | ✓ |
| `longitude` | — | number | −180…180 | — | ✓ |
| `googleMapsUrl` | — | string | URL valid | — | ✓ |
| `isActive` | — | boolean | — | `true` | — |
| `showOnPublicMap` | — | boolean | — | `false` | — |

```json
{
  "code": "UPTD-012",
  "name": "UPTD Samsat Muara Bulian",
  "address": "Jl. ...",
  "city": "Batanghari",
  "latitude": -1.72, "longitude": 103.26,
  "isActive": true, "showOnPublicMap": true
}
```

**Response 201:** objek UPTD. **Error:** `409` kode sudah dipakai.

---

## 6. PUT /api/bapenda/uptds/:id

**Akses:** `authenticate` + `uptd:update`.

### Path Parameter

| Nama | Wajib | Tipe |
|---|:--:|---|
| `id` | ✓ | uuid |

### Request Body

`CreateUptdBodySchema.partial()` — semua field `POST` menjadi opsional, **termasuk `code`**.

**Response 200:** objek UPTD.

---

## 7. PATCH /api/bapenda/uptds/:id/active

**Akses:** `authenticate` + `uptd:update`.

### Request Body

| Field | Wajib | Tipe |
|---|:--:|---|
| `isActive` | ✓ | boolean |

**Response 200:** `{ statusCode, code, message, data: objek }`

---

## 8. PATCH /api/bapenda/uptds/:id/map

**Akses:** `authenticate` + `uptd:update`.

### Request Body

| Field | Wajib | Tipe | Keterangan |
|---|:--:|---|---|
| `showOnPublicMap` | ✓ | boolean | Hanya `true` yang dirender di peta portal |

**Response 200:** `{ statusCode, code, message, data: objek }`

---

## 9. DELETE /api/bapenda/uptds/:id

**Akses:** `authenticate` + `uptd:delete`.

### Path Parameter

| Nama | Wajib | Tipe |
|---|:--:|---|
| `id` | ✓ | uuid |

**Perilaku:** soft-delete.

**Response 200:** `{ statusCode, code, message, data: { id, deleted: true } }`
**Error:** `404`.

---

## Catatan Perilaku

- Seed: 11 kantor Samsat (`prisma/seeds/bapenda/uptds.json`).
- Status aktif dan status peta dipisah: kantor bisa tetap muncul di daftar tanpa tampil di peta.
- Urutan rute: `/public` dan `/public/:code` didaftarkan **sebelum** `/:id`.
