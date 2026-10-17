# Organizations (OPD / Unit Kerja)

- **Aplikasi:** `seloko`
- **Prefix:** `/api/organizations`
- **Sumber kode:** `src/modules/core/organizations/organizations.routes.ts`
- **Jumlah endpoint:** 8

Master unit kerja pemerintah lintas aplikasi (OPD, UPTD, biro). Dipakai untuk membatasi data
per unit — mis. admin OPD di Lapak hanya melihat data OPD-nya. Hierarki lewat `parentId`
(OPD → UPTD).

## Ringkasan Endpoint

| No | Method | Path | Guard / Akses | Deskripsi |
|:--:|---|---|---|---|
| 1 | `GET` | `/public` | publik | Daftar OPD aktif untuk filter katalog. |
| 2 | `GET` | `/public/:code` | publik | Profil OPD berdasarkan kode (mis. `/lapak/opd/BPSDM`). |
| 3 | `GET` | `/` | `organization:list` | Daftar dengan paginasi, filter, pencarian. |
| 4 | `GET` | `/:id` | `organization:read` | Detail + induk + jumlah turunan. |
| 5 | `POST` | `/` | `organization:create` | Tambah organisasi. |
| 6 | `PUT` | `/:id` | `organization:update` | Perbarui, termasuk memindahkan induk. |
| 7 | `PATCH` | `/:id/active` | `organization:update` | Aktif/nonaktif, menurun ke seluruh sub-unit. |
| 8 | `DELETE` | `/:id` | `organization:delete` | Soft-delete; ditolak bila masih punya turunan/penugasan. |

## Bentuk Objek

```json
{
  "id": "01a149d6-2834-7c71-8879-98b675db5319",
  "code": "BPSDM",
  "name": "Badan Pengembangan Sumber Daya Manusia Provinsi Jambi",
  "shortName": "BPSDM",
  "type": "OPD",
  "parentId": null,
  "description": null, "address": null, "phone": null, "email": null, "website": null,
  "logoUrl": null, "logoFileId": null,
  "isActive": true,
  "createdAt": "2026-10-18T05:00:00.000Z",
  "updatedAt": "2026-10-18T05:00:00.000Z"
}
```

`type`: `OPD` | `UPTD` | `BIRO` | `LAINNYA`.

## Detail Endpoint

### GET /organizations/public
- **Akses:** publik (header `X-App-Code` tetap wajib).
- **Query:** `type?`, `search?` (nama/nama pendek).
- **Response 200:** `{ success, message, data: [ objek ] }` — hanya `isActive: true`, urut nama.

### GET /organizations/public/:code
- **Params:** `code` (2–50, huruf/angka/`_`/`-`).
- **Response 200:** `{ success, message, data: objek }`
- **Error:** `404` kode tidak ada atau nonaktif.

### GET /organizations
- **Akses:** `authenticate` + `organization:list`.
- **Query:**
  | Nama | Nilai | Keterangan |
  |---|---|---|
  | `page`, `limit` | 1–100 | Paginasi |
  | `search` | teks | `code`, `name`, `shortName` |
  | `type` | `OPD`/`UPTD`/`BIRO`/`LAINNYA` | Filter jenis |
  | `isActive` | `true`/`false` | Filter status |
  | `parentId` | UUID | Anak dari organisasi tertentu |
  | `rootsOnly` | `true` | Hanya baris tanpa induk — untuk dropdown "OPD induk" |
  | `sortBy` | `code`/`name`/`createdAt` | Bawaan `code` |
  | `sortOrder` | `asc`/`desc` | Bawaan `asc` |
- **Response 200:** `data` + `meta` paginasi.

### GET /organizations/:id
- **Response 200:**
  ```json
  {
    "success": true, "message": "Detail organisasi berhasil diambil",
    "data": {
      "id": "...", "code": "BAPELKES", "name": "Balai Pelatihan Kesehatan Provinsi Jambi",
      "shortName": "Bapelkes", "type": "UPTD", "parentId": "...",
      "parent": { "id": "...", "code": "DINKES", "name": "Dinas Kesehatan Provinsi Jambi" },
      "counts": { "children": 0, "userAppRoleScopes": 3 },
      "...": "field lain sama seperti bentuk objek"
    }
  }
  ```
- **Error:** `404`.

### POST /organizations
- **Body:** `code` (wajib, unik global), `name` (wajib), `shortName?`, `type?` (bawaan `OPD`),
  `parentId?`, `description?`, `address?`, `phone?`, `email?`, `website?`, `logoUrl?`,
  `logoFileId?`, `isActive?` (bawaan `true`).
- **Aturan:** kode unik **global** (bukan per tenant) — satu OPD adalah entitas pemerintah yang
  sama di semua aplikasi. `parentId` wajib menunjuk organisasi yang ada.
- **Response 201:** objek organisasi.
- **Error:** `409` kode sudah dipakai · `400` induk tidak ditemukan.

### PUT /organizations/:id
- **Body:** semua field `POST` kecuali `code`. Minimal satu field.
- **Aturan:**
  - `parentId` tidak boleh menunjuk diri sendiri → `400`.
  - Memindahkan induk yang membentuk siklus (A → B → A) ditolak → `400`.
  - Kirim `parentId: null` untuk melepas induk.
- **Response 200:** objek organisasi.

### PATCH /organizations/:id/active
- **Body:** `{ "isActive": true | false }`
- **Perilaku:** menonaktifkan induk **ikut menonaktifkan seluruh turunannya** (UPTD di bawahnya).
  Mengaktifkan kembali hanya mengaktifkan baris yang disebut.
- **Response 200:** `{ success, message, data: objek }`

### DELETE /organizations/:id
- **Perilaku:** soft-delete (`deletedAt` diisi).
- **Response 200:** `{ success: true, message: "...", data: null }`
- **Error:** `409` masih punya sub-unit aktif, atau masih dipakai di penugasan role.
  Sub-unit yang sudah di-soft-delete tidak menahan penghapusan.

## Catatan Perilaku
- Daftar publik hanya membawa kolom identitas — tidak ada penugasan role di dalamnya.
- Seed awal: `BPKPD`, `BPSDM`, `BADAN-PENGHUBUNG`, `DISBUDPAR`, `DINKES`, `BAPELKES` (UPTD di
  bawah `DINKES`), `DISKOP`, `DINSOS`, `DISHUT`.
- Lingkup OPD pada penugasan role dijelaskan di [users.md](./users.md#post-usersidroles) dan
  `src/common/guards/org-scope.ts`.
