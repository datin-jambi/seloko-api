# Permissions

- **Aplikasi:** `seloko` · **Prefix:** `/api/permissions` · **Jumlah endpoint:** 7
- **Sumber kode:** `src/modules/core/permissions/permissions.routes.ts`

Kode izin `<entity>:<action>`, unik per aplikasi dan **kekal** — `code` dan `applicationId`
tidak dapat diubah. Hanya `name` dan `module` yang bisa diperbarui.

## Ringkasan Endpoint

| No | Method | Path | Guard | Deskripsi |
|:--:|---|---|---|---|
| 1 | `GET` | `/modules` | `permission:list` | Nama modul unik + jumlah izin |
| 2 | `GET` | `/:applicationId/me` | `authenticate` | Izin efektif pemanggil pada aplikasi target |
| 3 | `GET` | `/` | `permission:list` | Daftar berpaginasi + filter |
| 4 | `GET` | `/:id` | `permission:read` | Detail + role pemilik + menu terkait |
| 5 | `POST` | `/` | `permission:create` | Daftarkan izin baru |
| 6 | `PATCH` | `/:id` | `permission:update` | Ubah `name`/`module` |
| 7 | `DELETE` | `/:id` | `permission:delete` | Hapus permanen |

> `/:applicationId/me` didaftarkan sebelum `/:id` agar tidak tertangkap rute dinamis.

---

## 1. GET /api/permissions/modules

**Akses:** `authenticate` + `permission:list` (aplikasi `seloko`).

### Query Parameter

| Nama | Wajib | Tipe | Aturan | Keterangan |
|---|:--:|---|---|---|
| `applicationId` | — | uuid | — | Batasi ke satu aplikasi; tanpa ini = semua aplikasi |

### Response 200

| Field | Tipe |
|---|---|
| `data[].module` | string |
| `data[].permissionCount` | integer |

```json
{ "success": true, "message": "...", "data": [
  { "module": "Pengguna", "permissionCount": 5 },
  { "module": "Akses", "permissionCount": 8 }
] }
```

Dipakai mengisi dropdown filter modul di CMS.

---

## 2. GET /api/permissions/:applicationId/me

**Akses:** `authenticate` saja — pengguna harus selalu bisa memeriksa izinnya sendiri.

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `applicationId` | ✓ | uuid | Aplikasi yang izinnya ditanyakan |

### Response 200

| Field | Tipe | Keterangan |
|---|---|---|
| `data.application` | object | `{ id, code, name, icon }` |
| `data.isSuperAdmin` | boolean | `true` → `permissions` berisi seluruh izin aplikasi |
| `data.roles[]` | array | `{ id, name, expiresAt }` — hanya yang berlaku |
| `data.permissions` | string[] | Kode datar `entity:action` |
| `data.permissionsByModule[]` | array | `{ module, permissions: [{ code, name }] }` |
| `data.total` | integer | Jumlah permission |

```json
{
  "success": true, "message": "...",
  "data": {
    "application": { "id": "...", "code": "seloko", "name": "SELOKO CMS", "icon": "shield" },
    "isSuperAdmin": false,
    "roles": [{ "id": "...", "name": "viewer", "expiresAt": null }],
    "permissions": ["user:list", "user:read"],
    "permissionsByModule": [{ "module": "Pengguna", "permissions": [{ "code": "user:list", "name": "Melihat Daftar Pengguna" }] }],
    "total": 12
  }
}
```

**Catatan:** dipakai frontend untuk *conditional rendering*. Super admin cukup membaca
`isSuperAdmin`, tidak perlu memeriksa daftar.

---

## 3. GET /api/permissions

**Akses:** `authenticate` + `permission:list`.

### Query Parameter

| Nama | Wajib | Tipe | Aturan | Default | Keterangan |
|---|:--:|---|---|---|---|
| `page` | — | integer | ≥ 1 | `1` | — |
| `limit` | — | integer | 1–200 | `50` | Batas atas lebih longgar dari modul lain |
| `applicationId` | — | uuid | — | — | Batasi ke satu aplikasi |
| `module` | — | string | ≥1 karakter | — | Filter satu modul |
| `search` | — | string | — | — | Cari di `code` dan `name` |

### Response 200

| Field | Tipe | Keterangan |
|---|---|---|
| `id`, `applicationId`, `applicationCode` | string | — |
| `code` | string | `entity:action` |
| `name` | string | Label manusia |
| `module` | string | Pengelompokan tampilan |
| `createdAt` | string | ISO 8601 |
| `roleCount` | integer | Berapa role memegang izin ini |
| `menuCount` | integer | Berapa menu memakainya sebagai pembatas |

```json
{
  "success": true, "message": "...",
  "data": [{
    "id": "...", "applicationId": "...", "applicationCode": "bapenda-profile",
    "code": "news:approve", "name": "Menyetujui Berita", "module": "Konten",
    "createdAt": "...", "roleCount": 2, "menuCount": 1
  }],
  "meta": { "page": 1, "limit": 50, "total": 110, "totalPages": 3, "hasNextPage": true, "hasPreviousPage": false }
}
```

---

## 4. GET /api/permissions/:id

**Akses:** `authenticate` + `permission:read`.

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `id` | ✓ | uuid | — |

### Response 200

Field list + tambahan:

| Field | Tipe | Keterangan |
|---|---|---|
| `roles[]` | array | `{ id, name }` — role yang memegang izin ini |
| `menus[]` | array | `{ id, label }` — menu yang dilindungi izin ini |

Dipakai layar konfirmasi hapus: operator tahu izin ini tercabut dari siapa saja.

**Error:** `404`.

---

## 5. POST /api/permissions

**Akses:** `authenticate` + `permission:create`.

### Request Body

| Field | Wajib | Tipe | Aturan | Keterangan |
|---|:--:|---|---|---|
| `applicationId` | ✓ | uuid | aplikasi harus **aktif** | — |
| `code` | ✓ | string | 3–100, `^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$`, unik per aplikasi | Format `<entity>:<action>` |
| `name` | ✓ | string | 3–150 | Label manusia |
| `module` | ✓ | string | 2–50 | Pengelompokan tampilan |

```json
{
  "applicationId": "<uuid>",
  "code": "gallery:publish",
  "name": "Menerbitkan Galeri",
  "module": "Media"
}
```

**Response 201:** objek permission.
**Error:** `409` kode sudah ada di aplikasi itu · `400` aplikasi tidak aktif / format kode salah.

---

## 6. PATCH /api/permissions/:id

**Akses:** `authenticate` + `permission:update`.

### Path Parameter

| Nama | Wajib | Tipe |
|---|:--:|---|
| `id` | ✓ | uuid |

### Request Body

| Field | Wajib | Tipe | Aturan | Nullable |
|---|:--:|---|---|:--:|
| `name` | — | string | 3–150 | — |
| `module` | — | string | 2–50 | — |

Minimal satu field. `code` dan `applicationId` **tidak** ada di schema — mengirimnya ditolak
sebagai key tak dikenal.

**Response 200:** objek permission.

---

## 7. DELETE /api/permissions/:id

**Akses:** `authenticate` + `permission:delete`.

### Path Parameter

| Nama | Wajib | Tipe |
|---|:--:|---|
| `id` | ✓ | uuid |

### Response 200

| Field | Tipe | Keterangan |
|---|---|---|
| `data.revokedFromRoles` | integer | Jumlah role yang kehilangan izin ini |
| `data.unguardedMenus` | integer | Jumlah menu yang jadi terbuka |

```json
{ "success": true, "message": "Permission berhasil dihapus", "data": { "revokedFromRoles": 2, "unguardedMenus": 1 } }
```

**Perilaku:** hapus permanen; mencabut dari semua role, melepas proteksi menu terkait, dan
membersihkan cache Redis.

---

## Catatan Perilaku

- Permission **tidak** dibuat otomatis oleh kode. Sumbernya `prisma/seeds/core/applications.json`
  (`permissions[].entity` + `actions`). Menambah modul baru = tambah entri di sana lalu `db:seed`.
- Grup aksi (`content`, `publishable`, `reviewable`, `verifiable`, `readonly`) didefinisikan di
  `roles.json` dan dipakai saat seeding untuk membentuk permission per role.
- Kode izin tertanam sebagai literal di route (`requirePermission("user:list")`), di cache Redis,
  dan di `menus.json` — itulah sebabnya `code` tidak bisa diubah.
