# Storage (ImageKit)

- **Aplikasi:** `seloko`
- **Prefix:** `/api/storage`
- **Sumber kode:** `src/modules/core/storage/storage.routes.ts`
- **Jumlah endpoint:** 3

Media terpusat di ImageKit. Unggahan dua tahap: klien meminta parameter autentikasi ke
`POST /upload` (atau mengunggah langsung lewat endpoint ini), lalu menyimpan `fileId` + `url`
ke entitas pemiliknya.

Bentuk respons modul ini memakai `{ statusCode, code, message, data }` — warisan standar media,
bukan `{ success, data }` seperti modul Core lain.

## Ringkasan Endpoint

| No | Method | Path | Guard | Deskripsi |
|:--:|---|---|---|---|
| 1 | `POST` | `/upload` | `authenticate` | Unggah satu atau beberapa berkas ke ImageKit. |
| 2 | `GET` | `/:fileId` | `authenticate` | Detail berkas (nama, ukuran, URL, path). |
| 3 | `DELETE` | `/:fileId` | `authenticate` | Hapus berkas dari ImageKit. |

## Detail Endpoint

### POST /storage/upload
- **Content-Type:** `multipart/form-data` (field berkas: `file`, boleh lebih dari satu).
- **Query:**
  | Nama | Keterangan |
  |---|---|
  | `module` | Folder tujuan, mis. `articles`, `banners`, `galleries`, `regulations` |
  | `subFolder` / `subModule` | Subfolder opsional (alias satu sama lain) |
  | `appCode` | Override aplikasi tujuan — dipakai admin Seloko yang mengunggah untuk aplikasi lain |
  | `fileName` | Nama berkas kustom |
  | `useUniqueFileName` | `true`/`false` — apakah ImageKit menambah akhiran acak (bawaan `true`) |
- **Response 201:**
  ```json
  {
    "statusCode": 201, "code": "SUCCESS", "message": "...",
    "data": { "fileId": "abc123", "url": "https://ik.imagekit.io/...", "name": "foto.jpg",
              "size": 245123, "filePath": "/bapenda/articles/foto.jpg", "thumbnailUrl": "..." }
  }
  ```
  Bila beberapa berkas diunggah, `data` berupa array dengan bentuk yang sama.
- **Error:** `400` berkas tidak ada / tipe tidak didukung.

### GET /storage/:fileId
- **Response 200:** `{ statusCode, code, message, data: { fileId, name, size, url, filePath, ... } }`
- **Error:** `404` berkas tidak ditemukan di ImageKit.

### DELETE /storage/:fileId
- **Response 200:** `{ statusCode, code, message, data: { deleted: true } }`
- **Error:** `404` berkas tidak ada.

## Catatan Perilaku
- Setiap entitas yang menyimpan media **wajib** menyimpan pasangan `*Url` + `*FileId`
  (mis. `logoUrl`/`logoFileId`), supaya berkas lama bisa dihapus saat diganti.
- Validasi bersifat **kondisional**: modul Applications memvalidasi berkas hanya saat
  `isActive: true`; draft boleh lolos agar pengisian bertahap tidak terhambat.
- Penghapusan berkas lama dilakukan **asinkron** dan kegagalannya tidak menggagalkan request —
  dicatat di log, bukan dilempar ke klien.
- Batas umum yang dipakai modul: gambar ≤2 MB (avatar) atau ≤3 MB (thumbnail berita), dimensi
  minimum 32–600 px tergantung modul. Angkanya ada di `*.service.ts` masing-masing modul.
