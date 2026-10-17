# Menus

- **Aplikasi:** `seloko`
- **Prefix:** `/api/menus`
- **Sumber kode:** `src/modules/core/menus/menus.routes.ts`
- **Jumlah endpoint:** 8

Sidebar dinamis per aplikasi. Penyaringan berlapis saat `GET /me`: menu & aplikasi harus aktif →
`permissionId` harus dipegang user → `menuRoles` (bila diisi) harus cocok. Grup yang seluruh
anaknya tersembunyi ikut disembunyikan.

Path internal menu CMS wajib berawalan kode aplikasinya (`/seloko/...`, `/bapenda/...`,
`/lapak/...`) supaya satu frontend super app bisa merutekan tanpa bentrok.

## Ringkasan Endpoint

| No | Method | Path | Guard | Deskripsi |
|:--:|---|---|---|---|
| 1 | `GET` | `/me` | `authenticate` | Pohon menu pengguna untuk sidebar, sudah tersaring. |
| 2 | `GET` | `/` | `application:read` | Daftar menu CMS: flat + paginasi, atau `?tree=true`. |
| 3 | `PATCH` | `/reorder` | `application:update` | Urutkan ulang massal (`sortOrder` + `parentId`). |
| 4 | `GET` | `/:id` | `application:read` | Detail + parent, children, permission, role pembatas. |
| 5 | `POST` | `/` | `application:update` | Buat menu (root atau sub-menu). |
| 6 | `PATCH` | `/:id` | `application:update` | Perbarui label/icon/path/sortOrder/parent/permission/roles. |
| 7 | `PATCH` | `/:id/activate` | `application:update` | Aktif/nonaktif tanpa hapus. |
| 8 | `DELETE` | `/:id` | `application:update` | Hapus permanen + cascade sub-menu. |

## Detail Endpoint

### GET /menus/me
- **Akses:** `authenticate` saja.
- **Response 200:** pohon menu aplikasi `X-App-Code`:
  ```json
  {
    "success": true, "message": "...",
    "data": [{
      "id": "...", "code": "konten", "label": "Konten", "icon": "newspaper",
      "path": null, "isExternal": false,
      "children": [{
        "id": "...", "code": "konten.berita", "label": "Berita", "icon": "file-text",
        "path": "/bapenda/berita", "isExternal": false, "children": []
      }]
    }]
  }
  ```

### GET /menus
- **Query:** `page`, `limit` (1–200, bawaan 50), `applicationId?`,
  `parentId?` (UUID atau literal `root`), `isActive?`, `search?` (label/kode),
  `tree` (`true` untuk pohon penuh, mengabaikan paginasi).
- **Response 200:** `data[]` (+ `meta` pada mode flat). Mode tree mengembalikan node bersarang.

### PATCH /menus/reorder
- **Body:** array item `{ id, sortOrder, parentId? }`.
- **Perilaku:** perbarui `sortOrder` dan/atau induk banyak menu sekaligus — untuk drag-and-drop.
- **Aturan:** hierarki melingkar ditolak.
- **Response 200:** `{ success, message, data: { updated } }`

### GET /menus/:id
- **Response 200:** detail menu + `parent`, `children[]`, `permission` (`id`, `code`),
  `roles[]` (role pembatas).

### POST /menus
- **Body:** `applicationId`, `code` (unik per aplikasi), `label`, `icon?`, `path?`,
  `isExternal?`, `sortOrder?`, `parentId?`, `permissionId?`, `roleIds?`, `isActive?`.
- **Aturan:** path internal wajib berawalan `/seloko`, `/bapenda`, `/lapak`, dst.; `isExternal`
  menandai URL absolut dan tidak wajib berawalan.
- **Response 201:** objek menu.

### PATCH /menus/:id
- **Body:** subset field `POST` (kecuali `applicationId`). `roleIds` mengganti seluruh role
  pembatas.
- **Response 200:** objek menu.

### PATCH /menus/:id/activate
- **Body:** `{ "isActive": boolean }` → `{ success, message, data: { isActive } }`

### DELETE /menus/:id
- **Perilaku:** hapus permanen; sub-menu anak ikut terhapus (cascade).
- **Response 200:** `{ success: true, message: "...", data: null }`

## Catatan Perilaku
- Sumber seed: `prisma/seeds/core/menus.json`. `code` dipakai sebagai kunci upsert — ubah label
  sesuka hati, jangan ubah `code`.
- `path` relatif digabung dengan `Application.baseUrl` saat frontend merender tautan.
- Pengecekan awalan path diuji otomatis oleh `prisma/smoke/menus.check.ts`.
