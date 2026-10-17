# Roles

- **Aplikasi:** `seloko` · **Prefix:** `/api/roles` · **Jumlah endpoint:** 8
- **Sumber kode:** `src/modules/core/roles/roles.routes.ts`

Role adalah **data**, bukan enum: dibuat per aplikasi, bisa ditambah lewat CMS tanpa deploy.
Satu aplikasi boleh punya role `INTERNAL` (pegawai) dan `PUBLIC` (warga) sekaligus.

## Ringkasan Endpoint

| No | Method | Path | Guard | Deskripsi |
|:--:|---|---|---|---|
| 1 | `GET` | `/` | `role:list` | Daftar + `permissionCount`, `userCount` |
| 2 | `GET` | `/:id` | `role:read` | Detail + matriks checklist permission |
| 3 | `POST` | `/` | `role:create` | Buat role |
| 4 | `PATCH` | `/:id` | `role:update` | Ubah nama/deskripsi |
| 5 | `PUT` | `/:id/permissions` | `role:update` | **Setel ulang penuh** permission |
| 6 | `DELETE` | `/:id/permissions/:permissionId` | `role:update` | Cabut satu permission |
| 7 | `PATCH` | `/:id/activate` | `role:update` | Aktif/nonaktif |
| 8 | `DELETE` | `/:id` | `role:delete` | Hapus permanen |

## Bentuk Objek

| Field | Tipe | Keterangan |
|---|---|---|
| `id`, `applicationId` | string | — |
| `applicationCode`, `applicationName` | string | Denormalisasi untuk tampilan |
| `name` | string | `^[a-z0-9-]+$`, unik per aplikasi |
| `description` | string \| null | — |
| `audience` | enum | `INTERNAL` \| `PUBLIC` — final |
| `isSystemRole` | boolean | Role bawaan seed; tidak boleh dihapus/diganti nama |
| `isActive` | boolean | — |
| `createdAt`, `updatedAt` | string | ISO 8601 |
| `permissionCount` | integer | Di list & detail |
| `userCount` | integer | Di list & detail |

---

## 1. GET /api/roles

**Akses:** `authenticate` + `role:list`.

### Query Parameter

| Nama | Wajib | Tipe | Aturan | Default | Keterangan |
|---|:--:|---|---|---|---|
| `page` | — | integer | ≥ 1 | `1` | — |
| `limit` | — | integer | 1–100 | `20` | — |
| `search` | — | string | — | — | Cari di `name` |
| `applicationId` | — | uuid | — | — | Batasi ke satu aplikasi |
| `isActive` | — | string | `"true"` \| `"false"` | — | Filter status |
| `isSystemRole` | — | string | `"true"` \| `"false"` | — | Pisahkan role bawaan sistem |
| `audience` | — | enum | `INTERNAL` \| `PUBLIC` | — | Filter jenis akun pemegang |

### Response 200

```json
{
  "success": true, "message": "...",
  "data": [{
    "id": "...", "applicationId": "...", "applicationCode": "lapak-jambi-web",
    "applicationName": "Lapak Jambi Web", "name": "admin-opd",
    "description": "Administrator OPD", "audience": "INTERNAL",
    "isSystemRole": true, "isActive": true,
    "createdAt": "...", "updatedAt": "...",
    "permissionCount": 9, "userCount": 3
  }],
  "meta": { "page": 1, "limit": 20, "total": 6, "totalPages": 1, "hasNextPage": false, "hasPreviousPage": false }
}
```

---

## 2. GET /api/roles/:id

**Akses:** `authenticate` + `role:read`.

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `id` | ✓ | uuid | — |

### Response 200

Field objek + `permissionsByModule[]` — **seluruh** permission aplikasi, ditandai `granted`:

| Field | Tipe | Keterangan |
|---|---|---|
| `permissionsByModule[].module` | string | Nama modul |
| `permissionsByModule[].permissions[].id` | string | UUID permission |
| `permissionsByModule[].permissions[].code` | string | `entity:action` |
| `permissionsByModule[].permissions[].name` | string | Label |
| `permissionsByModule[].permissions[].granted` | boolean | Dipegang role ini atau tidak |

```json
{
  "permissionsByModule": [{
    "module": "Katalog",
    "permissions": [
      { "id": "...", "code": "product:list", "name": "Melihat Daftar Produk", "granted": true },
      { "id": "...", "code": "product:approve", "name": "Menyetujui Produk", "granted": false }
    ]
  }]
}
```

Langsung bisa dirender sebagai form checklist di CMS.

**Error:** `404`.

---

## 3. POST /api/roles

**Akses:** `authenticate` + `role:create`.

### Request Body

| Field | Wajib | Tipe | Aturan | Default | Keterangan |
|---|:--:|---|---|---|---|
| `applicationId` | ✓ | uuid | aplikasi harus ada | — | — |
| `name` | ✓ | string | 3–50, `^[a-z0-9-]+$`, unik per aplikasi | — | — |
| `description` | — | string | ≤500 | — | — |
| `audience` | — | enum | `INTERNAL` \| `PUBLIC` | `INTERNAL` | Role `PUBLIC` hanya di aplikasi `PUBLIC` |
| `permissionIds` | — | uuid[] | semua harus milik aplikasi tsb | `[]` | Boleh kosong |
| `isActive` | — | boolean | — | `true` | — |

```json
{
  "applicationId": "<uuid lapak-jambi-web>",
  "name": "petugas-lokasi",
  "description": "Petugas yang melakukan check-in tiket",
  "audience": "INTERNAL",
  "permissionIds": ["<uuid ticket:list>", "<uuid ticket:update>"]
}
```

**Response 201:** objek role + `permissionCount`.
**Error:** `409` nama sudah dipakai di aplikasi itu · `400` permission bukan milik aplikasi ini.

---

## 4. PATCH /api/roles/:id

**Akses:** `authenticate` + `role:update`.

### Path Parameter

| Nama | Wajib | Tipe |
|---|:--:|---|
| `id` | ✓ | uuid |

### Request Body

| Field | Wajib | Tipe | Aturan | Nullable | Keterangan |
|---|:--:|---|---|:--:|---|
| `name` | — | string | 3–50, `^[a-z0-9-]+$` | — | Ditolak `403` untuk role sistem |
| `description` | — | string | ≤500 | ✓ | — |

Minimal satu field. `applicationId` **tidak** bisa diubah — memindahkan role berarti izinnya jadi
lintas aplikasi.

**Response 200:** objek role.
**Error:** `403` role `isSystemRole` dilarang diganti nama · `409` nama bentrok.

---

## 5. PUT /api/roles/:id/permissions

**Akses:** `authenticate` + `role:update`.

### Path Parameter

| Nama | Wajib | Tipe |
|---|:--:|---|
| `id` | ✓ | uuid |

### Request Body

| Field | Wajib | Tipe | Aturan | Keterangan |
|---|:--:|---|---|---|
| `permissionIds` | ✓ | uuid[] | seluruhnya harus milik aplikasi role | **Mengganti total**, bukan menambah |

```json
{ "permissionIds": ["<uuid>", "<uuid>"] }
```

### Perilaku

Satu transaksi atomik: cabut yang tidak dipilih → pasang yang baru → bersihkan cache Redis.
Mengirim array kosong mencabut **semua** permission role.

### Response 200

| Field | Tipe | Keterangan |
|---|---|---|
| `data.granted` | integer | Jumlah yang dipasang |
| `data.revoked` | integer | Jumlah yang dicabut |
| `data.total` | integer | Total permission role sekarang |

```json
{ "success": true, "message": "Permission role berhasil diperbarui", "data": { "granted": 9, "revoked": 2, "total": 9 } }
```

**Error:** `400` ada permission yang bukan milik aplikasi tersebut.

---

## 6. DELETE /api/roles/:id/permissions/:permissionId

**Akses:** `authenticate` + `role:update`.

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `id` | ✓ | uuid | Role ID |
| `permissionId` | ✓ | uuid | Permission yang dicabut |

**Response 200:** `{ success: true, message: "...", data: { remaining: 8 } }`
**Error:** `404` permission itu memang tidak dipegang role ini.

---

## 7. PATCH /api/roles/:id/activate

**Akses:** `authenticate` + `role:update`.

### Request Body

| Field | Wajib | Tipe | Keterangan |
|---|:--:|---|---|
| `isActive` | ✓ | boolean | Role nonaktif mencabut akses efektif semua pemegangnya |

**Response 200:** `{ success, message, data: { isActive } }`
**Error:** `403` role sistem tidak bisa dinonaktifkan.

---

## 8. DELETE /api/roles/:id

**Akses:** `authenticate` + `role:delete`.

### Path Parameter

| Nama | Wajib | Tipe |
|---|:--:|---|
| `id` | ✓ | uuid |

**Response 200:** `{ success: true, message: "...", data: null }`
**Error:** `403` role sistem · `409` masih dipakai penugasan pengguna.

---

## Catatan Perilaku

- Role bawaan seed (`isSystemRole: true`) tidak boleh dihapus atau diganti nama, tapi
  **permission-nya tetap bisa diatur** — itu yang membuat wewenang berubah tanpa deploy.
- Contoh: wewenang menerbitkan produk OPD bisa diberikan ke Bapenda saja, atau ke Ketua OPD
  sekaligus, cukup mengatur `product:publish` pada role yang sesuai.
- Satu user boleh memegang lebih dari satu role di satu aplikasi; hak aksesnya **union**.
