# 🌐 PRD 02: Bapenda Profile & Portal Publik BPKPD Jambi

- **Kode Aplikasi Tenant:** `bapenda-profile`
- **Tipe Domain:** Portal Informasi Publik Resmi, Direktori Layanan Samsat, Edukasi Pajak Daerah, & Publikasi Regulasi
- **Status Modul Saat Ini:** 🟡 **Dalam Pengerjaan (Modul 3: Articles & Categories)**

---

## 1. Latar Belakang & Masalah Bisnis
Masyarakat Provinsi Jambi membutuhkan portal resmi yang transparan, terpercaya, dan mudah diakses untuk memperoleh informasi mengenai:
- Lokasi dan jam operasional 11 kantor Samsat se-Provinsi Jambi.
- Program keringanan pajak / pemutihan denda pajak kendaraan bermotor.
- Berita resmi, rilis pers, dan artikel transparansi pengelolaan pendapatan daerah.
- Tanya jawab seputar perpajakan daerah (FAQ).
- Dokumen produk hukum dan regulasi daerah (Perda, Pergub) yang dapat diunduh langsung.

---

## 2. Roadmap & Status Fitur

| No | Modul Fitur | Endpoint Prefix | Status | Catatan / Highlight Fitur |
|:---:|:---|:---|:---:|:---|
| **1** | **UPTD Samsat** | `/api/bapenda/uptds` | ✅ **Selesai** | 11 kantor Samsat ter-seed, koordinat geolokasi peta publik, direktori publik & CMS. |
| **2** | **Carousel Banners** | `/api/bapenda/banners` | ✅ **Selesai** | Slot ganda (desktop & mobile), toleransi ImageKit bersyarat, auto-cleanup, drag-and-drop reorder. |
| **3** | **Articles & Categories** | `/api/bapenda/articles` | ⏳ **Target Berikutnya** | Kategori berita, rich content, cover media ImageKit, author relasi user, status draft/published, counter views, SEO. |
| **4** | **Tanya Jawab (FAQs)** | `/api/bapenda/faqs` | ⏳ *Antrean* | Pertanyaan & jawaban seputar pajak/e-Samsat, kategori FAQ, urutan sortOrder. |
| **5** | **Regulasi & Dokumen** | `/api/bapenda/regulations` | ⏳ *Antrean* | Perda, Pergub, Kepgub, status berlaku/dicabut, unduhan PDF lampiran ImageKit. |

---

## 3. Spesifikasi Rinci Modul

### A. Modul 1: UPTD Samsat (`/api/bapenda/uptds`) — ✅ Selesai
- **Publik:** `GET /public` (semua kantor aktif), `GET /public/:code` (detail per kantor).
- **CMS:** CRUD lengkap, filter kota, sorting, toggle status operasional (`/active`), dan toggle pin peta (`/map`).
- **Geolokasi:** `latitude`, `longitude`, `googleMapsUrl` untuk integrasi Leaflet / Google Maps.

### B. Modul 2: Banners (`/api/bapenda/banners`) — ✅ Selesai
- **Dual-Device:** Slot Desktop (lebar $\ge 800\text{ px}$, max 3MB) dan Slot Mobile (lebar $\ge 360\text{ px}$, max 1.5MB).
- **Validasi Toleran ImageKit:** Hanya diperiksa jika banner berstatus aktif (`isActive: true`).
- **CMS Reorder:** `PATCH /reorder` untuk update urutan `sortOrder` massal.

---

### C. Modul 3: Articles & Categories (`/api/bapenda/articles`) — ⏳ Target Pengerjaan
Modul ini bertugas mengelola publikasi berita, siaran pers, dan artikel edukasi keuangan daerah.

#### 1. Kebutuhan Entitas Kategori (`ArticleCategory`):
- `id`: UUID v7.
- `applicationId`: Menghubungkan ke `bapenda-profile`.
- `name`: Nama kategori (mis. *"Berita Utama"*, *"Pajak Daerah"*, *"Sosialisasi"*).
- `slug`: Unik per tenant `@@unique([applicationId, slug])`.
- `description`: Deskripsi singkat opsional.
- `isActive`: Boolean status tampil.

#### 2. Kebutuhan Entitas Artikel (`Article`):
- `id`: UUID v7.
- `applicationId`: Menghubungkan ke `bapenda-profile`.
- `categoryId`: Relasi ke `ArticleCategory`.
- `authorId`: Relasi opsional ke `User` (penulis/pembuat artikel).
- `title`: Judul artikel (10 - 250 karakter).
- `slug`: Unik per tenant `@@unique([applicationId, slug])`.
- `content`: Konten artikel lengkap (HTML / Markdown).
- `excerpt`: Ringkasan 1-2 paragraf untuk preview kartu artikel di frontend.
- **Media Cover (ImageKit):** Pasangan `coverImageUrl` & `coverImageFileId` (landscape, max 3MB, min lebar 600px).
- **Status Publikasi (`status`):**
  - `DRAFT`: Artikel baru/belum siap rilis.
  - `PUBLISHED`: Artikel tayang di portal publik.
  - `ARCHIVED`: Artikel diarsipkan/tidak tampil di beranda.
- `viewsCount`: Counter hitungan pembaca (integer, default 0).
- `isFeatured`: Menandai artikel unggulan / headline di beranda.
- `publishedAt`: Timestamp tanggal resmi artikel diterbitkan.
- **SEO Metadata:**
  - `metaTitle`: Judul khusus untuk tag `<title>` browser/Google.
  - `metaDescription`: Deskripsi untuk snippet mesin pencari.
- **Timestamps & Soft Delete:** `createdAt`, `updatedAt`, `deletedAt`.

#### 3. Rencana Endpoint API Articles:
- **Publik:**
  - `GET /api/bapenda/articles/public` (Daftar artikel `PUBLISHED`, pagination, filter kategori, search).
  - `GET /api/bapenda/articles/public/featured` (Artikel pilihan/headline).
  - `GET /api/bapenda/articles/public/:slug` (Detail artikel + auto-increment view count).
  - `GET /api/bapenda/articles/public/categories` (Daftar kategori artikel aktif).
- **CMS:**
  - CRUD Kategori (`/categories`).
  - CRUD Artikel (List dengan filter status/kategori, Create draft, Update, Publish/Archive, Soft-delete).

---

### D. Modul 4: FAQs / Tanya Jawab (`/api/bapenda/faqs`) — ⏳ Antrean
- Tanya jawab seputar e-Samsat, dokumen persyaratan bayar pajak, mutasi kendaraan, dan pemutihan.
- Kolom: `category`, `question`, `answer`, `sortOrder`, `isActive`.

### E. Modul 5: Regulasi & Dokumen Daerah (`/api/bapenda/regulations`) — ⏳ Antrean
- Manajemen produk hukum resmi daerah.
- Kolom: `title`, `slug`, `type` (PERDA / PERGUB / UU), `number` (Nomor regulasi), `year` (Tahun), `about` (Tentang), `status` (BERLAKU / DICABUT), lampiran berkas PDF (`fileUrl`, `fileId`, `fileSize`, `mimeType`).
