# Lapak Jambi — aplikasi `lapak-jambi-web`

Marketplace aset daerah: sewa gedung, penginapan, lahan, rekreasi, kios, alat, jasa lab, dan
penjualan hasil usaha (PRD 04). Data dikelola **per OPD**, disajikan ke publik **per kategori**
(master dikelola Bapenda).

- **Audience:** `PUBLIC` — warga mendaftar mandiri lewat `POST /api/auth/register`.
- **Endpoint publik** memakai `X-App-Code: lapak-jambi-web` tanpa login.
- **Endpoint CMS** diakses pegawai lewat gateway `seloko` (INTERNAL), izin dibaca dari aplikasi
  pemilik lewat `GET /permissions/:appId/me` — pegawai tidak pernah login langsung ke aplikasi
  publik.
- **Role:** `admin` / `superadmin` (Bapenda, semua OPD + master), `admin-opd` / `manajer-opd` /
  `petugas-lokasi` (INTERNAL, berlingkup OPD lewat `user_app_role_organizations`), `warga`
  (PUBLIC, order/payment/review saja).

## Berkas Modul

| Modul | Berkas | Endpoint | Prefix |
|---|---|:--:|---|
| Kategori Layanan | [categories.md](./categories.md) | 9 | `/api/lapak/categories` |
| Produk / Aset | [products.md](./products.md) | 8 | `/api/lapak/products` |
| Tarif Produk | [rates.md](./rates.md) | 8 | `/api/lapak/rates` |

**Total: 25 endpoint.**

## Peta Fase (PRD 04 §9)

| Fase | Isi | Status |
|---|---|---|
| 1 | Kategori ✅ · Produk ✅ (tarif/addon/persyaratan/media/fasilitas, alur persetujuan, API publik) · ketersediaan/availability | ⏳ berjalan |
| 2 | Pesanan: quote, checkout SKRD, pembayaran, tiket QR, check-in | ⏳ |
| 3 | Monitoring PAD, laporan, transparansi publik | ⏳ |
| 4 | Konten OPD (berita/artikel/galeri/banner berlingkup OPD) | ⏳ |
| 5 | Ulasan/moderasi, notifikasi, mobile (LJ-5.2) | ⏳ |
