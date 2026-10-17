# Organizations (OPD / Unit Kerja)

- **Aplikasi:** `seloko` · **Prefix:** `/api/organizations` · **Jumlah endpoint:** 8
- **Sumber kode:** `src/modules/core/organizations/organizations.routes.ts`

Master unit kerja pemerintah lintas aplikasi. **Application** = perangkat lunak (batas menu &
permission); **Organization** = unit kerja (batas data). Hierarki lewat `parentId` (OPD → UPTD).

## Ringkasan Endpoint

| No | Method | Path | Guard | Deskripsi |
|:--:|---|---|---|---|
| 1 | `GET` | `/public` | publik | Daftar OPD aktif untuk filter katalog |
| 2 | `GET` | `/public/:code` | publik | Profil OPD via kode |
| 3 | `GET` | `/` | `organization:list` | Daftar berpaginasi + filter |
| 4 | `GET` | `/:id` | `organization:read` | Detail + induk + jumlah turunan |
| 5 | `POST` | `/` | `organization:create` | Tambah organisasi |
| 6 | `PUT` | `/:id` | `organization:update` | Perbarui / pindahkan induk |
| 7 | `PATCH` | `/:id/active` | `organization:update` | Aktif/nonaktif + turunannya |
| 8 | `DELETE` | `/:id` | `organization:delete` | Soft-delete |

## Bentuk Objek

| Field | Tipe | Keterangan |
|---|---|---|
| `id` | string | UUID v7 |
| `code` | string | Unik **global**, mis. `BPSDM` |
| `name` | string | Nama lengkap |
| `shortName` | string \| null | Nama pendek untuk tampilan |
| `type` | enum | `OPD` \| `UPTD` \| `BIRO` \| `LAINNYA` |
| `parentId` | string \| null | Induk hierarki |
| `description`, `address`, `phone`, `email`, `website` | string \| null | Kontak |
| `logoUrl`, `logoFileId` | string \| null | ImageKit |
| `isActive` | boolean | — |
| `createdAt`, `updatedAt` | string | ISO 8601 |

---

## 1. GET /api/organizations/public

**Akses:** publik (header `X-App-Code` tetap wajib).

### Query Parameter

| Nama | Wajib | Tipe | Aturan | Default | Keterangan |
|---|:--:|---|---|---|---|
| `type` | — | enum | `OPD` \| `UPTD` \| `BIRO` \| `LAINNYA` | — | Filter jenis |
| `search` | — | string | ≤100 karakter | — | Cari di `name` dan `shortName` |

**Urutan:** `name ASC`. Tanpa paginasi. Hanya `isActive: true` dan belum dihapus.

### Response 200

```json
{
  "success": true, "message": "Daftar OPD berhasil diambil",
  "data": [{
    "id": "01a149d6-2834-7c71-8879-98b675db5319", "code": "BPSDM",
    "name": "Badan Pengembangan Sumber Daya Manusia Provinsi Jambi", "shortName": "BPSDM",
    "type": "OPD", "parentId": null,
    "description": null, "address": null, "phone": null, "email": null, "website": null,
    "logoUrl": null, "logoFileId": null,
    "isActive": true,
    "createdAt": "2026-10-18T05:00:00.000Z", "updatedAt": "2026-10-18T05:00:00.000Z"
  }]
}
```

Tidak ada penugasan role atau data internal di respons ini.

---

## 2. GET /api/organizations/public/:code

**Akses:** publik.

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `code` | ✓ | string | 2–50, `^[A-Za-z0-9_-]+$` |

**Response 200:** `{ success, message, data: objek }`
**Error:** `404` kode tidak ada atau nonaktif.

---

## 3. GET /api/organizations

**Akses:** `authenticate` + `organization:list`.

### Query Parameter

| Nama | Wajib | Tipe | Aturan | Default | Keterangan |
|---|:--:|---|---|---|---|
| `page` | — | integer | ≥ 1 | `1` | — |
| `limit` | — | integer | 1–100 | `20` | — |
| `search` | — | string | ≤100 karakter | — | Cari di `code`, `name`, `shortName` |
| `type` | — | enum | `OPD` \| `UPTD` \| `BIRO` \| `LAINNYA` | — | Filter jenis |
| `isActive` | — | string | `"true"` \| `"false"` | — | Filter status |
| `parentId` | — | uuid | — | — | Anak dari organisasi tertentu |
| `rootsOnly` | — | string | `"true"` | — | Hanya baris tanpa induk — isi dropdown "OPD induk" |
| `sortBy` | — | enum | `code` \| `name` \| `createdAt` | `code` | — |
| `sortOrder` | — | enum | `asc` \| `desc` | `asc` | — |

### Contoh Request

```
GET /api/organizations?page=1&limit=20&type=OPD&rootsOnly=true&isActive=true
```

**Response 200:** `data[]` (bentuk objek) + `meta` paginasi Core (`total`, bukan `totalItems`).

---

## 4. GET /api/organizations/:id

**Akses:** `authenticate` + `organization:read`.

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `id` | ✓ | uuid | — |

### Response 200

Field objek + tambahan:

| Field | Tipe | Keterangan |
|---|---|---|
| `parent` | object \| null | `{ id, code, name }` |
| `counts.children` | integer | Jumlah sub-unit aktif |
| `counts.userAppRoleScopes` | integer | Berapa penugasan role memakai OPD ini |

```json
{
  "success": true, "message": "Detail organisasi berhasil diambil",
  "data": {
    "id": "...", "code": "BAPELKES", "name": "Balai Pelatihan Kesehatan Provinsi Jambi",
    "shortName": "Bapelkes", "type": "UPTD", "parentId": "...",
    "parent": { "id": "...", "code": "DINKES", "name": "Dinas Kesehatan Provinsi Jambi" },
    "counts": { "children": 0, "userAppRoleScopes": 3 },
    "isActive": true, "createdAt": "...", "updatedAt": "..."
  }
}
```

**Error:** `400` id bukan UUID · `404`.

---

## 5. POST /api/organizations

**Akses:** `authenticate` + `organization:create`.

### Request Body

| Field | Wajib | Tipe | Aturan | Default | Nullable | Keterangan |
|---|:--:|---|---|---|:--:|---|
| `code` | ✓ | string | 2–50, `^[A-Za-z0-9_-]+$`, unik global | — | — | Kunci seeder & URL publik |
| `name` | ✓ | string | 2–200 | — | — | Nama lengkap |
| `shortName` | — | string | ≤100 | — | ✓ | — |
| `type` | — | enum | `OPD` \| `UPTD` \| `BIRO` \| `LAINNYA` | `OPD` | — | — |
| `parentId` | — | uuid | harus organisasi yang ada | — | ✓ | Induk hierarki |
| `description` | — | string | ≤1000 | — | ✓ | — |
| `address` | — | string | ≤500 | — | ✓ | — |
| `phone` | — | string | ≤30 | — | ✓ | — |
| `email` | — | string | format email, ≤100 | — | ✓ | — |
| `website` | — | string | URL valid, ≤255 | — | ✓ | — |
| `logoUrl` | — | string | URL valid, ≤500 | — | ✓ | — |
| `logoFileId` | — | string | ≤100 | — | ✓ | — |
| `isActive` | — | boolean | — | `true` | — | — |

```json
{
  "code": "DISHUB",
  "name": "Dinas Perhubungan Provinsi Jambi",
  "shortName": "Dishub",
  "type": "OPD",
  "email": "dishub@jambiprov.go.id",
  "isActive": true
}
```

### Aturan Bisnis

- `code` unik **global** (bukan per tenant): satu OPD adalah entitas pemerintah yang sama di semua
  aplikasi.
- `parentId` harus menunjuk organisasi yang belum dihapus.

**Response 201:** objek organisasi.
**Error:** `409` kode sudah dipakai · `400` induk tidak ditemukan / validasi gagal.

---

## 6. PUT /api/organizations/:id

**Akses:** `authenticate` + `organization:update`.

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `id` | ✓ | uuid | — |

### Request Body

Semua field `POST` **kecuali `code`** (kode tidak dapat diubah). Minimal satu field.

| Field | Wajib | Tipe | Aturan | Nullable |
|---|:--:|---|---|:--:|
| `name` | — | string | 2–200 | — |
| `shortName` | — | string | ≤100 | ✓ |
| `type` | — | enum | `OPD` \| `UPTD` \| `BIRO` \| `LAINNYA` | — |
| `parentId` | — | uuid | induk ≠ diri sendiri; tidak boleh membentuk siklus | ✓ (`null` = lepas induk) |
| `description`, `address`, `phone`, `email`, `website`, `logoUrl`, `logoFileId` | — | string | sesuai `POST` | ✓ |
| `isActive` | — | boolean | — | — |

```json
{ "parentId": "<uuid DINKES>" }
```

**Response 200:** objek organisasi.
**Error:** `400` induk = diri sendiri, siklus hierarki, atau induk tidak ada · `404`.

---

## 7. PATCH /api/organizations/:id/active

**Akses:** `authenticate` + `organization:update`.

### Request Body

| Field | Wajib | Tipe | Aturan | Keterangan |
|---|:--:|---|---|---|
| `isActive` | ✓ | boolean | — | `false` **menurun ke seluruh sub-unit** |

**Response 200:** `{ success, message, data: objek }`

**Catatan:** mengaktifkan kembali hanya mengaktifkan baris yang disebut; sub-unit tetap nonaktif
sampai diaktifkan sendiri.

---

## 8. DELETE /api/organizations/:id

**Akses:** `authenticate` + `organization:delete`.

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `id` | ✓ | uuid | — |

**Perilaku:** soft-delete (`deletedAt` diisi).

**Response 200:** `{ success: true, message: "Organisasi berhasil dihapus", data: null }`

**Error:**
- `409` masih punya sub-unit **aktif** (yang sudah soft-delete tidak menahan)
- `409` masih dipakai pada penugasan role

---

## Catatan Perilaku

- Seed awal (9): `BPKPD`, `BPSDM`, `BADAN-PENGHUBUNG`, `DISBUDPAR`, `DINKES`,
  `BAPELKES` (UPTD di bawah `DINKES`), `DISKOP`, `DINSOS`, `DISHUT`.
- Penugasan role berlingkup OPD dijelaskan di [users.md](./users.md#8-post-apiusersidroles).
- Pemakaian di aplikasi lain: Bapenda (UPTD) dan SIMPAD nanti memakai tabel yang sama — tidak ada
  duplikasi master unit kerja.
