# Berita OPD — `/api/lapak/news`

- **Aplikasi:** `lapak-jambi-web` · **Prefix:** `/api/lapak/news` · **Jumlah endpoint:** 8
- **Sumber kode:** `src/modules/lapak/news/news.routes.ts`
- **Logika bersama:** `src/modules/shared/article/` (dipakai juga Bapenda)
- **Fase:** 4 (LJ-4.1)

## Dasar perancangan (PRD 04 §G)

Berita OPD memakai tabel universal `articles` (type `NEWS`) milik app
`lapak-jambi-web` + kolom **nullable** `organizationId`. Tidak ada tabel berita
khusus Lapak dan tidak ada salinan logika alur status, slug, sanitasi HTML, atau
pembersihan media.

- `organizationId = NULL` → konten Bapenda (perilaku lama, tidak berubah).
- `organizationId = <OPD>` → konten milik OPD tersebut.

`ArticleScope.organizationId` opsional: pemanggil Bapenda tidak mengirimnya, sehingga
query Bapenda persis sama seperti sebelum perubahan.

## Ringkasan Endpoint

| Method | Path | Izin | Keterangan |
|---|---|---|---|
| `GET` | `/public/:code` | publik | Daftar berita PUBLISHED sebuah OPD |
| `GET` | `/public/:code/:slug` | publik | Detail berita (+ hitung pembaca) |
| `GET` | `/` | `news:read` | Daftar berita CMS (lingkup OPD) |
| `GET` | `/:id` | `news:read` | Detail berita CMS |
| `POST` | `/` | `news:create` | Buat berita (status awal `DRAFT`) |
| `PUT` | `/:id` | `news:update` | Perbarui berita |
| `PATCH` | `/:id/status` | `news:update` | submit / approve / reject / publish / unpublish |
| `DELETE` | `/:id` | `news:delete` | Soft delete + pembersihan media |

## Field Request

| Field | Sumber | Tipe | Keterangan |
|---|---|---|---|
| `code` | param | string ≤50 | Kode OPD (rute publik) |
| `slug` | param | string ≤255 | Slug berita |
| `id` | param | uuid | ID berita |
| `organization` | query | string ≤50 | Kode OPD — **hanya Bapenda**; admin OPD selalu OPD-nya sendiri |
| `page` | query | int ≥1 | Halaman |
| `limit` | query | int 1–100 | Per halaman |
| `search` | query | string ≤100 | Cari judul/ringkasan |
| `category` | query | string | Slug kategori (publik) |
| `status` | query | enum | `DRAFT`\|`PENDING_REVIEW`\|`APPROVED`\|`REJECTED`\|`PUBLISHED` |
| `categoryId` | query/body | uuid | Kategori berita |
| `sortBy` | query | enum | `createdAt`\|`updatedAt`\|`publishedAt`\|`title`\|`viewCount` |
| `sortOrder` | query | `asc`\|`desc` | Default `desc` |
| `title` | body | string | Judul |
| `slug` | body | string | Opsional; dibentuk dari judul |
| `excerpt` | body | string | Ringkasan |
| `content` | body | string ≥10 | HTML, disanitasi server |
| `thumbnailUrl` | body | url | Gambar ImageKit |
| `thumbnailFileId` | body | string | fileId ImageKit (untuk pembersihan) |
| `seoTitle` | body | string | Judul SEO |
| `seoDescription` | body | string | Deskripsi SEO |
| `action` | body | enum | `submit`\|`approve`\|`reject`\|`publish`\|`unpublish` |
| `note` | body | string | Catatan perubahan status |

## Lingkup OPD

| Peran | Daftar CMS | `?organization=` |
|---|---|---|
| Superadmin / Bapenda (penugasan tanpa lingkup) | Semua OPD | Boleh memilih OPD mana pun |
| Admin OPD | OPD-nya sendiri | OPD lain → **`404`** |

Lingkup diterapkan di **semua** operasi CMS — termasuk get/update/status/delete via
ID. Berita OPD lain yang diakses lewat ID → `404` (bukan `403`), sehingga
keberadaannya tidak terbocorkan.

## Publik

- Hanya berita `PUBLISHED` milik OPD pada URL.
- Slug berita OPD A yang dibuka lewat URL OPD B → `404`.
- Berita Bapenda (`organizationId = NULL`) **tidak pernah** muncul di rute Lapak.
- Kode OPD tidak dikenal → `404`.
