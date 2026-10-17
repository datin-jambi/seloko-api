# News & Kategori Berita

- **Aplikasi:** `bapenda-profile`
- **Prefix:** `/api/bapenda/news`
- **Sumber kode:** `src/modules/bapenda/news/news.routes.ts` (logika bersama: `src/modules/shared/article/`)
- **Jumlah endpoint:** 14

Berita memakai tabel universal `articles` dengan `type = NEWS`. Kategori terikat ke `type`,
sehingga kategori berita tidak bercampur dengan kategori jenis konten lain.

## Ringkasan Endpoint

| No | Method | Path | Akses | Deskripsi |
|:--:|---|---|---|---|
| 1 | `GET` | `/public` | publik | Berita `PUBLISHED`, paginasi + filter kategori + cari. |
| 2 | `GET` | `/public/categories` | publik | Kategori berita aktif. |
| 3 | `GET` | `/public/:slug` | publik | Detail berita terbit + tambah `viewCount`. |
| 4 | `GET` | `/categories` | `news-category:list` | Kategori untuk CMS. |
| 5 | `POST` | `/categories` | `news-category:create` | Tambah kategori. |
| 6 | `PUT` | `/categories/:id` | `news-category:update` | Perbarui kategori. |
| 7 | `PATCH` | `/categories/:id/active` | `news-category:update` | Aktif/nonaktif kategori. |
| 8 | `DELETE` | `/categories/:id` | `news-category:delete` | Soft-delete; `409` bila masih dipakai berita. |
| 9 | `GET` | `/` | `news:list` | Daftar CMS. Tanpa izin `approve` hanya melihat miliknya. |
| 10 | `GET` | `/:id` | `news:read` | Detail untuk form edit. |
| 11 | `POST` | `/` | `news:create` | Buat berita baru, status `DRAFT`. |
| 12 | `PUT` | `/:id` | `news:update` | Ubah; hanya saat `DRAFT`/`REJECTED`. |
| 13 | `PATCH` | `/:id/status` | `news:read` + izin aksi | Transisi alur review. |
| 14 | `DELETE` | `/:id` | `news:delete` | Soft-delete. |

## Alur Status

```text
DRAFT ──submit──► PENDING_REVIEW ──approve──► APPROVED ──publish──► PUBLISHED
  ▲                    │                                              │
  └────unpublish───────┴──reject──► REJECTED ──submit──► PENDING_REVIEW
DRAFT ──publish──► PUBLISHED   (izin publish langsung)
```

| Aksi | Dari | Izin |
|---|---|---|
| `submit` | `DRAFT`, `REJECTED` | tidak perlu izin khusus |
| `approve` | `PENDING_REVIEW` | `news:approve` |
| `reject` | `PENDING_REVIEW` | `news:reject` |
| `publish` | `APPROVED`, `DRAFT` | `news:publish` |
| `unpublish` | `PUBLISHED` | `news:publish` |

## Detail Endpoint

### GET /bapenda/news/public
- **Query:** `page`, `limit` (1–50, bawaan 10), `search?`, `category?` (slug kategori).
- **Response 200:**
  ```json
  {
    "statusCode": 200, "code": "SUCCESS", "message": "...",
    "data": [{
      "id": "...", "type": "NEWS", "title": "...", "slug": "...",
      "excerpt": "...", "content": "<p>...</p>",
      "thumbnailUrl": "https://ik.imagekit.io/...", "thumbnailFileId": "...",
      "status": "PUBLISHED", "publishedAt": "2026-06-26T00:47:19.590Z",
      "viewCount": 12,
      "seoTitle": null, "seoDescription": null,
      "category": { "id": "...", "name": "Berita", "slug": "berita" },
      "author": { "id": "...", "fullName": "Andi Saputra" },
      "createdAt": "...", "updatedAt": "..."
    }],
    "meta": { "page": 1, "limit": 10, "total": 3, "totalPages": 1, "hasNextPage": false, "hasPreviousPage": false }
  }
  ```

### GET /bapenda/news/public/categories
- **Response 200:** `data[]` kategori aktif (`id`, `name`, `slug`, `description`, `sortOrder`).

### GET /bapenda/news/public/:slug
- **Response 200:** satu artikel terbit. **Error:** `404` bila slug tidak ada atau belum terbit.
- **Efek samping:** `viewCount` bertambah satu setiap pemanggilan.

### GET /bapenda/news/categories
- **Query:** `search?`, `isActive?`.
- **Response 200:** `data[]` + `meta` (bila berhalaman).

### POST /bapenda/news/categories
- **Body:** `name`, `slug?` (dibentuk dari nama bila kosong), `description?`, `sortOrder?`,
  `isActive?`.
- **Response 201:** objek kategori. **Error:** `409` slug sudah dipakai pada `type` yang sama.

### PUT /bapenda/news/categories/:id
- **Body:** subset field `POST`. **Response 200:** objek kategori.

### PATCH /bapenda/news/categories/:id/active
- **Body:** `{ "isActive": boolean }`

### DELETE /bapenda/news/categories/:id
- **Response 200:** `{ statusCode, code, message, data: { id, deleted: true } }`
- **Error:** `409` masih ada berita yang memakai kategori ini.

### GET /bapenda/news
- **Query:** `page`, `limit` (1–100), `search?`,
  `status?` (`DRAFT`/`PENDING_REVIEW`/`APPROVED`/`REJECTED`/`PUBLISHED`), `categoryId?`,
  `sortBy` (`createdAt`/`updatedAt`/`publishedAt`/`title`/`viewCount`), `sortOrder`.
- **Aturan:** pengguna tanpa `news:approve` hanya menerima berita miliknya sendiri.
- **Response 200:** `data[]` + `meta`.

### GET /bapenda/news/:id
- **Response 200:** detail lengkap termasuk `content` dan `category`. **Error:** `404`.

### POST /bapenda/news
- **Body:** `title`, `content` (HTML, ≥10 karakter), `excerpt?` (≤1000), `categoryId?`,
  `thumbnailUrl?`, `thumbnailFileId?`, `seoTitle?`, `seoDescription?`.
- **Perilaku:** `slug` dibentuk dari judul dan dibuat unik per `(application, type)`;
  `content` disanitasi sebelum disimpan; status awal `DRAFT`.
- **Response 201:** objek berita.

### PUT /bapenda/news/:id
- **Body:** subset field `POST`. Minimal satu.
- **Aturan:** hanya penulis/pemegang izin yang boleh; status harus `DRAFT` atau `REJECTED`.
- **Error:** `403` status tidak mengizinkan edit.

### PATCH /bapenda/news/:id/status
- **Body:** `{ "action": "submit" | "approve" | "reject" | "publish" | "unpublish", "note": "..." }`
  (`note` opsional, dipakai untuk alasan penolakan)
- **Aturan:** transisi divalidasi (`nextStatus`), lalu izin aksi diperiksa di service.
  `publishedAt` diisi saat masuk `PUBLISHED`, dikosongkan saat `unpublish`.
- **Response 200:** objek berita. **Error:** `400` transisi tidak sah · `403` izin aksi kurang.

### DELETE /bapenda/news/:id
- **Response 200:** `{ statusCode, code, message, data: { id, deleted: true } }`

## Catatan Perilaku
- Konten HTML disanitasi `src/common/utils/html.ts`; tabel, `colspan`/`rowspan`, dan `style`
  aman dipertahankan, `<script>`/atribut event dibuang.
- Seed: 5 kategori + 7 berita dari aplikasi lama (`prisma/seeds/bapenda/news.json`), waktu dump
  lama dibaca sebagai WIB lalu disimpan UTC.
- Untuk menambah **jenis** konten baru (mis. `ARTICLE`), tambah nilai `ArticleType` + mount route
  baru memakai service yang sama — bukan menambah tabel.
