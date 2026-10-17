# Applications

- **Aplikasi:** `seloko`
- **Prefix:** `/api/applications`
- **Sumber kode:** `src/modules/core/applications/applications.routes.ts`
- **Jumlah endpoint:** 8

Tenant aplikasi di ekosistem SELOKO. Setiap aplikasi punya `code` (dipakai sebagai
`X-App-Code`), audience, branding, dan `settings` JSONB untuk konfigurasi tampilan.

## Ringkasan Endpoint

| No | Method | Path | Guard / Akses | Deskripsi |
|:--:|---|---|---|---|
| 1 | `GET` | `/` | `application:list` | Daftar aplikasi + `counts` role/permission/menu/pengguna. |
| 2 | `GET` | `/public-config/:code` | **publik** | Bootstrap frontend: branding, kontak, SEO, status fitur. |
| 3 | `GET` | `/me` | `authenticate` | Aplikasi yang boleh diakses user — untuk launcher super app. |
| 4 | `GET` | `/:id` | `application:read` | Detail + roles + permission per modul. |
| 5 | `POST` | `/` | `application:create` | Daftarkan aplikasi baru. |
| 6 | `PATCH` | `/:id` | `application:update` | Perbarui metadata/branding/settings. |
| 7 | `PATCH` | `/:id/activate` | `application:update` | Aktif/nonaktif; menonaktifkan mencabut sesi pada aplikasi itu. |
| 8 | `DELETE` | `/:id` | `application:delete` | Hapus permanen (cascade). Ditolak untuk `seloko` atau bila masih ada pengguna. |

## Detail Endpoint

### GET /applications
- **Query:** `page`, `limit` (1–100), `search` (kode/nama), `audience` (`INTERNAL`/`PUBLIC`),
  `isActive` (`true`/`false`).
- **Response 200:** `data[]` berisi bentuk aplikasi + `counts`:
  ```json
  {
    "id": "...", "code": "bapenda-profile", "name": "Bapenda Profile Portal",
    "tagline": "...", "description": "...", "baseUrl": "http://localhost:3002",
    "icon": "globe", "audience": "PUBLIC",
    "logoUrl": "...", "logoFileId": "...", "logoDarkUrl": null, "logoDarkFileId": null,
    "faviconUrl": "...", "faviconFileId": "...", "ogImageUrl": null, "ogImageFileId": null,
    "settings": { "branding": {}, "contact": {}, "seo": {}, "features": {} },
    "isActive": true, "createdAt": "...", "updatedAt": "...",
    "counts": { "permissions": 34, "roles": 5, "menuItems": 9, "userAppRoles": 12 }
  }
  ```

### GET /applications/public-config/:code
- **Akses:** publik, **tanpa** autentikasi (header `X-App-Code` tetap wajib).
- **Response 200:** identitas + branding + kontak + SEO + `features`
  (`maintenanceMode`, `enablePayment`, `enableRegistration`, `announcement`).
  Tidak memuat data internal (role, permission, pengguna).
- **Error:** `404` kode tidak ada / tidak aktif.

### GET /applications/me
- **Akses:** `authenticate` saja (tanpa izin) — isinya milik pemanggil.
- **Response 200:** daftar aplikasi aktif tempat user punya penugasan + nama role.
  `isSuperAdmin` melihat seluruh aplikasi aktif.
- **Catatan:** inilah data untuk merender launcher super app.

### GET /applications/:id
- **Response 200:** bentuk aplikasi + `counts` + `roles[]`
  (`id`, `name`, `description`, `audience`, `isSystemRole`, `isActive`, `permissionCount`)
  + `permissionsByModule[]` (`{ module, permissions: [{ id, code, name }] }`).

### POST /applications
- **Body:** `code` (2–50, `^[a-z0-9_-]+$`), `name` (2–100), `audience` (**wajib, final**),
  `tagline?`, `description?`, `baseUrl?`, `icon?`, `logoUrl?`/`logoFileId?`,
  `logoDarkUrl?`/`logoDarkFileId?`, `faviconUrl?`/`faviconFileId?`, `ogImageUrl?`/`ogImageFileId?`,
  `settings?`, `isActive?` (bawaan `true`).
- **Aturan media:** berkas ImageKit divalidasi (ukuran ≤2 MB, dimensi ≥32px) **hanya** saat
  `isActive: true`. Draft boleh tanpa validasi.
- **Response 201:** bentuk aplikasi.
- **Error:** `409` kode sudah dipakai · `400` media tidak valid.

### PATCH /applications/:id
- **Body:** semua field `POST` kecuali `code` dan `audience` (keduanya final). Minimal satu.
- **Response 200:** bentuk aplikasi.

### PATCH /applications/:id/activate
- **Body:** `{ "isActive": boolean }`
- **Perilaku:** menonaktifkan aplikasi mencabut sesi berjalan pada aplikasi tersebut.
- **Response 200:** `{ success, message, data: { isActive } }`
- **Error:** `403` aplikasi inti `seloko` tidak boleh dinonaktifkan.

### DELETE /applications/:id
- **Perilaku:** hapus permanen + cascade (roles, permissions, menus).
- **Response 200:** `{ success: true, message: "...", data: null }`
- **Error:** `403` aplikasi inti · `409` masih punya pengguna yang ditugaskan.

## Catatan Perilaku
- `audience` tidak dapat diubah setelah dibuat: akun yang sudah terdaftar akan terdampar bila
  jenis aplikasi berganti.
- `settings` divalidasi Zod dengan `.strict()`, jadi salah ketik nama field ditolak — bukan
  tersimpan diam-diam.
- `baseUrl` dan `icon` dikelola lewat `menus.json` saat seeding, bukan lewat modul ini.
- **Beda dengan `Organization`:** `Application` adalah perangkat lunak (batas menu & permission);
  `Organization` adalah unit kerja pemerintah (batas data). Lihat
  [organizations.md](./organizations.md).
