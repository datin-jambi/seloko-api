# Permissions

- **Aplikasi:** `seloko`
- **Prefix:** `/api/permissions`
- **Sumber kode:** `src/modules/core/permissions/permissions.routes.ts`
- **Jumlah endpoint:** 7

Kode izin format `<entity>:<action>` (mis. `user:list`, `news:approve`), unik per aplikasi dan
**kekal** — kode tidak bisa diubah setelah dibuat. Yang bisa diubah hanya `name` dan `module`.

## Ringkasan Endpoint

| No | Method | Path | Guard | Deskripsi |
|:--:|---|---|---|---|
| 1 | `GET` | `/modules` | `permission:list` | Daftar nama modul unik + jumlah izin — isi dropdown filter. |
| 2 | `GET` | `/:applicationId/me` | `authenticate` | Izin efektif saya pada aplikasi target (datar + per modul). |
| 3 | `GET` | `/` | `permission:list` | Daftar dengan paginasi + filter `applicationId`, `module`, `search`. |
| 4 | `GET` | `/:id` | `permission:read` | Detail + role pemilik + menu yang dibatasi. |
| 5 | `POST` | `/` | `permission:create` | Daftarkan izin baru. |
| 6 | `PATCH` | `/:id` | `permission:update` | Ubah `name` dan/atau `module`. Kode & aplikasi terkunci. |
| 7 | `DELETE` | `/:id` | `permission:delete` | Hapus permanen + lepaskan dari role & menu. |

## Detail Endpoint

### GET /permissions/modules
- **Query:** `applicationId?` (UUID).
- **Response 200:** `data`: `[{ "module": "Pengguna", "permissionCount": 5 }, ...]`

### GET /permissions/:applicationId/me
- **Akses:** `authenticate` saja — pengguna harus selalu bisa memeriksa izinnya sendiri.
- **Response 200:**
  ```json
  {
    "success": true, "message": "...",
    "data": {
      "isSuperAdmin": false,
      "total": 12,
      "permissions": ["news:list", "news:read", "..."],
      "permissionsByModule": [{ "module": "Konten", "permissions": ["news:list", "..."] }]
    }
  }
  ```
- **Catatan:** dipakai frontend untuk *conditional rendering* tombol & menu. Super admin mendapat
  `isSuperAdmin: true` — frontend tidak perlu menunggu daftar izin.

### GET /permissions
- **Query:** `page`, `limit` (1–200, bawaan 50), `applicationId?`, `module?`, `search?`.
- **Response 200:** `data[]` berisi `id`, `applicationId`, `applicationCode`, `code`, `name`,
  `module`, `createdAt`, `roleCount`, `menuCount`; plus `meta`.

### GET /permissions/:id
- **Response 200:** field di atas + `roles[]` (`id`, `name`) + `menus[]` (`id`, `label`).

### POST /permissions
- **Body:** `applicationId`, `code` (`<entity>:<action>`), `name`, `module`.
- **Aturan:** aplikasi harus aktif; kode unik per aplikasi.
- **Response 201:** objek permission.
- **Error:** `409` kode sudah ada di aplikasi itu.

### PATCH /permissions/:id
- **Body:** `name?`, `module?`. Minimal satu.
- **Response 200:** objek permission.
- **Error:** `400` mencoba mengubah `code` atau `applicationId` (field terkunci / tidak dikenal).

### DELETE /permissions/:id
- **Perilaku:** hapus permanen; mencabut dari semua role dan melepas proteksi menu terkait.
- **Response 200:** `{ success, message, data: { revokedFromRoles, unguardedMenus } }`
- **Catatan:** cache izin Redis dibersihkan agar perubahan langsung berlaku.

## Catatan Perilaku
- Izin **tidak** dibuat otomatis oleh kode modul; sumbernya `prisma/seeds/core/applications.json`.
  Menambah modul baru berarti menambah entri di sana lalu `npm run db:seed`.
- `entity` menentukan nama permission (`<entity>:<action>`), `label` hanya untuk tampilan.
- Grup aksi (`content`, `publishable`, `reviewable`, `verifiable`, `readonly`) ada di
  `roles.json` — memperluas grup berarti mengubah `allowedActions` role terkait.
