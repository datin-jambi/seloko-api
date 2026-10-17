# Roles

- **Aplikasi:** `seloko`
- **Prefix:** `/api/roles`
- **Sumber kode:** `src/modules/core/roles/roles.routes.ts`
- **Jumlah endpoint:** 8

Role adalah **data**, bukan enum: dibuat per aplikasi, bisa ditambah lewat CMS tanpa deploy.
Satu aplikasi boleh punya role `INTERNAL` (pegawai) dan `PUBLIC` (warga) sekaligus.

## Ringkasan Endpoint

| No | Method | Path | Guard | Deskripsi |
|:--:|---|---|---|---|
| 1 | `GET` | `/` | `role:list` | Daftar dengan paginasi + `permissionCount`, `userCount`. |
| 2 | `GET` | `/:id` | `role:read` | Detail + **matriks checklist** permission per modul (`granted`). |
| 3 | `POST` | `/` | `role:create` | Buat role, opsional langsung dengan `permissionIds`. |
| 4 | `PATCH` | `/:id` | `role:update` | Ubah `name`/`description`. Role sistem tidak boleh diganti nama. |
| 5 | `PUT` | `/:id/permissions` | `role:update` | **Setel ulang penuh** permission role (atomik). |
| 6 | `DELETE` | `/:id/permissions/:permissionId` | `role:update` | Cabut satu permission. |
| 7 | `PATCH` | `/:id/activate` | `role:update` | Aktif/nonaktif. Role sistem tidak bisa dinonaktifkan. |
| 8 | `DELETE` | `/:id` | `role:delete` | Hapus permanen. Ditolak untuk role sistem. |

## Detail Endpoint

### GET /roles
- **Query:** `page`, `limit` (1–100), `search` (nama), `applicationId?`,
  `isActive` (`true`/`false`), `isSystemRole` (`true`/`false`), `audience` (`INTERNAL`/`PUBLIC`).
- **Response 200:** `data[]`:
  ```json
  {
    "id": "...", "applicationId": "...", "applicationCode": "lapak-jambi-web",
    "applicationName": "Lapak Jambi Web", "name": "admin-opd",
    "description": "Administrator OPD", "audience": "INTERNAL",
    "isSystemRole": true, "isActive": true,
    "createdAt": "...", "updatedAt": "...",
    "permissionCount": 9, "userCount": 3
  }
  ```

### GET /roles/:id
- **Response 200:** field role + `permissionsByModule[]`:
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
- **Catatan:** bentuk ini langsung bisa dirender sebagai form checklist di CMS — `granted`
  menentukan centang awal.

### POST /roles
- **Body:** `applicationId`, `name` (≤50), `description?`, `audience?` (bawaan `INTERNAL`),
  `permissionIds?` (array UUID).
- **Aturan:** `name` unik per aplikasi; role `PUBLIC` hanya di aplikasi `PUBLIC`.
- **Response 201:** objek role.
- **Error:** `409` nama sudah dipakai di aplikasi itu.

### PATCH /roles/:id
- **Body:** `name?`, `description?`. Minimal satu.
- **Response 200:** objek role.
- **Error:** `403` role `isSystemRole` dilarang diganti nama.

### PUT /roles/:id/permissions
- **Body:** `{ "permissionIds": ["uuid", "..."] }`
- **Perilaku:** dalam satu transaksi — mencabut yang tidak dipilih, memasang yang baru, lalu
  membersihkan cache Redis. Mengirim array kosong mencabut semua permission role.
- **Response 200:** detail role terbaru (bentuk sama dengan `GET /roles/:id`).
- **Error:** `400` ada permission yang bukan milik aplikasi role tersebut.

### DELETE /roles/:id/permissions/:permissionId
- **Response 200:** `{ success: true, message: "...", data: null }`
- **Error:** `404` permission itu memang tidak dipegang role.

### PATCH /roles/:id/activate
- **Body:** `{ "isActive": boolean }`
- **Perilaku:** role nonaktif otomatis mencabut akses efektif seluruh pemegangnya.
- **Error:** `403` role sistem tidak bisa dinonaktifkan.

### DELETE /roles/:id
- **Response 200:** `{ success: true, message: "...", data: null }`
- **Error:** `403` role sistem · `409` masih dipakai penugasan pengguna.

## Catatan Perilaku
- Role bawaan seed (`isSystemRole: true`) tidak boleh dihapus atau diganti nama, tapi
  permission-nya tetap bisa diatur — itu yang membuat wewenang bisa berubah tanpa deploy.
- Contoh pemakaian: wewenang menerbitkan produk OPD bisa diberikan ke Bapenda saja, atau ke
  Ketua OPD sekaligus, cukup dengan mengatur `product:publish` pada role yang sesuai.
- Perubahan role/permission membersihkan cache izin di Redis; tanpa Redis perubahan efektif
  penuh dalam ≤5 menit.
