# Users

- **Aplikasi:** `seloko` · **Prefix:** `/api/users` · **Jumlah endpoint:** 9
- **Sumber kode:** `src/modules/core/users/users.routes.ts`

## Ringkasan Endpoint

| No | Method | Path | Guard | Deskripsi |
|:--:|---|---|---|---|
| 1 | `GET` | `/` | `user:list` | Daftar pengguna berpaginasi + ringkasan aplikasi |
| 2 | `GET` | `/:id` | `user:read` | Detail + role per aplikasi + lingkup OPD |
| 3 | `POST` | `/` | `user:create` | Buat akun **pegawai** (`INTERNAL`) |
| 4 | `PATCH` | `/:id` | `user:update` | Perbarui profil |
| 5 | `PATCH` | `/:id/activate` | `user:update` | Aktif/nonaktif |
| 6 | `DELETE` | `/:id` | `user:delete` | Soft-delete |
| 7 | `GET` | `/:id/roles` | `user-app-role:list` | Daftar penugasan role + `summary` |
| 8 | `POST` | `/:id/roles` | `user-app-role:create` | Tugaskan role, opsional dibatasi OPD |
| 9 | `DELETE` | `/:id/roles/:userAppRoleId` | `user-app-role:delete` | Cabut penugasan role |

---

## 1. GET /api/users

**Akses:** `authenticate` + `user:list` (aplikasi `seloko`)

### Query Parameter

| Nama | Wajib | Tipe | Aturan | Default | Keterangan |
|---|:--:|---|---|---|---|
| `page` | — | integer | ≥ 1 | `1` | Halaman |
| `limit` | — | integer | 1–100 | `20` | Jumlah per halaman |
| `search` | — | string | ≤100 karakter | — | Cari di `username`, `email`, `fullName`, `nip` (case-insensitive) |
| `accountType` | — | enum | `INTERNAL` \| `PUBLIC` | — | Pisahkan pegawai dan warga |
| `isActive` | — | string | `"true"` \| `"false"` | — | Filter status aktif |
| `isSuperAdmin` | — | string | `"true"` \| `"false"` | — | Filter super admin |

**Urutan:** `createdAt DESC` (tetap, tidak bisa diubah).

### Contoh Request

```
GET /api/users?page=1&limit=20&search=pegawai&accountType=INTERNAL&isActive=true
X-App-Code: seloko
Authorization: Bearer <token>
```

### Response 200

`data[]` berisi:

| Field | Tipe | Keterangan |
|---|---|---|
| `id` | string | UUID v7 |
| `nip` | string \| null | NIP ASN |
| `username` | string \| null | `null` untuk akun `PUBLIC` |
| `email` | string | — |
| `fullName` | string | — |
| `phoneNumber` | string \| null | — |
| `avatarUrl` | string \| null | ImageKit |
| `avatarFileId` | string \| null | Untuk hapus berkas lama |
| `accountType` | enum | `INTERNAL` \| `PUBLIC` |
| `isSuperAdmin` | boolean | Melewati seluruh cek izin |
| `isActive` | boolean | — |
| `emailVerifiedAt` | string \| null | ISO 8601 |
| `lastLoginAt` | string \| null | ISO 8601 |
| `createdAt`, `updatedAt` | string | ISO 8601 |
| `deletedAt` | string \| null | Selalu `null` di list |
| `totalApplications` | integer | Jumlah aplikasi unik |
| `totalRoles` | integer | Jumlah penugasan role |
| `applications` | array | `[{ id, code, name }]` |

```json
{
  "success": true,
  "message": "Daftar pengguna berhasil diambil",
  "data": [{
    "id": "01a1...", "nip": "198203152008011002", "username": "admin.seloko",
    "email": "admin.seloko@gmail.com", "fullName": "Rahmat Hidayat",
    "phoneNumber": "0812-7411-002", "avatarUrl": null, "avatarFileId": null,
    "accountType": "INTERNAL", "isSuperAdmin": false, "isActive": true,
    "emailVerifiedAt": "2026-10-01T00:00:00.000Z", "lastLoginAt": null,
    "createdAt": "2026-10-01T00:00:00.000Z", "updatedAt": "2026-10-01T00:00:00.000Z",
    "deletedAt": null,
    "totalApplications": 1, "totalRoles": 1,
    "applications": [{ "id": "...", "code": "seloko", "name": "SELOKO CMS" }]
  }],
  "meta": { "page": 1, "limit": 20, "total": 52, "totalPages": 3, "hasNextPage": true, "hasPreviousPage": false }
}
```

**Error:** `401` token tidak valid · `403` izin kurang.

---

## 2. GET /api/users/:id

**Akses:** `authenticate` + `user:read`

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `id` | ✓ | uuid | UUID user; bukan UUID → `400` |

### Response 200

Field dasar sama seperti list, ditambah:

| Field | Tipe | Keterangan |
|---|---|---|
| `applications[]` | array | `{ id, code, name, roles: [...] }` — dikelompokkan per aplikasi |
| `applications[].roles[].organizations` | array | Lingkup OPD penugasan; **kosong = seluruh OPD** |
| `roles[]` | array | Bentuk datar seluruh penugasan (kompatibel mundur) |

```json
{
  "success": true, "message": "Detail pengguna berhasil diambil",
  "data": {
    "id": "01a1...", "...": "field dasar",
    "totalApplications": 2, "totalRoles": 3,
    "applications": [{
      "id": "...", "code": "lapak-jambi-web", "name": "Lapak Jambi Web",
      "roles": [{
        "id": "uar_1", "roleId": "...", "roleName": "admin-opd",
        "expiresAt": null, "createdAt": "2026-10-18T05:00:00.000Z",
        "organizations": [{ "id": "...", "code": "BPSDM", "name": "Badan Pengembangan Sumber Daya Manusia Provinsi Jambi", "shortName": "BPSDM" }]
      }]
    }],
    "roles": [{
      "id": "uar_1", "roleId": "...", "roleName": "admin-opd",
      "applicationId": "...", "applicationCode": "lapak-jambi-web", "applicationName": "Lapak Jambi Web",
      "expiresAt": null, "createdAt": "2026-10-18T05:00:00.000Z",
      "organizations": [ "..."]
    }]
  }
}
```

**Error:** `400` id bukan UUID · `404` user tidak ada / soft-delete.

---

## 3. POST /api/users

**Akses:** `authenticate` + `user:create`

Membuat akun **pegawai saja**. `accountType` sengaja tidak ada di body agar operator konsol tidak
bisa membuat akun warga dengan kata sandi yang ia ketahui.

### Request Body

| Field | Wajib | Tipe | Aturan | Default | Keterangan |
|---|:--:|---|---|---|---|
| `username` | ✓ | string | 3–50, `^[a-z0-9_.-]+$`, unik | — | Huruf kecil semua |
| `email` | ✓ | string | format email, ≤100, unik antar `INTERNAL` | — | — |
| `fullName` | ✓ | string | 2–150 | — | — |
| `password` | ✓ | string | 8–100, ≥1 huruf besar, ≥1 angka | — | Di-hash Argon2id |
| `nip` | — | string | ≤30, unik | — | Opsional untuk non-ASN |
| `phoneNumber` | — | string | ≤20 | — | — |
| `avatarUrl` | — | string | URL valid | — | — |
| `avatarFileId` | — | string \| null | ≤100 | — | Untuk hapus berkas lama |
| `isSuperAdmin` | — | boolean | — | `false` | Memberi akses penuh semua aplikasi |

### Contoh Request

```json
{
  "username": "operator.baru",
  "email": "operator.baru@bapenda-jambi.go.id",
  "fullName": "Operator Baru",
  "password": "RahasiaKu2026",
  "nip": "199001012020011001",
  "phoneNumber": "0812-3456-7890",
  "isSuperAdmin": false
}
```

### Response 201

Bentuk `data` sama dengan `UserDetailShape` (lihat endpoint 2), tanpa penugasan role.

**Error:** `409` username / email / NIP sudah dipakai · `400` validasi gagal.

---

## 4. PATCH /api/users/:id

**Akses:** `authenticate` + `user:update`

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `id` | ✓ | uuid | — |

### Request Body

Minimal **satu** field harus dikirim (`400` bila kosong).

| Field | Wajib | Tipe | Aturan | Nullable | Keterangan |
|---|:--:|---|---|:--:|---|
| `fullName` | — | string | 2–150 | — | — |
| `phoneNumber` | — | string \| null | ≤20 | ✓ | `null` mengosongkan |
| `avatarUrl` | — | string \| null | URL valid | ✓ | — |
| `avatarFileId` | — | string \| null | ≤100 | ✓ | Ganti = berkas lama dihapus di ImageKit |
| `nip` | — | string \| null | ≤30, unik | ✓ | — |
| `isSuperAdmin` | — | boolean | — | — | — |

> `username` dan `email` **tidak** bisa diubah lewat endpoint ini.
> `accountType` tidak bisa diubah sama sekali (final sejak dibuat).

**Response 200:** objek pengguna. **Error:** `404` · `409` NIP bentrok.

---

## 5. PATCH /api/users/:id/activate

**Akses:** `authenticate` + `user:update`

### Request Body

| Field | Wajib | Tipe | Aturan | Keterangan |
|---|:--:|---|---|---|
| `isActive` | ✓ | boolean | — | `false` mencabut seluruh sesi login user |

**Response 200:**

```json
{ "success": true, "message": "Pengguna berhasil dinonaktifkan", "data": { "isActive": false } }
```

Bila Redis mati saat membersihkan cache, pesan ditambah
`" (cache izin gagal dibersihkan — perubahan efektif penuh dalam ≤5 menit)"`.

---

## 6. DELETE /api/users/:id

**Akses:** `authenticate` + `user:delete`

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `id` | ✓ | uuid | Tidak boleh sama dengan ID pemanggil |

**Perilaku:** soft-delete (`deletedAt` diisi), akun dinonaktifkan, seluruh token dicabut.

**Response 200:** `{ success: true, message: "...", data: null }`
**Error:** `400` mencoba menghapus akun sendiri · `404`.

---

## 7. GET /api/users/:id/roles

**Akses:** `authenticate` + `user-app-role:list`

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `id` | ✓ | uuid | User yang penugasannya diminta |

### Query Parameter

| Nama | Wajib | Tipe | Aturan | Default | Keterangan |
|---|:--:|---|---|---|---|
| `page` | — | integer | ≥ 1 | `1` | — |
| `limit` | — | integer | 1–100 | `20` | — |
| `applicationId` | — | uuid | — | — | Saring per aplikasi |
| `roleId` | — | uuid | — | — | Saring per role |
| `organizationId` | — | uuid | — | — | Penugasan yang mencakup OPD ini **termasuk penugasan global** |
| `status` | — | enum | `active` \| `expired` \| `all` | `active` | Menurut masa berlaku |
| `sortBy` | — | enum | `createdAt` \| `expiresAt` \| `application` | `createdAt` | — |
| `sortOrder` | — | enum | `asc` \| `desc` | `desc` | — |

### Contoh Request

```
GET /api/users/01a1.../roles?applicationId=<uuid>&organizationId=<uuid>&status=active&limit=10
```

### Response 200

`data[]` = item role (bentuk sama seperti `roles[]` di endpoint 2), `meta` paginasi, plus `summary`:

| Field `summary` | Tipe | Keterangan |
|---|---|---|
| `totalAssignments` | integer | Seluruh penugasan user (bukan hanya halaman ini) |
| `activeAssignments` | integer | Permanen atau belum kedaluwarsa |
| `expiredAssignments` | integer | Sudah lewat `expiresAt` |
| `totalApplications` | integer | Jumlah aplikasi unik |
| `totalOrganizations` | integer | Jumlah OPD unik pada seluruh penugasan |
| `globalAssignments` | integer | Penugasan tanpa batas OPD |

```json
{
  "success": true, "message": "Daftar penugasan role berhasil diambil",
  "data": [],
  "meta": { "page": 1, "limit": 20, "total": 3, "totalPages": 1, "hasNextPage": false, "hasPreviousPage": false },
  "summary": { "totalAssignments": 3, "activeAssignments": 2, "expiredAssignments": 1,
               "totalApplications": 2, "totalOrganizations": 2, "globalAssignments": 1 }
}
```

**Error:** `400` id/query bukan UUID · `404` user tidak ada.

---

## 8. POST /api/users/:id/roles

**Akses:** `authenticate` + `user-app-role:create`

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `id` | ✓ | uuid | User penerima role |

### Request Body

| Field | Wajib | Tipe | Aturan | Default | Nullable | Keterangan |
|---|:--:|---|---|---|:--:|---|
| `applicationId` | ✓ | uuid | Aplikasi harus **aktif** | — | — | Aplikasi target |
| `roleId` | ✓ | uuid | Role harus milik `applicationId` tsb & aktif | — | — | — |
| `expiresAt` | — | string \| null | ISO 8601 | `null` (permanen) | ✓ | Kapan akses berakhir |
| `organizationIds` | — | uuid[] | maks 50, tanpa duplikat, semua harus ada | `[]` | — | Kosong = **seluruh OPD** |

### Aturan Bisnis

1. Role `PUBLIC` hanya untuk akun `PUBLIC`; role `INTERNAL` hanya untuk akun `INTERNAL` → `400`.
2. `organizationIds` **mengganti** lingkup sebelumnya, bukan menambah.
3. Idempoten: kombinasi `(user, aplikasi, role)` yang sama hanya memperbarui `expiresAt` + lingkup.
4. Cache izin Redis dibersihkan setelah berhasil.

### Contoh Request — admin OPD untuk dua OPD

```json
{
  "applicationId": "8f1c...",
  "roleId": "2b7a...",
  "expiresAt": null,
  "organizationIds": ["<uuid BPSDM>", "<uuid DISBUDPAR>"]
}
```

### Contoh Request — level Bapenda (semua OPD)

```json
{ "applicationId": "8f1c...", "roleId": "2b7a...", "expiresAt": null }
```

### Response 201

```json
{
  "success": true, "message": "Role berhasil ditugaskan",
  "data": {
    "id": "uar_1", "roleId": "2b7a...", "roleName": "admin-opd",
    "applicationId": "8f1c...", "applicationCode": "lapak-jambi-web", "applicationName": "Lapak Jambi Web",
    "expiresAt": null, "createdAt": "2026-10-18T05:00:00.000Z",
    "organizations": [
      { "id": "...", "code": "BPSDM", "name": "...", "shortName": "BPSDM" },
      { "id": "...", "code": "DISBUDPAR", "name": "...", "shortName": "Disbudpar" }
    ]
  }
}
```

**Error:** `400` role/OPD/aplikasi tidak cocok atau tidak ditemukan · `404` user tidak ada.

---

## 9. DELETE /api/users/:id/roles/:userAppRoleId

**Akses:** `authenticate` + `user-app-role:delete`

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `id` | ✓ | uuid | Pemilik penugasan |
| `userAppRoleId` | ✓ | uuid | ID baris `user_app_roles` (bukan `roleId`) |

**Perilaku:** menghapus penugasan beserta seluruh lingkup OPD-nya, lalu membersihkan cache izin.

**Response 200:** `{ success: true, message: "Role berhasil dicabut", data: null }`
**Error:** `404` penugasan tidak ada atau bukan milik user tersebut.

---

## Catatan Perilaku

- Satu email boleh dimiliki **dua akun berbeda**: satu `INTERNAL`, satu `PUBLIC`.
- `isSuperAdmin` melewati seluruh pemeriksaan izin di semua aplikasi.
- Penugasan role bisa berjumlah lebih dari satu per aplikasi (mis. `editor` merangkap
  `verifikator`); hak aksesnya **union**, bukan saling menimpa.
- `organizations` kosong **bukan** berarti tidak punya akses — artinya berlaku seluruh OPD.
