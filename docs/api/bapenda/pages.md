# Halaman Profil (Pages)

- **Aplikasi:** `bapenda-profile`
- **Prefix:** `/api/bapenda/pages`
- **Sumber kode:** `src/modules/bapenda/pages/pages.routes.ts`
- **Jumlah endpoint:** 8

Halaman statis profil lembaga: sejarah, visi-misi, tupoksi, struktur organisasi, pejabat.
Tanpa alur review — halaman baru selalu `DRAFT`, terbit/tarik lewat satu endpoint.

## Ringkasan Endpoint

| No | Method | Path | Akses | Deskripsi |
|:--:|---|---|---|---|
| 1 | `GET` | `/public` | publik | Daftar halaman terbit **tanpa isi** — untuk menu navigasi. |
| 2 | `GET` | `/public/:slug` | publik | Isi halaman terbit (mis. `sejarah`, `pejabat`). |
| 3 | `GET` | `/` | `page:list` | Daftar CMS: paginasi, cari, filter terbit/draft. |
| 4 | `GET` | `/:id` | `page:read` | Detail untuk form edit. |
| 5 | `POST` | `/` | `page:create` | Tambah halaman (status draft). |
| 6 | `PUT` | `/:id` | `page:update` | Perbarui halaman. |
| 7 | `PATCH` | `/:id/publish` | `page:publish` | Terbitkan atau tarik ke draft. |
| 8 | `DELETE` | `/:id` | `page:delete` | Soft-delete. |

## Detail Endpoint

### GET /bapenda/pages/public
- **Response 200:** hanya `isPublished: true`, urut `createdAt` asc:
  ```json
  {
    "statusCode": 200, "code": "SUCCESS", "message": "...",
    "data": [{
      "id": "...", "title": "Sejarah", "slug": "sejarah",
      "seoTitle": "Sejarah BAPENDA Provinsi Jambi",
      "seoDescription": "Sejarah dan latar belakang Badan Pendapatan Daerah Provinsi Jambi",
      "isPublished": true, "publishedAt": "2026-06-22T19:29:09.151Z",
      "createdAt": "...", "updatedAt": "..."
    }]
  }
  ```
- **Catatan:** sengaja **tanpa** `content` agar payload menu tetap ringan.

### GET /bapenda/pages/public/:slug
- **Response 200:** satu halaman lengkap termasuk `content`.
- **Error:** `404` bila slug tidak ada atau belum terbit.

### GET /bapenda/pages
- **Query:** `page`, `limit` (1–100), `search?` (judul/slug), `isPublished` (`true`/`false`),
  `sortBy` (`title`/`createdAt`/`updatedAt`), `sortOrder` (`asc`/`desc`).
- **Response 200:** `data[]` + `meta`.

### GET /bapenda/pages/:id
- **Response 200:** satu halaman. **Error:** `404`.

### POST /bapenda/pages
- **Body:** `title` (2–200), `content` (HTML, ≥10 karakter), `slug?`, `seoTitle?` (≤255),
  `seoDescription?` (≤500).
- **Aturan:** `slug` dibentuk dari judul bila kosong. Slug adalah URL tetap (`/profil/<slug>`),
  jadi **tidak** diberi akhiran otomatis — bentrok ditolak `409`. `content` disanitasi.
- **Response 201:** objek halaman (`isPublished: false`).

### PUT /bapenda/pages/:id
- **Body:** subset field `POST`. Minimal satu.
- **Perilaku:** mengganti `slug` akan memutus URL lama — lakukan hanya bila disengaja.
- **Response 200:** objek halaman.

### PATCH /bapenda/pages/:id/publish
- **Body:** `{ "isPublished": true | false }`
- **Perilaku:** `true` → `publishedAt` diisi waktu sekarang; `false` → `publishedAt` dikosongkan.
- **Response 200:** objek halaman.

### DELETE /bapenda/pages/:id
- **Response 200:** `{ statusCode, code, message, data: { id, deleted: true } }`

## Catatan Perilaku
- Diuji oleh suite smoke `pages` (20 skenario) dan `src/common/utils/html.check.ts`.
- Seed: 5 halaman dari aplikasi lama, semuanya terbit. Aplikasi lama tidak menyimpan
  `publishedAt`, jadi diisi dari `updatedAt` saat migrasi.
- Konten halaman Pejabat berisi tabel dengan `colspan`/`rowspan` dan warna teks — sanitasi
  dipertahankan agar tabel tidak rusak.
