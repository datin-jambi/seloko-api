# Storage (ImageKit)

- **Aplikasi:** `seloko` · **Prefix:** `/api/storage` · **Jumlah endpoint:** 3
- **Sumber kode:** `src/modules/core/storage/storage.routes.ts`

Media terpusat di ImageKit. Folder otomatis `/{appCode}/{module}/{subFolder}`, nama berkas
`{prefix}_{YYYYMMDD}_{HHmmss}_{hash8}{ext}`.

> Bentuk respons memakai `{ statusCode, code, message, data }` — standar media, bukan
> `{ success, data }` seperti modul Core lain.

## Ringkasan Endpoint

| No | Method | Path | Guard | Deskripsi |
|:--:|---|---|---|---|
| 1 | `POST` | `/upload` | `authenticate` | Unggah satu/beberapa berkas |
| 2 | `GET` | `/:fileId` | `authenticate` | Detail & metadata berkas |
| 3 | `DELETE` | `/:fileId` | `authenticate` | Hapus berkas |

---

## 1. POST /api/storage/upload

**Akses:** `authenticate` (tanpa izin khusus).

### Content-Type

`multipart/form-data`. Field berkas: `file` (dapat diulang untuk banyak berkas).

### Query Parameter

| Nama | Wajib | Tipe | Aturan | Default | Keterangan |
|---|:--:|---|---|---|---|
| `module` | — | string | 2–50, `^[a-z0-9_-]+$` | — | Folder tujuan: `articles`, `banners`, `galleries`, `regulations`, … |
| `subFolder` | — | string | ≤50, `^[a-z0-9_-]+$` | — | Subfolder, mis. `thumbnails` |
| `subModule` | — | string | ≤50, `^[a-z0-9_-]+$` | — | Alias `subFolder` |
| `appCode` | — | string | ≤50, `^[a-z0-9_-]+$` | header `X-App-Code` | Override aplikasi tujuan (admin Seloko mengunggah untuk aplikasi lain) |
| `fileName` | — | string | ≤150 | nama asli | Nama berkas kustom |
| `useUniqueFileName` | — | string | `"true"` \| `"false"` | `"true"` | ImageKit menambah akhiran acak |

### Response 201

`data` = objek tunggal, atau **array** bila lebih dari satu berkas diunggah.

| Field | Tipe | Keterangan |
|---|---|---|
| `fileId` | string | **Wajib disimpan** ke entitas — dipakai untuk hapus berkas |
| `url` | string | URL publik ImageKit |
| `name` | string | Nama berkas tersimpan |
| `size` | integer | Byte |
| `filePath` | string | Path lengkap di ImageKit |
| `thumbnailUrl` | string \| null | Thumbnail ImageKit |

```json
{
  "statusCode": 201, "code": "SUCCESS", "message": "Berkas berhasil diunggah",
  "data": {
    "fileId": "66abc123def", "url": "https://ik.imagekit.io/o7kpef481o/bapenda/news/foto.jpg",
    "name": "foto.jpg", "size": 245123,
    "filePath": "/bapenda/news/foto.jpg",
    "thumbnailUrl": "https://ik.imagekit.io/o7kpef481o/tr:n-media_library_thumbnail/bapenda/news/foto.jpg"
  }
}
```

**Error:** `400` berkas tidak ada / tipe tidak didukung / query tidak valid · `401`.

---

## 2. GET /api/storage/:fileId

**Akses:** `authenticate`.

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `fileId` | ✓ | string | ≥1 karakter |

### Response 200

| Field | Tipe |
|---|---|
| `data.fileId` | string |
| `data.name` | string |
| `data.size` | integer |
| `data.url` | string |
| `data.filePath` | string |
| (field metadata ImageKit lain) | — |

**Error:** `404` berkas tidak ditemukan.

---

## 3. DELETE /api/storage/:fileId

**Akses:** `authenticate`.

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `fileId` | ✓ | string | ≥1 karakter |

### Response 200

```json
{ "statusCode": 200, "code": "SUCCESS", "message": "Berkas berhasil dihapus", "data": { "deleted": true } }
```

**Error:** `404` berkas tidak ada.

---

## Catatan Perilaku

- Setiap entitas penyimpan media **wajib** punya pasangan `*Url` + `*FileId` (mis.
  `logoUrl`/`logoFileId`) supaya berkas lama bisa dihapus saat diganti.
- Validasi bersifat **kondisional**: modul Applications memvalidasi berkas hanya saat
  `isActive: true`; draft boleh lolos agar pengisian bertahap tidak terhambat.
- Penghapusan berkas lama dijalankan **asinkron** dan kegagalannya tidak menggagalkan request —
  dicatat di log, bukan dilempar ke klien.
- Batas yang dipakai modul: avatar ≤2 MB & ≥100×100 px; thumbnail berita ≤3 MB & lebar ≥600 px;
  media aplikasi ≤2 MB & ≥32×32 px. Angka pastinya ada di `*.service.ts` tiap modul.
