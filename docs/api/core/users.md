# Users

- **Aplikasi:** `seloko`
- **Prefix:** `/api/users`
- **Sumber kode:** `src/modules/core/users/users.routes.ts`
- **Jumlah endpoint:** 9

## Ringkasan Endpoint

| No | Method | Path | Guard | Deskripsi |
|:--:|---|---|---|---|
| 1 | `GET` | `/` | `user:list` | Daftar pengguna: paginasi, cari (`username`/`email`/`fullName`/`nip`), filter `accountType`, `isActive`, `isSuperAdmin`. |
| 2 | `GET` | `/:id` | `user:read` | Detail pengguna + role dikelompokkan per aplikasi + **lingkup OPD** per penugasan. |
| 3 | `POST` | `/` | `user:create` | Membuat akun **pegawai** (`INTERNAL`). Akun warga tidak dibuat di sini. |
| 4 | `PATCH` | `/:id` | `user:update` | Perbarui profil. Avatar lama di ImageKit dihapus otomatis bila diganti. |
| 5 | `PATCH` | `/:id/activate` | `user:update` | Aktif/nonaktif. Menonaktifkan mencabut semua sesi user. |
| 6 | `DELETE` | `/:id` | `user:delete` | Soft-delete; menolak penghapusan akun sendiri. |
| 7 | `GET` | `/:id/roles` | `user-app-role:list` | **Daftar penugasan role** dengan paginasi, filter, dan `summary` lintas halaman. |
| 8 | `POST` | `/:id/roles` | `user-app-role:create` | Tugaskan role pada aplikasi tertentu, opsional dibatasi ke OPD tertentu. |
| 9 | `DELETE` | `/:id/roles/:userAppRoleId` | `user-app-role:delete` | Cabut satu penugasan role. |

## Detail Endpoint

### GET /users
- **Akses:** `authenticate` + `user:list` (aplikasi `seloko`).
- **Query:** `page`, `limit` (1–100, bawaan 20), `search`, `accountType` (`INTERNAL`/`PUBLIC`),
  `isActive` (`true`/`false`), `isSuperAdmin` (`true`/`false`).
- **Response 200:**
  ```json
  {
    "success": true, "message": "Daftar pengguna berhasil diambil",
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
- **Catatan:** baris soft-deleted tidak pernah muncul.

### GET /users/:id
- **Response 200 (bagian `data`):** field dasar seperti di atas, ditambah:
  ```json
  {
    "totalApplications": 2, "totalRoles": 3,
    "applications": [{
      "id": "...", "code": "lapak-jambi-web", "name": "Lapak Jambi Web",
      "roles": [{
        "id": "uar_1", "roleId": "...", "roleName": "admin-opd",
        "expiresAt": null, "createdAt": "2026-10-18T05:00:00.000Z",
        "organizations": [
          { "id": "...", "code": "BPSDM", "name": "Badan Pengembangan Sumber Daya Manusia Provinsi Jambi", "shortName": "BPSDM" }
        ]
      }]
    }],
    "roles": [{
      "id": "uar_1", "roleId": "...", "roleName": "admin-opd",
      "applicationId": "...", "applicationCode": "lapak-jambi-web", "applicationName": "Lapak Jambi Web",
      "expiresAt": null, "createdAt": "2026-10-18T05:00:00.000Z",
      "organizations": [ ... ]
    }]
  }
  ```
- **Penting:** `organizations` **kosong** berarti penugasan berlaku untuk **seluruh OPD**.

### POST /users
- **Body:** `username`, `email`, `fullName`, `password`, `nip?`, `phoneNumber?`,
  `avatarUrl?`, `avatarFileId?`, `isSuperAdmin?`.
- **Aturan:** `username` huruf kecil (`a-z0-9_.-`), password ≥8 karakter dengan ≥1 huruf besar dan
  ≥1 angka. Email unik hanya di antara akun `INTERNAL`. `accountType` **tidak** bisa dikirim —
  endpoint ini selalu membuat pegawai.
- **Response 201:** objek pengguna.
- **Error:** `409` username/email/NIP sudah dipakai.

### PATCH /users/:id
- **Body:** subset dari `fullName`, `phoneNumber`, `nip`, `avatarUrl`, `avatarFileId`,
  `isSuperAdmin`, `username`, `email`. Minimal satu field.
- **Response 200:** objek pengguna.

### PATCH /users/:id/activate
- **Body:** `{ "isActive": true | false }`
- **Response 200:** `{ success, message, data: { isActive } }` (+ catatan bila cache gagal dibersihkan).

### DELETE /users/:id
- **Response 200:** `{ success: true, message: "...", data: null }`
- **Error:** `400` mencoba menghapus akun sendiri.

### GET /users/:id/roles
- **Akses:** `authenticate` + `user-app-role:list`.
- **Query:**
  | Nama | Nilai | Keterangan |
  |---|---|---|
  | `page`, `limit` | 1–100 | Paginasi |
  | `applicationId` | UUID | Saring per aplikasi |
  | `roleId` | UUID | Saring per role |
  | `organizationId` | UUID | Penugasan yang mencakup OPD itu — **termasuk penugasan global** |
  | `status` | `active` (bawaan) / `expired` / `all` | Menurut masa berlaku |
  | `sortBy` | `createdAt` / `expiresAt` / `application` | Bawaan `createdAt` |
  | `sortOrder` | `asc` / `desc` | Bawaan `desc` |
- **Response 200:** `data` berisi daftar penugasan (bentuk sama dengan `roles` di detail user),
  `meta` paginasi, dan `summary`:
  ```json
  {
    "success": true, "message": "Daftar penugasan role berhasil diambil",
    "data": [ ... ],
    "meta": { "page": 1, "limit": 20, "total": 3, "totalPages": 1, "hasNextPage": false, "hasPreviousPage": false },
    "summary": {
      "totalAssignments": 3, "activeAssignments": 2, "expiredAssignments": 1,
      "totalApplications": 2, "totalOrganizations": 2, "globalAssignments": 1
    }
  }
  ```
- **Catatan:** `summary` dihitung dari **seluruh** penugasan user, bukan hanya halaman aktif.

### POST /users/:id/roles
- **Body:**
  ```json
  {
    "applicationId": "uuid",
    "roleId": "uuid",
    "expiresAt": null,
    "organizationIds": ["uuid-bpsdm", "uuid-disbudpar"]
  }
  ```
  | Field | Wajib | Keterangan |
  |---|---|---|
  | `applicationId` | ya | Aplikasi target |
  | `roleId` | ya | Role milik aplikasi tsb |
  | `expiresAt` | tidak | ISO 8601 atau `null` (permanen) |
  | `organizationIds` | tidak | Kosong/absen = **seluruh OPD**. Maks 50, tanpa duplikat. |
- **Aturan:**
  - Role `PUBLIC` hanya untuk akun `PUBLIC`, role `INTERNAL` hanya untuk akun `INTERNAL`.
  - `organizationIds` **mengganti** lingkup sebelumnya, bukan menambah.
  - OPD yang tidak ada/tidak aktif → `400`.
  - Idempoten: kombinasi `(user, aplikasi, role)` yang sama hanya memperbarui `expiresAt` + lingkup.
- **Response 201:** objek penugasan (bentuk sama dengan item `roles`) + `cacheCleared` internal.
- **Error:** `400` role/OPD tidak cocok · `404` user/role/aplikasi tidak ada.

### DELETE /users/:id/roles/:userAppRoleId
- **Response 200:** `{ success: true, message: "...", data: null }`
- **Error:** `404` penugasan tidak ada atau bukan milik user itu.

## Catatan Perilaku
- Cache izin di Redis dibersihkan setiap assign/cabut role, jadi perubahan langsung berlaku.
  Bila Redis mati, respons menyertakan catatan bahwa perubahan efektif penuh ≤5 menit.
- `isSuperAdmin` melewati seluruh pemeriksaan izin di semua aplikasi.
- Satu email boleh dimiliki dua akun berbeda: satu `INTERNAL`, satu `PUBLIC`.
