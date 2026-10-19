# Bapenda — aplikasi `bapenda-profile`

Portal informasi resmi Bapenda Provinsi Jambi beserta CMS-nya. Endpoint publik bisa diakses tanpa
login (header `X-App-Code: bapenda-profile` tetap wajib); endpoint CMS butuh Bearer + permission
milik aplikasi `bapenda-profile`.

| Modul | Berkas | Endpoint | Prefix | Sumber kode |
|---|---|:---:|---|---|
| UPTD Samsat | [uptds.md](./uptds.md) | 9 | `/api/bapenda/uptds` | `src/modules/bapenda/uptds/` |
| Banners | [banners.md](./banners.md) | 8 | `/api/bapenda/banners` | `src/modules/bapenda/banners/` |
| News & Kategori | [news.md](./news.md) | 14 | `/api/bapenda/news` | `src/modules/bapenda/news/` |
| Halaman Profil | [pages.md](./pages.md) | 8 | `/api/bapenda/pages` | `src/modules/bapenda/pages/` |
| Galeri | [galleries.md](./galleries.md) | 11 | `/api/bapenda/galleries` | `src/modules/bapenda/galleries/` |
| FAQ & Kategori | [faqs.md](./faqs.md) | 15 | `/api/bapenda/faqs` | `src/modules/bapenda/faqs/` |

**Total: 65 endpoint.**

## Peta izin aplikasi `bapenda-profile`

```
Konten   news:*             news-category:create|read|update|delete|list
         page:create|read|update|delete|list|publish
Media    banner:*           gallery:* (reviewable: + approve|reject|publish)
Informasi faq:*             faq-category:create|read|update|delete|list
Layanan  uptd:*
```

## Konvensi modul Bapenda

- Bentuk respons memakai `{ statusCode, code, message, data, meta? }` (warisan modul domain),
  berbeda dari Core yang memakai `success: true`.
- Endpoint publik selalu berawalan `/public` dan tidak memerlukan token.
- Semua modul memakai soft-delete (`deletedAt`); baris terhapus tidak muncul di daftar/detail.
- Konten HTML disanitasi `src/common/utils/html.ts`.
- Berita memakai tabel universal `articles` dengan `type = NEWS`. Modul lain bisa memakai tabel
  yang sama dengan `type` berbeda lewat `src/modules/shared/article/`.

## Status pengerjaan

| Modul | Status |
|---|---|
| UPTD Samsat | ✅ Selesai (11 Samsat ter-seed) |
| Banners | ✅ Selesai (ImageKit dua tahap) |
| News & Kategori | ✅ Selesai (alur review + 7 berita ter-seed) |
| Halaman Profil | ✅ Selesai (5 halaman ter-seed) |
| Galeri | ✅ Selesai (alur review + item + 1 galeri ter-seed) |
| FAQ | ✅ Selesai (toggle terbit + urutan, 18 FAQ ter-seed) |
| Regulasi | ⏳ Antrean |
| Pengaturan Situs | ⏳ Antrean (`Application.settings`) |

Roadmap detail: `.agents/tasks/` dan `.agents/prd/02-bapenda-profile.prd.md`.
