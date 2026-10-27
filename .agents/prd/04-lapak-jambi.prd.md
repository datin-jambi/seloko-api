# 🛒 PRD 04: Lapak Jambi — E-Marketplace Layanan Aset Daerah

- **Kode Aplikasi Tenant:** `lapak-jambi-web` (MVP, web). `lapak-jambi-app` (mobile) menyusul; penggabungan + strategi auth lintas aplikasi = tugas `LJ-5.2` (§4.A).
- **Nama Publik:** **Lapak Jambi** (proposal resmi memakai "E-Marketplace Jambi Mantap"; diganti menjadi lepak jambi agar lebih akrab bagi masyarakat, membuat brand lapak jambi sendiri ini tujuan kedepannya).
- **Tipe Domain:** Marketplace layanan aset & jasa usaha daerah penghasil **retribusi** (bagian PAD), lintas OPD.
- **Dasar Hukum:** UU 1/2022 (HKPD), PP 35/2023, Perda Provinsi Jambi 5/2024 tentang Pajak Daerah & Retribusi Daerah.
- **Referensi:**
  - Proposal: Google Doc "Pengembangan E-Marketplace Layanan Aset Daerah Jambi Mantap" (+ 4 infografis alur & contoh tarif).
  - Frontend publik (Next.js 16 + shadcn, data dummy): `C:\Users\ASUS\Documents\BPKPD\Code\lj-app`. Bagian `/cms` di sana **tidak dipakai** — CMS pindah ke seloko-web.
  - Backend lama (mentah, hanya referensi): `C:\Users\ASUS\Documents\BPKPD\Code\kito-api` (`datin-jambi/kito-api`): OPD, TargetOPD, RetributionObject, Asset(+Image/Facility).
- **Status:** 🟡 **Fase 0 — Fondasi Core.** Pipeline tugas & progres: [`../tasks/lapak-jambi.md`](../tasks/lapak-jambi.md). Roadmap ringkas di §9.

---

## 1. Latar Belakang & Tujuan
Pemanfaatan aset daerah (gedung, penginapan, lahan, kolam renang, kios, alat, lab) masih manual dan tersebar per OPD: tarif kurang transparan, rawan kebocoran, tidak ada data real-time, dan masyarakat tidak tahu aset apa yang bisa disewa.

**Tujuan:**
1. **Bapenda** melihat setiap transaksi retribusi (PAD) secara detail, real-time, dan transparan lintas OPD.
2. **Masyarakat** mengetahui bahwa ada PAD di setiap tempat, dan mudah menyewa/membeli layanan pemerintah.
3. **OPD** memasarkan layanannya sendiri lewat berita/artikel/konten.

**Prinsip penyajian:** data dikelola **per OPD**, tetapi disajikan ke publik **per kategori** (dikelola Bapenda) agar mudah dicerna.

---

## 2. Aktor & Kanal

| Aktor | Akun | Kanal | Kewenangan |
|---|---|---|---|
| Pengunjung | — | Web publik (Next.js, SEO) | Lihat katalog, jadwal kosong, tarif, berita, galeri |
| Masyarakat / Swasta | `PUBLIC` @ `lapak-jambi-web` | Web publik (mobile menyusul) | + pesan, bayar, unggah dokumen, SKRD & tiket, komentar/rating, wishlist, kelola akun |
| Admin OPD | `INTERNAL` | seloko-web (`/lapak/...`) | Kelola produk/tarif/jadwal/persyaratan **OPD-nya**, verifikasi pesanan & pembayaran, konten OPD |
| Manajer / Ketua OPD | `INTERNAL` | seloko-web | + menyetujui/menerbitkan produk & tarif OPD-nya (bila diberi izin) |
| Petugas Lokasi | `INTERNAL` | seloko-web / mobile | Scan tiket QR, check-in, serah terima |
| Bapenda (admin/superadmin) | `INTERNAL` | seloko-web | Kategori, objek retribusi, persetujuan tarif, pengaturan SKRD, monitoring PAD semua OPD, akun OPD |
| Sistem | — | Worker | Hitung tarif, terbitkan SKRD, kedaluwarsa pesanan, notifikasi |

Satu pegawai dapat memegang role di **banyak aplikasi** (sudah didukung core) dan di **banyak OPD** (baru, §4.B), dengan role berbeda per OPD.

---

## 3. Kategori Layanan (dikelola Bapenda)
Seed awal 8 kategori. Bapenda dapat menambah/menonaktifkan; OPD hanya memilih kategori yang tersedia.

| # | Kategori | Contoh | Satuan tarif umum | Ketersediaan | Hasil akhir |
|---|---|---|---|---|---|
| 1 | Sewa Gedung / Ruangan | Aula, auditorium, ruang rapat | Sesi (Siang/Malam/Siang-Malam), jam, hari | Slot kalender | Tiket QR → scan & gunakan |
| 2 | Penginapan / Asrama / Rumah Dinas | Asrama, mess, kamar | Malam × kamar | Rentang tanggal | Booking → check-in |
| 3 | Sewa Tanah / Lahan | Lahan usaha, parkir | m² × bulan/tahun | Kontrak | Kontrak aktif |
| 4 | Rekreasi & Olahraga | Kolam renang, GOR, stadion | Orang / slot | Slot jam + kuota | Tiket QR → scan |
| 5 | Sewa Kios / Kantin / Usaha | Kios, kantin | Bulan / tahun | Kontrak | Kontrak → operasional |
| 6 | Sewa Alat & Laboratorium | Alat berat, alat lab | Unit × durasi | Stok + jadwal | Jadwal serah terima |
| 7 | Layanan Laboratorium / Kesehatan | Uji lab, kalibrasi | Per jenis pemeriksaan | Jadwal | Proses → hasil keluar |
| 8 | Penjualan Hasil Usaha Daerah | Bibit, ikan, ternak | Harga × qty (+ongkir) | Stok | Dokumen dipersamakan SKRD → barang diterima |

**Keputusan:** tidak ada 8 modul terpisah. Satu model **Produk** dengan atribut `pricingUnit`, `availabilityType`, `fulfillmentType`. Kategori menyimpan **nilai bawaan** atribut tersebut + ikon/urutan tampilan.

---

## 4. Keputusan Arsitektur

### A. Tenant: `lapak-jambi-web` dulu, gabung nanti
MVP memakai `lapak-jambi-web`. Akun `PUBLIC` sekarang terdaftar **per aplikasi**, sehingga web & mobile terpisah berarti warga daftar dua kali dan pesanan terbelah. **Disepakati digabung nanti** (`LJ-5.2`) bersama keputusan besar core: **strategi auth akun PUBLIC lintas aplikasi** (data user terpusat, tetapi tiap layanan publik punya pintu masuknya sendiri). Sampai itu, mobile tidak dikerjakan. Prefix menu `/lapak`.

### B. OPD masuk core: `organizations` + lingkup penugasan (non-breaking)
- **`organizations`** (core, lintas aplikasi): `code`, `name`, `type` (OPD/UPTD/BIRO/…), `parentId` (hierarki OPD → UPTD), kontak, logo, `isActive`. Dipakai Lapak sekarang; Bapenda (UPTD) & SIMPAD nanti.
- **`user_app_role_organizations`** (`userAppRoleId`, `organizationId`): lingkup sebuah penugasan role. **Tanpa baris = semua OPD** (level Bapenda). Contoh: penugasan *admin-opd* → [BPSDM, Badan Penghubung]; penugasan *manajer-opd* → [Disbudpar].
- Tabel `user_app_roles` & resolver izin lama **tidak diubah** → MVP seloko/bapenda aman. Ditambah resolver baru org-aware `resolveUserPermissionsInOrg(userId, appCode, organizationId)` + guard `requirePermission(code, { app, org })`, dan helper `allowedOrganizationIds(user, app, permission)` untuk filter list.
- Alasan bukan kolom `organizationId` di `user_app_roles`: unique `(user, app, role)` akan butuh `NULLS NOT DISTINCT` (PostgreSQL 15+), sedangkan dev memakai PostgreSQL 14.5.

### C. Persetujuan produk & tarif dinamis (lewat RBAC, bukan hardcode role)
Status produk memakai enum `ContentStatus` yang sudah ada: `DRAFT → PENDING_REVIEW → APPROVED/REJECTED → PUBLISHED`.
- Siapa menyetujui = pemegang `product:approve`; siapa menerbitkan = pemegang `product:publish`, **dalam lingkup OPD-nya**.
- Contoh konfigurasi (tanpa deploy): Bapenda memegang `approve` semua OPD; Ketua OPD memegang `publish` untuk OPD-nya. OPD lain bisa diberi keduanya → terbit mandiri.
- **Perubahan tarif pada produk terbit** tidak menurunkan produk: baris tarif punya status sendiri + `effectiveFrom`; publik melihat tarif `APPROVED` terbaru; pesanan menyimpan **snapshot harga**.

### D. SKRD terbit saat checkout (sebelum bayar), penerbit dapat diatur Bapenda
- SKRD = penetapan & dasar tagihan → terbit saat pemohon checkout, lalu dibayar.
- **Penerbit** dikonfigurasi Bapenda di seloko: per OPD (atau per kategori) memilih penerbit **Bapenda** atau **OPD itu sendiri**, beserta format nomor, penandatangan (nama/NIP/jabatan), rekening tujuan (RKUD), jatuh tempo. Baris default (`organizationId = null`) = Bapenda.
- Nomor SKRD gapless per penerbit per tahun via tabel sequence + row lock. Contoh format: `{seq:6}/SKRD/{issuer}/{romanMonth}/{year}`.
- Kategori 8 menerbitkan "Dokumen Transaksi (dipersamakan SKRD)" → `documentType` pada SKRD.
- Pembatalan/kedaluwarsa pesanan → SKRD `CANCELLED` (nomor tidak dipakai ulang).

### E. Pembayaran: transfer manual sekarang, siap gateway
`payments` sejak awal punya kolom gateway (`method`, `provider`, `vaNumber`, `qrisPayload`, `externalRef`, `expiresAt`, `rawCallback`). Fase awal: `MANUAL_TRANSFER` → warga unggah bukti → admin OPD konfirmasi. VA/QRIS (Bank Jambi) = adapter baru tanpa migrasi besar.

### F. Satu pesanan = satu OPD
SKRD diterbitkan per penerbit, jadi keranjang lintas OPD dipecah menjadi beberapa pesanan saat checkout.

### G. Konten OPD memakai modul bersama
Berita/artikel/galeri/banner OPD memakai tabel universal (`articles` type `NEWS`/`ARTICLE`, `galleries`, `banners`) milik app `lapak-jambi-web` + kolom baru **nullable** `organizationId` (non-breaking untuk Bapenda). Logika di `shared/article`, route di `src/modules/lapak/news/...`.

### H. Ketersediaan & anti double-booking di level DB
- Reservasi menyimpan rentang waktu (`tstzrange`). Unit tunggal (aula, kamar) dijaga **exclusion constraint** (`btree_gist`) — bentrok ditolak DB, bukan kode aplikasi.
- Produk berkuota (kolam renang per orang) dijaga hitung kuota dalam transaksi + advisory lock per (produk, slot).
- Hold sementara saat checkout (`expiresAt`) dibersihkan worker.

### I. Data & tabel
- Tabel domain berawalan `lapak_` (seperti `bapenda_uptds`); master lintas domain tanpa prefix (`organizations`, `retribution_objects`).
- Data pemohon (NIK/NPWP) = PII: disimpan sebagai snapshot di pesanan, dimasking di list & log (aturan `security-guidelines.md`).

---

## 5. Model Data (draf)

```text
core / master
  organizations ─┬─< user_app_role_organizations >── user_app_roles
                 └─ parent (self)
  retribution_objects        kode rekening/objek retribusi Perda, jenis (jasa umum/usaha/perizinan) — Bapenda

lapak (katalog)
  lapak_categories           name, slug, icon, sortOrder, isActive, default pricingUnit/availabilityType/fulfillmentType
  lapak_products             organizationId, categoryId, retributionObjectId, name, slug, description, address, lat/long,
                             capacity, area, pricingUnit, availabilityType, fulfillmentType, status(ContentStatus), publishedAt
    lapak_product_rates      name (Siang/Malam/Paket), unit, price, minQty/maxQty, startTime/endTime, status, effectiveFrom
    lapak_product_addons     name, unit, price, isActive
    lapak_product_requirements  label, fieldType(FILE|TEXT|NUMBER|DATE|SELECT), options, isRequired, sortOrder
    lapak_product_images     ImageKit two-step, isPrimary, sortOrder
    lapak_product_facilities name, icon
    lapak_operating_hours    weekday, open/close
    lapak_blackout_dates     tanggal tutup/maintenance

lapak (transaksi)
  lapak_orders               code, userId(PUBLIC), organizationId, status, subtotal, total, applicant(snapshot JSON), purpose, expiresAt
    lapak_order_items        productId, rateId, snapshot name/price/unit, qty, startAt, endAt, lineTotal
    lapak_order_addons
    lapak_order_documents    requirementId, value / file (ImageKit)
    lapak_order_status_logs  from, to, actorId, note
  lapak_reservations         productId, orderItemId, period tstzrange, qty, status (HOLD|CONFIRMED|RELEASED)  ← exclusion constraint
  lapak_skrd_settings        organizationId? (null = default), issuer (BAPENDA|OPD), numberFormat, signer, bankAccount, dueDays
  lapak_skrd_sequences       issuerKey, year, lastNumber
  lapak_skrds                orderId, number, documentType (SKRD|DIPERSAMAKAN), issuer snapshot, amount, issuedAt, dueAt, status, qrToken
  lapak_payments             orderId, method, provider, amount, status, proofFile, vaNumber, externalRef, paidAt, confirmedBy, expiresAt
  lapak_tickets              orderItemId, kind (TICKET|BOOKING|CONTRACT|HANDOVER|RESULT|SHIPMENT), code, qrToken, validFrom/Until, status, usedAt, checkedInBy

lapak (keterlibatan)
  lapak_reviews              orderItemId (unik), rating 1–5, comment, status moderasi
  lapak_wishlists            userId, productId
  articles / galleries / banners  (+ organizationId nullable) — app lapak-jambi-web
```

**Status pesanan (draf):**
```text
DRAFT → [MENUNGGU_VERIFIKASI bila produk butuh persetujuan OPD]
      → MENUNGGU_PEMBAYARAN (SKRD terbit, hold jadwal)
      → MENUNGGU_KONFIRMASI (bukti transfer diunggah)
      → LUNAS (tiket/kontrak terbit) → DIGUNAKAN/AKTIF → SELESAI
      ↘ DITOLAK | DIBATALKAN | KEDALUWARSA | REFUND
```

---

## 6. Permission & Role (draf, app `lapak-jambi-web`)

| Modul | Entity | Grup aksi | Lingkup OPD |
|---|---|---|---|
| Master | `category` | content | Bapenda saja |
| Master | `retribution-object` | content | Bapenda saja |
| Master | `skrd-setting` | content | Bapenda saja |
| Katalog | `product` | reviewable | ya |
| Transaksi | `order` | verifiable + export | ya |
| Transaksi | `payment` | verifiable | ya |
| Transaksi | `ticket` | read, list, update (check-in) | ya |
| Konten | `news`, `article` | reviewable | ya |
| Media | `gallery`, `banner` | content | ya |
| Keterlibatan | `review` | read, list, update (moderasi) | ya |
| Laporan | `report` | read, list, export | ya |

Role bawaan (data, bisa diubah lewat CMS): `superadmin`, `admin` (Bapenda), `admin-opd`, `manajer-opd`, `petugas-lokasi`, `kasir`, `bendahara`, `pimpinan`, `viewer`, `warga` (PUBLIC). Role `pedagang` & entity merchant/product/category/order lama di seed dihapus.

**Pembagian tugas operasional (sejak 2026-10-26):**

| Role | Wewenang inti | Menu sidebar yang tampil |
|---|---|---|
| `admin` | Seluruh OPD + wewenang master Bapenda | Dashboard, Management Retribusi, Katalog, Transaksi & Penerimaan, Konten OPD, Monitoring |
| `admin-opd` | Operasional OPD (produk, pesanan, pembayaran, tiket, konten) | Dashboard, Reservasi & Pemesanan, Transaksi & Penerimaan, Katalog, Konten OPD, Monitoring |
| `manajer-opd` | Menyetujui & menerbitkan produk/konten OPD | Katalog, Konten OPD, Monitoring |
| `petugas-lokasi` | Pindai tiket & catat pemakaian | Reservasi & Pemesanan, Transaksi & Penerimaan (Pesanan & Tiket) |
| `kasir` | Terima & verifikasi pembayaran retribusi | Transaksi & Penerimaan |
| `bendahara` | Tata usaha penerimaan & ekspor laporan | Transaksi & Penerimaan, Monitoring |
| `pimpinan` | Baca laporan & analitik saja | Monitoring |

Menu **Draft** (`isActive=false`) di sidebar Lapak: `Transaksi`, `Penerima Retribusi`, `Audit Log`,
`Konfigurasi` (Pengguna & Akses, Pengaturan Lapak), dan `Profile Saya` — halamannya belum dibangun
di `lapak-jambi-web`.

---

## 7. Endpoint (rencana, prefix `/api/lapak`)
- **Publik (tanpa login):** `GET /categories`, `GET /products` (filter kategori/OPD/lokasi/harga, cari, paginasi), `GET /products/:slug`, `GET /products/:slug/availability?from&to`, `GET /organizations/:code` (profil OPD + produknya), `GET /news`, `GET /galleries`, `GET /banners`.
- **Warga (PUBLIC):** `POST /orders/quote` (hitung biaya), `POST /orders` (checkout → SKRD), `GET /me/orders`, `GET /me/orders/:code`, `POST /orders/:code/payments` (bukti transfer), `GET /orders/:code/skrd`, `GET /orders/:code/tickets`, `POST /reviews`, wishlist.
- **CMS (INTERNAL, seloko-web):** CRUD master (Bapenda), CRUD produk + tarif/addon/persyaratan/media, `PATCH /products/:id/status`, verifikasi pesanan, konfirmasi pembayaran, check-in tiket, pengaturan SKRD, dashboard & laporan.
- **Core (prasyarat):** `POST /api/auth/register` + verifikasi email untuk akun PUBLIC (belum ada di core).

---

## 8. Data Seed Awal
Dari infografis proposal ("Sewa Gedung / Ruangan" + contoh tarif):
- **OPD:** BPSDM, Badan Penghubung, BPKPD, Disbudpar, Bapelkes, Dinas Koperasi, Dinsos, Dinas Kehutanan.
- **Produk + tarif contoh:** Aula I BPSDM Rp7.000.000/hari; Aula II BPSDM Siang Rp1.000.000 / Siang-Malam Rp1.500.000; Gedung BKOW Siang Rp4.000.000 / Malam Rp4.500.000 / Siang-Malam Rp5.000.000; Auditorium Taman Budaya Siang-Malam Rp9.500.000; Ruang Rapat Badan Penghubung (1–3 jam, 4–6 jam, >6 jam, per hari); dll.
- 8 kategori (§3). Akun uji: admin-opd multi-OPD, manajer-opd, petugas-lokasi, warga.

---

## 9. Roadmap Fase

| Fase | Isi | Status |
|---|---|---|
| **0. Fondasi core** | `organizations` + lingkup penugasan OPD, API OPD, seed RBAC/menu Lapak baru, registrasi akun PUBLIC (+NIK opsional) | 🟡 Dikerjakan |
| **1. Katalog** | Kategori, produk + tarif/addon/persyaratan/media/fasilitas, alur persetujuan, API katalog publik (SEO), seed proposal | ⏳ |
| **2. Transaksi** | Ketersediaan & reservasi, keranjang per OPD, checkout, SKRD, transfer manual + konfirmasi, tiket QR & check-in, worker kedaluwarsa | ⏳ |
| **3. Monitoring PAD** | Dashboard per OPD/kategori/periode, daftar transaksi & ekspor, transparansi PAD publik | ⏳ |
| **4. Pasca-MVP** | Konten per OPD, ulasan/rating, komentar berita, wishlist/notifikasi, target OPD | ⏳ |
| **5. Lanjutan** | VA/QRIS, gabung web+mobile & auth PUBLIC lintas app, mobile, objek retribusi lintas domain, OTP/NPWP | ⏳ |

MVP = Fase 0–3. Rincian tugas per ID ada di pipeline.

---

## 10. Keputusan

**Disepakati (2026-10-17):**
1. Nama publik **Lapak Jambi**.
2. Satu akun boleh banyak aplikasi (sudah ada) **dan banyak OPD**, role berbeda per OPD.
3. Tarif dikonfirmasi Bapenda, tetapi wewenang terbit dinamis (mis. Manajer/Ketua OPD) → lewat RBAC berlingkup OPD (§4.C).
4. SKRD terbit saat checkout sebelum bayar; penerbit (Bapenda/OPD) dapat diatur internal Bapenda lewat seloko (§4.D).
5. `lj-app` = frontend publik saja; CMS di seloko-web.
6. `kito-api` hanya referensi; implementasi di seloko-api.
7. Data infografis proposal dipakai sebagai seed awal.
8. Langsung 8 kategori; kategori dikelola Bapenda dan dapat bertambah/berkurang.
9. Data terpusat tanpa redundansi; tidak boleh merusak MVP seloko & bapenda-profile; arsitektur scalable.

**Disepakati (2026-10-17, lanjutan):**
10. Web & mobile digabung nanti bersama strategi auth PUBLIC lintas aplikasi (`LJ-5.2`); MVP = `lapak-jambi-web`.
11. `organizations` di core + tabel lingkup penugasan (§4.B) — dikerjakan sekarang (`LJ-0.1`…`0.5`).
12. Keranjang & pesanan **per OPD** (seperti marketplace: satu toko satu checkout) (§4.F).
13. Ulasan/rating & komentar berita = **pasca-MVP** (`LJ-4.2`, `LJ-4.3`); boleh disiapkan sebagai rencana/skema saja.
14. NIK akun warga **opsional tapi disediakan** (`users.nik`, unik bila diisi, PII dimasking). NPWP belum (`LJ-5.5`).
15. `retribution_objects` lintas domain diputuskan nanti (`LJ-5.4`); MVP tidak memakainya.
16. Fokus **MVP**: transaksi warga + transparansi arus penerimaan bagi Bapenda/OPD (seloko-web), dengan prototipe publik di `lj-app`.
17. Pekerjaan dipecah menjadi **pipeline tugas** per modul di `.agents/tasks/lapak-jambi.md`.
