# UPTD Samsat

- **Aplikasi:** `bapenda-profile`
- **Prefix:** `/api/bapenda/uptds`
- **Sumber kode:** `src/modules/bapenda/uptds/uptds.routes.ts`
- **Jumlah endpoint:** 9

Direktori kantor UPTD Samsat se-Provinsi Jambi, ditampilkan sebagai daftar dan peta publik.

## Ringkasan Endpoint

| No | Method | Path | Akses | Deskripsi |
|:--:|---|---|---|---|
| 1 | `GET` | `/public` | publik | Daftar UPTD aktif untuk direktori publik. |
| 2 | `GET` | `/public/:code` | publik | Detail UPTD berdasarkan kode (mis. `UPTD-001`). |
| 3 | `GET` | `/` | `uptd:list` | Daftar CMS: paginasi, cari, filter kota/aktif/peta. |
| 4 | `GET` | `/:id` | `uptd:read` | Detail UPTD. |
| 5 | `POST` | `/` | `uptd:create` | Tambah UPTD. |
| 6 | `PUT` | `/:id` | `uptd:update` | Perbarui UPTD. |
| 7 | `PATCH` | `/:id/active` | `uptd:update` | Aktif/nonaktif. |
| 8 | `PATCH` | `/:id/map` | `uptd:update` | Toggle tampil/tidak di peta publik. |
| 9 | `DELETE` | `/:id` | `uptd:delete` | Soft-delete. |

## Detail Endpoint

### GET /bapenda/uptds/public
- **Query:** `search?` (nama/kode/alamat), `city?`.
- **Response 200:** hanya `isActive: true`:
  ```json
  {
    "statusCode": 200, "code": "SUCCESS", "message": "...",
    "data": [{
      "id": "...", "code": "UPTD-001", "name": "UPTD Samsat Kota Jambi",
      "description": null, "address": "...", "phone": "...", "email": null,
      "headName": "...", "province": "Jambi", "city": "Kota Jambi",
      "district": null, "subDistrict": null, "postalCode": null,
      "latitude": -1.61, "longitude": 103.61, "googleMapsUrl": null,
      "isActive": true, "showOnPublicMap": true,
      "createdAt": "...", "updatedAt": "..."
    }]
  }
  ```

### GET /bapenda/uptds/public/:code
- **Response 200:** satu objek UPTD. **Error:** `404`.

### GET /bapenda/uptds
- **Query:** `page`, `limit` (1–100), `search?`, `city?`, `isActive?`, `showOnPublicMap?`,
  `sortBy` (`name`/`code`/`city`/`createdAt`), `sortOrder` (`asc`/`desc`).
- **Response 200:** `data[]` + `meta` paginasi.

### GET /bapenda/uptds/:id
- **Response 200:** satu objek. **Error:** `404`.

### POST /bapenda/uptds
- **Body:** `code` (2–50, `^[a-z0-9_-]+$`), `name` (3–150), `description?`, `address?`,
  `phone?`, `email?`, `headName?`, `province?` (bawaan `Jambi`), `city?`, `district?`,
  `subDistrict?`, `postalCode?`, `latitude?`, `longitude?`, `googleMapsUrl?`,
  `isActive?`, `showOnPublicMap?`.
- **Response 201:** objek UPTD. **Error:** `409` kode sudah dipakai.

### PUT /bapenda/uptds/:id
- **Body:** subset field `POST` (kecuali `code`). Minimal satu.
- **Response 200:** objek UPTD.

### PATCH /bapenda/uptds/:id/active
- **Body:** `{ "isActive": boolean }` → `{ statusCode, code, message, data }`

### PATCH /bapenda/uptds/:id/map
- **Body:** `{ "showOnPublicMap": boolean }`
- **Catatan:** hanya UPTD dengan `showOnPublicMap: true` yang dirender di peta portal.

### DELETE /bapenda/uptds/:id
- **Perilaku:** soft-delete → `{ statusCode, code, message, data }`
- **Error:** `404`.

## Catatan Perilaku
- Seed awal: 11 kantor Samsat (`prisma/seeds/bapenda/uptds.json`).
- `latitude`/`longitude` disimpan sebagai float; tidak ada validasi rentang koordinat.
- Status peta dan status aktif sengaja dipisah: kantor bisa tetap tampil di daftar tanpa muncul
  di peta.
