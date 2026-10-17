# News & Kategori Berita

- **Aplikasi:** `bapenda-profile` · **Prefix:** `/api/bapenda/news` · **Jumlah endpoint:** 14
- **Sumber kode:** `src/modules/bapenda/news/news.routes.ts`
- **Logika bersama:** `src/modules/shared/article/` (tabel universal `articles`, `type = NEWS`)

## Ringkasan Endpoint

| No | Method | Path | Guard | Deskripsi |
|:--:|---|---|---|---|
| 1 | `GET` | `/public` | publik | Berita terbit, filter kategori + cari |
| 2 | `GET` | `/public/categories` | publik | Kategori aktif |
| 3 | `GET` | `/public/:slug` | publik | Detail berita + tambah `viewCount` |
| 4 | `GET` | `/categories` | `news-category:list` | Kategori untuk CMS |
| 5 | `POST` | `/categories` | `news-category:create` | Tambah kategori |
| 6 | `PUT` | `/categories/:id` | `news-category:update` | Perbarui kategori |
| 7 | `PATCH` | `/categories/:id/active` | `news-category:update` | Aktif/nonaktif |
| 8 | `DELETE` | `/categories/:id` | `news-category:delete` | Soft-delete; `409` bila dipakai |
| 9 | `GET` | `/` | `news:list` | Daftar CMS |
| 10 | `GET` | `/:id` | `news:read` | Detail untuk edit |
| 11 | `POST` | `/` | `news:create` | Buat (status `DRAFT`) |
| 12 | `PUT` | `/:id` | `news:update` | Ubah (hanya `DRAFT`/`REJECTED`) |
| 13 | `PATCH` | `/:id/status` | `news:read` + izin aksi | Transisi alur review |
| 14 | `DELETE` | `/:id` | `news:delete` | Soft-delete |

## Alur Status

```text
DRAFT ──submit──► PENDING_REVIEW ──approve──► APPROVED ──publish──► PUBLISHED
  ▲                    │                                              │
  └────unpublish───────┴──reject──► REJECTED ──submit──► PENDING_REVIEW
DRAFT ──publish──► PUBLISHED
```

| Aksi | Dari | Izin yang diperiksa |
|---|---|---|
| `submit` | `DRAFT`, `REJECTED` | tidak perlu izin khusus |
| `approve` | `PENDING_REVIEW` | `news:approve` |
| `reject` | `PENDING_REVIEW` | `news:reject` |
| `publish` | `APPROVED`, `DRAFT` | `news:publish` |
| `unpublish` | `PUBLISHED` | `news:publish` |

## Bentuk Objek Artikel

| Field | Tipe | Keterangan |
|---|---|---|
| `id` | string | UUID v7 |
| `type` | enum | `NEWS` untuk modul ini |
| `title` | string | — |
| `slug` | string | Unik per `(application, type)` |
| `excerpt` | string \| null | ≤1000 |
| `content` | string | HTML tersanitasi |
| `thumbnailUrl`, `thumbnailFileId` | string \| null | ImageKit |
| `status` | enum | `DRAFT` \| `PENDING_REVIEW` \| `APPROVED` \| `REJECTED` \| `PUBLISHED` |
| `publishedAt` | string \| null | ISO 8601 |
| `viewCount` | integer | — |
| `seoTitle`, `seoDescription` | string \| null | — |
| `category` | object \| null | `{ id, name, slug }` |
| `author` | object \| null | `{ id, fullName }` — tanpa email/NIP |
| `createdAt`, `updatedAt` | string | ISO 8601 |

---

## 1. GET /api/bapenda/news/public

**Akses:** publik.

### Query Parameter

| Nama | Wajib | Tipe | Aturan | Default | Keterangan |
|---|:--:|---|---|---|---|
| `page` | — | integer | ≥ 1 | `1` | — |
| `limit` | — | integer | 1–50 | `10` | — |
| `search` | — | string | ≤100 karakter | — | Cari di judul & isi |
| `category` | — | string | ≤120 karakter | — | **Slug** kategori, bukan ID |

Hanya `status: PUBLISHED`. Urut `publishedAt DESC`.

### Response 200

```json
{
  "statusCode": 200, "code": "SUCCESS", "message": "Daftar berita berhasil diambil",
  "data": [{
    "id": "...", "type": "NEWS",
    "title": "Bapenda Provinsi Jambi Ikuti Workshop TP2DD",
    "slug": "bapenda-provinsi-jambi-ikuti-workshop-...",
    "excerpt": "Jambi, 23 April 2026 – ...", "content": "<p>...</p>",
    "thumbnailUrl": "https://ik.imagekit.io/...", "thumbnailFileId": "abc123",
    "status": "PUBLISHED", "publishedAt": "2026-06-26T00:47:19.590Z", "viewCount": 12,
    "seoTitle": null, "seoDescription": null,
    "category": { "id": "...", "name": "Berita", "slug": "berita" },
    "author": { "id": "...", "fullName": "Andi Saputra" },
    "createdAt": "...", "updatedAt": "..."
  }],
  "meta": { "page": 1, "limit": 10, "totalItems": 3, "totalPages": 1, "hasNextPage": false, "hasPreviousPage": false }
}
```

---

## 2. GET /api/bapenda/news/public/categories

**Akses:** publik.

### Query Parameter

Tidak ada.

**Response 200:** `data[]` kategori aktif — `id`, `name`, `slug`, `description`, `isActive`,
`sortOrder`.

---

## 3. GET /api/bapenda/news/public/:slug

**Akses:** publik.

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `slug` | ✓ | string | 1–255 |

**Efek samping:** `viewCount` bertambah 1 setiap pemanggilan.

**Response 200:** satu artikel terbit.
**Error:** `404` slug tidak ada atau belum `PUBLISHED`.

---

## 4. GET /api/bapenda/news/categories

**Akses:** `authenticate` + `news-category:list`.

### Query Parameter

| Nama | Wajib | Tipe | Aturan | Keterangan |
|---|:--:|---|---|---|
| `search` | — | string | ≤100 karakter | Cari di `name` |
| `isActive` | — | string | `"true"` \| `"false"` | Filter status |

**Response 200:** `data[]` kategori.

---

## 5. POST /api/bapenda/news/categories

**Akses:** `authenticate` + `news-category:create`.

### Request Body

| Field | Wajib | Tipe | Aturan | Default | Nullable |
|---|:--:|---|---|---|:--:|
| `name` | ✓ | string | 2–100 | — | — |
| `slug` | — | string | ≤120 | dibentuk dari `name` | — |
| `description` | — | string | — | — | ✓ |
| `sortOrder` | — | integer | ≥ 0 | `0` | — |
| `isActive` | — | boolean | — | `true` | — |

```json
{ "name": "Pengumuman", "description": "Pengumuman resmi BAPENDA", "sortOrder": 1 }
```

**Response 201:** objek kategori.
**Error:** `409` slug sudah dipakai pada `type` yang sama.

---

## 6. PUT /api/bapenda/news/categories/:id

**Akses:** `authenticate` + `news-category:update`.

### Path Parameter

| Nama | Wajib | Tipe |
|---|:--:|---|
| `id` | ✓ | uuid |

### Request Body

`CreateCategoryBodySchema.partial()` — semua field `POST` opsional.

**Response 200:** objek kategori.

---

## 7. PATCH /api/bapenda/news/categories/:id/active

**Akses:** `authenticate` + `news-category:update`.

### Request Body

| Field | Wajib | Tipe |
|---|:--:|---|
| `isActive` | ✓ | boolean |

**Response 200:** `{ statusCode, code, message, data: objek }`

---

## 8. DELETE /api/bapenda/news/categories/:id

**Akses:** `authenticate` + `news-category:delete`.

### Path Parameter

| Nama | Wajib | Tipe |
|---|:--:|---|
| `id` | ✓ | uuid |

**Response 200:** `{ statusCode, code, message, data: { id, deleted: true } }`
**Error:** `409` masih ada berita yang memakai kategori ini.

---

## 9. GET /api/bapenda/news

**Akses:** `authenticate` + `news:list`.

### Query Parameter

| Nama | Wajib | Tipe | Aturan | Default | Keterangan |
|---|:--:|---|---|---|---|
| `page` | — | integer | ≥ 1 | `1` | — |
| `limit` | — | integer | 1–100 | `20` | — |
| `search` | — | string | ≤100 karakter | — | Cari di judul |
| `status` | — | enum | `DRAFT` \| `PENDING_REVIEW` \| `APPROVED` \| `REJECTED` \| `PUBLISHED` | — | Filter status |
| `categoryId` | — | uuid | — | — | Filter kategori (ID, bukan slug) |
| `sortBy` | — | enum | `createdAt` \| `updatedAt` \| `publishedAt` \| `title` \| `viewCount` | `createdAt` | — |
| `sortOrder` | — | enum | `asc` \| `desc` | `desc` | — |

**Aturan:** pengguna **tanpa** `news:approve` hanya menerima berita miliknya sendiri.

**Response 200:** `data[]` + `meta`.

---

## 10. GET /api/bapenda/news/:id

**Akses:** `authenticate` + `news:read`.

### Path Parameter

| Nama | Wajib | Tipe |
|---|:--:|---|
| `id` | ✓ | uuid |

**Response 200:** detail lengkap termasuk `content` & `category`. **Error:** `404`.

---

## 11. POST /api/bapenda/news

**Akses:** `authenticate` + `news:create`.

### Request Body

| Field | Wajib | Tipe | Aturan | Default | Nullable | Keterangan |
|---|:--:|---|---|---|:--:|---|
| `categoryId` | ✓ | uuid | — | — | — | Kategori **wajib** dipilih |
| `title` | ✓ | string | 5–255 | — | — | — |
| `content` | ✓ | string | ≥10 karakter | — | — | HTML; disanitasi |
| `slug` | — | string | ≤255 | dari `title`, dibuat unik | — | — |
| `excerpt` | — | string | ≤1000 | — | ✓ | — |
| `thumbnailUrl` | — | string | URL valid | — | ✓ | — |
| `thumbnailFileId` | — | string | ≤100 | — | ✓ | — |
| `seoTitle` | — | string | ≤255 | — | ✓ | — |
| `seoDescription` | — | string | ≤500 | — | ✓ | — |

```json
{
  "categoryId": "<uuid kategori Berita>",
  "title": "Pemutihan Pajak 2026 Resmi Dibuka",
  "excerpt": "Program pemutihan berlangsung 18 Agustus – 30 September 2026.",
  "content": "<p>Pemerintah Provinsi Jambi membuka program pemutihan...</p>",
  "thumbnailUrl": "https://ik.imagekit.io/.../news.jpg",
  "thumbnailFileId": "66abc123def"
}
```

**Response 201:** objek berita dengan `status: "DRAFT"`.

---

## 12. PUT /api/bapenda/news/:id

**Akses:** `authenticate` + `news:update`.

### Path Parameter

| Nama | Wajib | Tipe |
|---|:--:|---|
| `id` | ✓ | uuid |

### Request Body

`CreateArticleBodySchema.partial()` — semua field `POST` opsional. Minimal satu field.

**Aturan:** hanya penulis atau pemegang izin yang boleh; status harus `DRAFT` atau `REJECTED`.

**Response 200:** objek berita.
**Error:** `403` status tidak mengizinkan edit · `404`.

---

## 13. PATCH /api/bapenda/news/:id/status

**Akses:** `authenticate` + `news:read`; izin aksi (`approve`/`reject`/`publish`) diperiksa di
service sesuai `action` yang dikirim.

### Path Parameter

| Nama | Wajib | Tipe |
|---|:--:|---|
| `id` | ✓ | uuid |

### Request Body

| Field | Wajib | Tipe | Aturan | Keterangan |
|---|:--:|---|---|---|
| `action` | ✓ | enum | `submit` \| `approve` \| `reject` \| `publish` \| `unpublish` | — |
| `note` | — | string | ≤500 | Alasan, biasanya untuk `reject` |

```json
{ "action": "reject", "note": "Mohon lengkapi sumber foto kegiatan." }
```

**Perilaku:** transisi divalidasi `nextStatus()`, lalu izin aksi diperiksa. `publishedAt` diisi saat
masuk `PUBLISHED`, dikosongkan saat `unpublish`.

**Response 200:** objek berita.
**Error:** `400` transisi tidak sah · `403` izin aksi kurang.

---

## 14. DELETE /api/bapenda/news/:id

**Akses:** `authenticate` + `news:delete`.

### Path Parameter

| Nama | Wajib | Tipe |
|---|:--:|---|
| `id` | ✓ | uuid |

**Response 200:** `{ statusCode, code, message, data: { id, deleted: true } }`

---

## Catatan Perilaku

- Konten disanitasi `src/common/utils/html.ts`: tabel, `colspan`/`rowspan`, dan `style` aman
  dipertahankan; `<script>` dan atribut event dibuang.
- Seed: 5 kategori + 7 berita dari aplikasi lama. Waktu dump lama dibaca sebagai WIB lalu disimpan
  UTC.
- Menambah **jenis** konten baru (mis. `ARTICLE`): tambah nilai `ArticleType` lalu mount route baru
  memakai service yang sama — bukan menambah tabel.
- `categoryId` di body memakai **UUID**, sedangkan filter publik memakai **slug**. Ini disengaja:
  CMS memilih dari dropdown (ID), portal publik memakai URL yang ramah SEO (slug).
