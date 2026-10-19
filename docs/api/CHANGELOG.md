# Changelog Kontrak API

Catatan perubahan kontrak yang **terlihat oleh klien** (path, query, body, bentuk respons, guard).
Perubahan internal yang tidak mengubah kontrak tidak perlu dicatat di sini.

Format tanggal: `YYYY-MM-DD`. Urut terbaru di atas.

---

## 2026-10-24 — Berita OPD (LJ-4.1, bagian 1/4)

**Ditambah** — prefix `/api/lapak/news` (8 endpoint): 2 publik per kode OPD + 6 CMS.
- DB: kolom nullable `organization_id` pada `articles`, `banners`, `galleries` + index
  komposit; migrasi `20261024090000_add_organization_to_content`, drift 0. Baris Bapenda
  tetap `NULL` — non-breaking.
- `shared/article`: `ArticleScope.organizationId` opsional; filter OPD diterapkan di
  daftar/detail publik, daftar CMS, `findOwnedArticle` (get/update/status/delete), dan
  disimpan saat create. Pemanggil Bapenda tidak berubah; `article.check` tetap lolos.

**Diperbaiki (keamanan, lintas modul)**
- 8 controller Lapak (availability, dashboard, orders, payments, rates, reports, skrd,
  tickets) memanggil `accessibleOrganizationIds(userId, false)` — hardcoded, bukan
  `request.user.isSuperAdmin`. Diseragamkan.
- `?organization=` pada CMS berita sempat **dibuang diam-diam** oleh validasi Fastify
  karena tidak dideklarasikan di skema query — lingkup OPD terabaikan. Kini dideklarasikan
  (`ListNewsQuerySchema`, `OrgQuerySchema`) dan diuji: admin BPSDM memilih DISBUDPAR → `404`.

---

## 2026-10-23 — Transparansi PAD Publik (LJ-3.3) — **Fase 3 SELESAI**

**Ditambah** — prefix `/api/lapak/public-stats` (1 endpoint)
- `GET /` — **publik tanpa login**: agregat penerimaan per kategori & bulan.
- Tanpa migrasi (memakai tabel yang sudah ada).

**Keputusan kontrak**
- **Disajikan per KATEGORI, bukan per OPD** — mengikuti PRD 04 §1: *"data dikelola per
  OPD, tetapi disajikan ke publik per kategori agar mudah dicerna."* Alasan tambahan:
  perbandingan "OPD A menerima lebih dari OPD B" mudah menjadi polemik padahal jumlah
  aset dan tarif tiap OPD berbeda.
- **SUPPRESSION, bukan sekadar agregasi.** Kelompok dengan **< 3 pesanan** disembunyikan
  nominalnya (`realized: null`, `suppressed: true`). Dengan 1 pesanan senilai Rp5 jt,
  menampilkan "Kategori X: Rp5 jt" sama dengan membuka nilai transaksi satu orang.
  Jumlah pesanan tetap dilaporkan agar aktivitas tetap terlihat.
- **Hanya pesanan `LUNAS`.** Janji belum dibayar bukan penerimaan (diuji).
- **12 bulan penuh dikirim.** Bulan kosong bernilai `0` + `suppressed: false` — berbeda
  makna dari `null` + `suppressed: true` ("ada tapi disembunyikan"). Grafik berlubang
  membuat publik mengira data tidak tersedia.
- **Tidak pernah dikirim:** kode pesanan, nama pemohon, NIK, nominal transaksi tunggal,
  identitas OPD per transaksi (semua diuji terhadap string respons).
- **Publik = tanpa login, tetapi `X-App-Code` tetap wajib** (`400` tanpa header) — header
  menandai aplikasi yang dilayani untuk resolusi izin; diuji sebagai perilaku eksplisit.

**Fase 3 (Monitoring PAD) SELESAI 3/3.**

---

## 2026-10-23 — Daftar Transaksi & Ekspor CSV (LJ-3.2)

**Ditambah** — prefix `/api/lapak/reports` (2 endpoint)
- `GET /transactions` (`report:read`) — daftar transaksi lintas OPD + ringkasan
  total & komposisi per status.
- `GET /transactions/export` (`report:export`) — unduh CSV.
- Tanpa migrasi (memakai tabel yang sudah ada).

**Keputusan kontrak**
- **Ekspor dipisah izinnya** dari membaca (`report:export` ≠ `report:read`): melihat
  satu halaman di layar berbeda risikonya dengan mengunduh seluruh riwayat transaksi
  ke berkas yang bisa berpindah tangan.
- **Format CSV, bukan XLSX:** bisa diverifikasi pemeriksa tanpa aplikasi khusus,
  tidak menambah dependensi (tetap 23), dan dibuka Excel/LibreOffice.
- **CSV Injection diblokir:** sel yang diawali `=`, `+`, `-`, `@`, TAB, atau CR diberi
  prefiks `'` agar Excel memperlakukannya sebagai teks. Nama pemohon & maksud pemakaian
  diisi warga — jalur nyata menanam `=HYPERLINK(...)` yang berjalan di komputer pegawai.
  Diuji nyata.
- **PII tetap dimasking di CSV** — nama pemohon (`Bu********o`), NIK tidak diekspor.
  Ekspor lintas OPD bukan alasan menyebar identitas warga; berkas bisa disalin ke mana saja.
- **Pencarian hanya pada kode pesanan**, bukan nama pemohon — mencari berdasar identitas
  membuka jalur menemukan warga lintas OPD dengan menebak nama, persis yang dicegah masking.
- **`summary` mencakup seluruh hasil filter**, bukan hanya halaman yang tampil.
- **BOM UTF-8** di awal CSV (Excel Windows tanpa BOM menampilkan nama OPD sebagai mojibake)
  + `Content-Disposition: attachment` (tanpa itu browser menampilkan CSV di tab).

**Perbaikan alat smoke**
- Helper `request()` kini membaca respons **non-JSON sebagai teks** (sebelumnya hanya
  JSON, sehingga uji ekspor selalu menerima `data: null`).

---

## 2026-10-23 — Dashboard Penerimaan & Target PAD (LJ-3.1)

**Ditambah** — prefix `/api/lapak/dashboard` (4 endpoint)
- `GET /` — ringkasan **target vs realisasi** + `pending` + tren, dikelompokkan
  per OPD / kategori / bulan.
- `GET|POST /targets`, `DELETE /targets/:id` — target penerimaan per OPD per tahun.
- DB: `lapak_targets`, migrasi `20261023140000_add_lapak_targets`, drift 0.

**Dasar perancangan (riset)**
- Format mengikuti laporan resmi **SIKD/DJPK Kemenkeu**: `Akun | Anggaran/Pagu | Realisasi | %`.
- Konteks Provinsi Jambi 2024 (data SIKD): **Retribusi Daerah Rp14,31 M dari PAD
  Rp2.089,31 M (~0,68%) dengan capaian 83,72%** — terendah di antara komponen PAD
  (pajak 99,20%). Dashboard ini alat pengawasan pada komponen dengan capaian terlemah.
- Target per OPD per tahun mengikuti model `TargetOPD` backend Bapenda sebelumnya.

**Keputusan kontrak**
- **Realisasi HANYA dari pesanan `LUNAS`.** Pesanan menunggu bayar tidak dihitung —
  diuji nyata (pesanan Rp5 jt belum dibayar tidak menambah realisasi).
- **`pending` dipisah dari realisasi:** `awaitingPayment`, `awaitingConfirmation`,
  `expired`. `awaitingConfirmation` adalah angka paling kritis — uang bisa sudah masuk
  rekening tetapi belum diakui.
- **Target disimpan, capaian dihitung.** `TargetOPD.achieve` pada backend lama tidak
  diadopsi: capaian manual bisa menyimpang dari data pesanan tanpa terdeteksi.
- **`percentage` bernilai `null` (bukan 0)** saat target belum ditetapkan — 0%
  menyiratkan "tidak ada penerimaan", padahal artinya "belum ada pagu".
- **Zona waktu Asia/Jakarta** untuk batas hari/bulan dan pengelompokan bulan; memakai
  UTC akan menggeser transaksi malam (23:30 WIB) ke hari/bulan yang salah.
- Lingkup OPD dipaksa **di server**; OPD di luar lingkup → `404` (bukan `403`).

---

## 2026-10-23 — Worker Kedaluwarsa (LJ-2.8) — **Fase 2 SELESAI**

**Ditambah** — prefix `/api/lapak/expiry` (5 endpoint) + proses terjadwal
`src/workers/lapak-expiry.worker.ts`
- `GET /status` — ringkasan kedaluwarsa **tanpa mengubah data**.
- `POST /run` — jalankan worker; `force` untuk menghentikan run menggantung.
- `GET /runs`, `GET /runs/:id`, `DELETE /runs` (housekeeping).
- DB: `lapak_expiry_runs` + enum `ExpiryJobStatus`, migrasi
  `20261023090000_add_lapak_expiry_runs`, drift 0.

**Keputusan kontrak**
- **Hanya satu run berjalan**, ditegakkan **di database** lewat unique index parsial
  `uq_lapak_expiry_runs_running` (`WHERE status = 'RUNNING'`). Pengecekan di kode saja
  tidak cukup — dua proses/instance bisa lolos pengecekan bersamaan. Run kedua → `409`.
- **Setiap run tercatat** (`lapak_expiry_runs`): jumlah baris yang benar-benar diubah per
  jenis, pemicu, error, mulai/selesai, durasi. Worker mengubah status pesanan/SKRD/slot —
  perubahan yang tidak tercatat tidak bisa ditelusuri.
- **Idempoten lintas-run:** ketiga fungsi pembersih memakai `WHERE` berbasis waktu/status;
  run kedua mengubah 0 baris (diuji).
- **Run menggantung** (`RUNNING` > 10 menit) ditandai `TERPUTUS` otomatis di awal run
  baru, atau manual via `force: true`.
- **`/status` tidak mengubah apa pun** — `pending` hanya menghitung baris yang sudah lewat
  batas, sehingga operator tahu apakah perlu menjalankan worker.
- **Nomor SKRD tetap gapless:** pesanan kedaluwarsa → SKRD `CANCELLED`, nomor **tidak**
  dipakai ulang (diuji end-to-end).
- **Proses terpisah**, bukan `setInterval` di server: bila API di-scale, tiap instance akan
  menjalankan worker sendiri. SIGTERM/SIGINT menunggu run aktif selesai; log hanya dicetak
  bila ada yang berubah.

---

## 2026-10-22 — Tiket QR & Check-in (LJ-2.7)

**Ditambah** — prefix `/api/lapak/tickets` (5 endpoint)
- `GET /verify/:token` — **publik**, periksa tiket lewat QR **atau** kode pendek (tanpa PII).
- `GET /order/:orderId`, `GET /:id` (warga).
- `GET /` (`ticket:read`), `POST /:id/use` (`ticket:approve` — petugas lokasi).
- DB: `lapak_tickets` + enum `TicketKind`/`TicketStatus`, migrasi
  `20261022190000_add_lapak_tickets`, drift 0.

**Keputusan kontrak**
- **Tiket terbit SAAT LUNAS, bukan saat checkout.** Tiket = bukti hak pakai; hak itu baru
  sah setelah dibayar. Menerbitkan lebih awal berarti warga bisa masuk tanpa membayar.
  Diuji: sebelum LUNAS `tickets: []`, sesudahnya tiket `AKTIF`.
- **Sekali pakai, ditegakkan atomik:** `UPDATE ... WHERE status='AKTIF'`, bukan
  `SELECT`-lalu-`UPDATE`. Syarat di `WHERE` membuat database memutuskan pemenang. Diuji
  dua scan paralel → tepat 1×`200`, 1×`409`.
- **Jenis tiket mengikuti `fulfillmentType` produk** (`TICKET_QR`→`TICKET`,
  `BOOKING`→`BOOKING`, `CONTRACT`→`CONTRACT`, `RESULT`→`RESULT`,
  `DOCUMENT_SKRD`→`HANDOVER`, `SCHEDULE`→`SCHEDULE`).
- **Masa berlaku diperiksa saat verifikasi DAN saat `use`.** Status `AKTIF` saja tidak
  cukup — tiket kemarin tetap `AKTIF` sampai worker berjalan.
- **Verifikasi publik tanpa PII:** respons hanya memuat data produk + status + `usable` +
  `reason`; nama pemesan tidak dikirim.
- **Kode pendek `TKT-XXXXXX`** (alfabet tanpa `I/O/0/1`) untuk dibacakan manual bila QR
  rusak; token QR 24 byte acak terpisah sehingga menebak kode tidak memberi akses token.
- **Snapshot** `productName`/`rateName` di tiket — produk berganti nama tidak mengubah
  tiket yang sudah terbit.
- **Idempoten:** konfirmasi ulang tidak menggandakan tiket.

**Perbaikan alat (docs.check)**
- Checker sebelumnya **tidak mendeteksi field yang didahului komentar JSDoc** di dalam
  `z.object({...})` — karakter terakhir sebelum kunci terbaca `/` (dari `*/`), bukan `{`
  atau `,`. Kini komentar dinetralkan dengan menjaga offset, sehingga
  **23 field yang tadinya tak terhitung** ikut terverifikasi (516 → 539).

---

## 2026-10-22 — Pembayaran Transfer Manual (LJ-2.6)

**Ditambah** — prefix `/api/lapak/payments` (6 endpoint)
- `GET /order/:orderId`, `GET /:id`, `POST /:id/proof` (warga).
- `GET /` (`payment:read`), `POST /:id/verify` & `POST /:id/reject` (`payment:approve`).
- DB: `lapak_payments` + enum `PaymentMethod`/`PaymentStatus`, migrasi
  `20261022140000_add_lapak_payments`, drift 0.

**Keputusan kontrak**
- **Bukti transfer WAJIB dari ImageKit** (`POST /api/storage/upload?module=lapak&subFolder=payments`).
  URL eksternal ditolak: bukti bayar adalah lampiran resmi — harus tersimpan di storage
  yang kita kendalikan, bukan tautan yang bisa hilang atau berubah isinya. `proofFileId`
  wajib disertakan untuk audit & pembersihan berkas.
- **Baris pembayaran dibuat otomatis saat checkout** (`MENUNGGU_BUKTI`), batas waktunya
  mengikuti `dueAt` SKRD — satu tanggal yang dipakai warga & OPD.
- **Konfirmasi atomik:** pembayaran `LUNAS` + pesanan `LUNAS` + SKRD `LUNAS` + log status
  dalam satu transaksi. Setengah jadi = negara menganggap lunas tapi dokumennya belum.
- **Nominal diperiksa:** admin tidak boleh menandai lunas bila uang diterima kurang dari
  tagihan (`400`, pesan menyebut selisih). `amount` opsional untuk mencatat nominal riil.
- **Konfirmasi idempoten** — konfirmasi ulang tidak menggandakan efek.
- **Penolakan tidak menghapus riwayat:** pesanan kembali `MENUNGGU_PEMBAYARAN`, warga boleh
  unggah ulang, `rejectReason` dibersihkan saat unggahan baru. Satu pesanan boleh punya
  banyak baris pembayaran untuk audit.
- **Rekening tujuan diambil dari snapshot SKRD**, bukan pengaturan hidup.
- Kolom gateway (`provider`, `vaNumber`, `qrisPayload`, `externalRef`, `rawCallback`,
  `expiresAt`) sudah disiapkan → VA/QRIS Bank Jambi nanti = adapter baru tanpa migrasi.

---

## 2026-10-22 — Pengaturan & Penerbitan SKRD + Penomoran Gapless (LJ-2.5)

**Ditambah** — prefix `/api/lapak/skrd` (10 endpoint)
- `GET /verify/:token` — **publik**, verifikasi keaslian dokumen lewat QR (tanpa PII).
- `GET|POST /settings`, `DELETE /settings/:id`, `GET /settings/preview/:code`.
- `GET /`, `POST /order/:orderId`, `GET /order/:orderId`, `GET /:id`, `POST /:id/cancel`.
- DB: `lapak_skrd_settings`, `lapak_skrd_sequences`, `lapak_skrds` + enum
  `SkrdIssuer`/`SkrdDocumentType`/`SkrdStatus`, migrasi `20261022090000_add_lapak_skrd`,
  drift 0.

**Keputusan kontrak — PENOMORAN GAPLESS (PRD 04 §D)**
- Nomor berurutan tanpa lompat per `(penerbit, tahun)`; nomor yang sudah dipakai
  **tidak pernah dipakai ulang** meski SKRD dibatalkan (`last_number` hanya naik).
- Ditegakkan `SELECT ... FOR UPDATE` pada baris sequence **di dalam transaksi
  penerbitan SKRD**. Tanpa row lock, dua checkout paralel membaca `last_number` sama
  dan menghasilkan nomor kembar. Diuji nyata: dua checkout paralel → `000004` & `000005`.
- Konsumsi nomor terjadi dalam transaksi yang **sama** dengan pembuatan SKRD: gagal
  di tengah = rollback total, nomor tidak terbuang (lubang nomor = temuan audit).
- **SKRD terbit SAAT CHECKOUT**, bukan saat pembayaran. Checkout **ditolak `400`** bila
  pengaturan SKRD belum ada — lebih baik gagal terang-terangan daripada menerbitkan
  dokumen negara tanpa penandatangan & rekening.
- **Snapshot penuh:** penerbit, penandatangan, rekening, jumlah, jatuh tempo disalin
  saat terbit. Ubah pengaturan besok tidak mengubah dokumen kemarin.
- **Format nomor divalidasi saat menyimpan** (wajib `{seq}`/`{seq6}`, token harus
  dikenal) — salah ketik tertangkap sebelum menerbitkan dokumen, bukan sesudah.
- Sequence terpisah per penerbit: `BAPENDA` global, `OPD` per kode OPD (masing-masing
  mulai `000001`).
- **Verifikasi publik tanpa PII:** token QR 24 byte acak (bukan turunan nomor), respons
  hanya memuat data dokumen + nama pemohon termasking.
- Pembatalan **tidak mengembalikan nomor** ke sequence.

---

## 2026-10-21 — Quote & Checkout → Pesanan (LJ-2.4)

**Ditambah** — prefix `/api/lapak/orders` (5 endpoint)
- `GET /cart/:cartId/quote` — hitung harga **tanpa menyimpan apa pun**.
- `POST /cart/:cartId/checkout` — buat pesanan (atomik).
- `GET /mine`, `GET /:id` — pesanan warga.
- `GET /` (`order:read`) — daftar pesanan CMS, lingkup OPD.
- DB: `lapak_orders`, `lapak_order_items`, `lapak_order_status_logs` + enum
  `OrderStatus` (11 status), migrasi `20261021220000_add_lapak_orders`, drift 0.

**Keputusan kontrak — SNAPSHOT & PII**
- **Snapshot, bukan referensi hidup:** checkout menyalin nama produk, nama tarif, satuan,
  dan harga ke baris pesanan. Kenaikan tarif setelahnya **tidak mengubah** pesanan lama —
  pesanan adalah bukti transaksi pada harga saat itu. Diuji nyata di smoke.
- **PII tidak pernah keluar utuh:** `applicant` disimpan lengkap untuk SKRD, tetapi setiap
  respons memakai versi termasking (NIK `1234********3456`, telepon `0812****7890`) —
  termasuk di daftar CMS.
- **Atomik:** pesanan + baris + log + konfirmasi reservasi (HOLD → CONFIRMED) dalam satu
  transaksi. Bila satu reservasi gagal, seluruh checkout dibatalkan.
- **Kode pesanan `LJK-YYMMDD-XXXXX`** dengan 5 karakter acak (alfabet tanpa `I/O/0/1`).
  Bukan berurutan: kode dipakai warga melacak pesanan, jadi nomor urut mudah ditebak akan
  membocorkan volume transaksi.
- Harga **selalu dihitung ulang di server**; nilai dari klien tidak pernah dipercaya.
- Uang memakai **integer rupiah** (bukan desimal) untuk menghindari galat pembulatan.
- Keranjang dikosongkan setelah checkout — isinya sudah menjadi snapshot di pesanan.

---

## 2026-10-21 — Keranjang per OPD (LJ-2.3)

**Ditambah** — prefix `/api/lapak/carts` (8 endpoint, semua butuh login)
- `GET /` (semua keranjang user), `GET /opd/:code` (ambil/buat per OPD),
  `GET /:id`, `POST /:id/items`, `PUT /:id/items/:itemId`,
  `DELETE /:id/items/:itemId`, `POST /:id/clear`, `DELETE /:id`.
- DB: tabel `lapak_carts` + `lapak_cart_items`, migrasi
  `20261021180000_add_lapak_carts`, drift 0.

**Keputusan kontrak — SATU KERANJANG PER (user, OPD)**
- Ditegakkan **dua lapis**: unique index `uq_lapak_carts_user_org` (jaminan DB) dan
  pemeriksaan ramah di service yang membalas `409`.
- Menambah produk dari OPD lain ke keranjang yang sudah ada **DITOLAK**, bukan digabung:
  penggabungan akan membuat satu checkout berisi dua penerbit SKRD (mustahil diterbitkan,
  PRD 04 §4.F).
- **Harga TIDAK disimpan di keranjang.** `unitPrice`/`subtotal` hanya informasi dari tarif
  aktif saat ini; angka final dibekukan sebagai snapshot saat quote/checkout (LJ-2.4).
- Tidak ada endpoint yang menerima `userId` dari klien — keranjang selalu milik user yang
  login. Keranjang milik orang lain dibalas `404` (bukan `403`) agar tidak terbocorkan.
- Duplikat identik (produk + tarif + rentang waktu) menambah `qty`, bukan membuat baris baru.

---

## 2026-10-21 — Reservasi Slot & Anti Double-Booking (LJ-2.2)

**Ditambah** — prefix `/api/lapak/reservations` (4 endpoint)
- Publik: `GET /product/:productId/slots` (blok terpakai + sisa kuota),
  `POST /product/:productId` (pegang HOLD), `POST /:id/release`.
- CMS (`product:read`): `GET /product/:productId` (daftar reservasi).
- DB: tabel `lapak_reservations` + enum `ReservationStatus`, migrasi
  `20261021140000_add_lapak_reservations`, drift 0.

**Keputusan kontrak — ANTI DOUBLE-BOOKING DI DATABASE**
- `EXCLUDE USING gist (product_id WITH =, period WITH &&) WHERE (status <> 'RELEASED')`
  dengan `btree_gist`. Dua reservasi beririsan untuk produk sama **mustahil tersimpan**;
  PostgreSQL menolak (`23P01`) dan API menerjemahkannya menjadi `409`.
- Pengecekan "slot kosong?" sebelum INSERT **sengaja tidak dilakukan**: selalu ada jendela
  race antara `SELECT` dan `INSERT`. Constraint yang menutup jendela itu.
- Diuji nyata: dua `POST` paralel pada slot identik → tepat satu `201`, satu `409`.
- `period` bertipe `tstzrange` dengan batas atas **eksklusif** `[)`, sehingga booking
  `08:00–10:00` dan `10:00–12:00` tidak dianggap bentrok.
- `RELEASED` tetap tersimpan (riwayat utuh) tapi dikecualikan dari constraint lewat
  partial index — slot langsung bisa dipesan ulang.
- Pesan `409` sengaja generik agar tidak membocorkan detail pemesan lain.
- HOLD punya `expiresAt` (default 15 menit); `releaseExpiredHolds()` tersedia untuk worker.

---

## 2026-10-21 — Jam Operasional & Tanggal Tutup (LJ-2.1, Fase 2 dimulai)

**Ditambah** — prefix `/api/lapak/availability` (6 endpoint)
- Publik: `GET /product/:productId/availability?from&to` — ketersediaan harian, hanya
  produk PUBLISHED, maksimal rentang 92 hari.
- CMS (`product:read|update`): `GET|PUT /product/:productId/hours`,
  `GET|POST /product/:productId/blackouts`, `DELETE /product/:productId/blackouts/:id`.
- DB: tabel `lapak_operating_hours` (unik per produk+weekday) dan `lapak_blackout_dates`
  (rentang inklusif) — migrasi `20261021090000_add_lapak_availability`, drift 0.

**Keputusan kontrak**
- **Hari tanpa baris = tutup.** Tidak ada kolom `isOpen`, sehingga mustahil ada keadaan
  "baris ada tapi ditandai tutup".
- `PUT /hours` bersifat **replace-set** (bukan tambah-per-hari): jam buka adalah keputusan
  atas satu minggu; duplikat hari ditolak `400` sebelum menyentuh DB.
- `closeTime` < `openTime` sah = **lintas tengah malam** (mis. 20:00–02:00).
- **Blackout menang** atas jam operasional — maintenance membatalkan jadwal.
- Cek ketersediaan mengembalikan **satu baris per tanggal** (termasuk yang tutup) agar
  frontend bisa merender kalender penuh tanpa menebak hari yang hilang.
- Hapus tanggal tutup = **hard delete** (jadwal bukan data transaksi).

---

## 2026-10-21 — Seed Produk & Tarif dari Perda (LJ-1.7)

**Ditambah** — data seed, bukan kontrak API
- `prisma/seeds/lapak/products.json` + `products.seeder.ts`: **7 produk / 18 tarif**
  bersumber dari **Perda Provinsi Jambi No. 5 Tahun 2024 tentang Pajak Daerah dan
  Retribusi Daerah**, Lampiran II (Struktur dan Besarnya Tarif Retribusi Jasa Usaha),
  tabel "Penyediaan Tempat Peninggalan" & "Sewa".
- Sumber resmi: `https://jdih.jambiprov.go.id/index.php?page=detilperaturan&id=1116`
- Cakupan: asrama/Mess Pemda Jekan, asrama BPSDM, asrama & aula BAPELKES, sewa ruangan
  RS Jiwa Daerah.

**Keputusan**
- Produk seed lahir `status: DRAFT` — data hasil riset **wajib ditinjau Bapenda**
  sebelum terbit. Tarifnya `APPROVED` karena berasal dari Perda, bukan usulan OPD.
- Seeder **idempoten** (kunci: slug): run kedua `0 dibuat, 7 diperbarui`, tarif diganti
  utuh sehingga tidak menumpuk.
- Entri dengan OPD belum ada di seed organisasi dilewati (`opd: null`) — barisnya
  dipertahankan di JSON agar hasil riset tidak hilang.

---

## 2026-10-21 — Katalog Publik OPD (LJ-1.6)

**Ditambah** — prefix `/api/lapak` (2 endpoint publik, PRD 04 §176)
- `GET /api/lapak/organizations/:code` — profil OPD + `productCount` (produk terbit).
- `GET /api/lapak/organizations/:code/products` — katalog produk OPD dengan filter
  kategori/cari/harga-urut + paginasi.

**Keputusan kontrak**
- Endpoint hidup di modul lapak, bukan `core/organizations`, karena responsnya menggabungkan
  data OPD dengan katalog — menaruhnya di core memaksa core mengimpor lapak (coupling terbalik).
- Kode OPD tak dikenal → **`404`**, bukan katalog kosong: katalog kosong akan menyamarkan
  salah ketik URL di halaman SEO publik.
- `productCount` hanya menghitung produk `PUBLISHED` milik aplikasi lapak — bukan seluruh
  produk OPD di semua aplikasi.
- Field internal OPD (`id`, `isActive`, `parentId`) tidak pernah dikirim ke publik.
- Filter `organization` dipaksa ke `:code`; klien tidak bisa melebarkan lingkup via query.

---

## 2026-10-21 — Media & Fasilitas Produk (LJ-1.5)

**Berubah — PERILAKU KONTRAK**
- `images[].isPrimary` kini **dinormalisasi server** menjadi tepat satu per produk: bila
  klien mengirim beberapa `true`, hanya yang `sortOrder` terkecil dipertahankan; bila tak
  ada yang bertanda, gambar pertama otomatis diangkat. Sebelumnya semua `true` tersimpan
  apa adanya sehingga "gambar utama" ambigu di katalog publik.
- `coverUrl`/`coverFileId` **diisi otomatis** dari gambar primer bila tidak dikirim eksplisit.

**Catatan** — tabel `lapak_product_images` & `lapak_product_facilities` sudah ada sejak
LJ-1.2; unggah berkas memakai modul core `POST /api/storage/upload` (folder per aplikasi),
bukan endpoint khusus lapak. LJ-1.5 menutup celah integritas `isPrimary` dan konsistensi
`coverUrl`.

---

## 2026-10-21 — Persyaratan/Dokumen Produk (LJ-1.4)

**Berubah — VALIDASI KONTRAK**
- `requirements[].options` kini **wajib** bila `fieldType: "SELECT"` (tanpa opsi, form publik
  tak bisa dirender) dan **dilarang** pada tipe lain (`400 VALIDATION_ERROR`). Sebelumnya
  kombinasi keduanya diterima dan menyimpan data mati.

**Catatan** — model `lapak_product_requirements` dan nested CRUD sudah ada sejak LJ-1.2;
LJ-1.4 menutup celah validasi tersebut dan memperluas cakupan smoke ke kelima tipe
(`FILE`/`TEXT`/`NUMBER`/`DATE`/`SELECT`) termasuk penjagaan `sortOrder`.

---

## 2026-10-21 — Persetujuan Tarif Terpisah Lapak (LJ-1.3)

**Ditambah** — prefix `/api/lapak/rates` (8 endpoint)
- `GET /` (filter `productId`, `status`, paginasi), `GET /:id` — lingkup OPD otomatis.
- `POST /product/:productId` — tarif baru tanpa mengubah status produk.
- `PUT /:id` — hanya untuk tarif belum disetujui (`409` bila APPROVED/PUBLISHED).
- `POST /:id/revise` — membuat baris baru `PENDING_REVIEW`; baris lama tetap aktif.
- `PATCH /:id/status/:action` — `submit` | `approve` | `reject` (`reject` wajib `note`).
- `PATCH /:id/deactivate` (`409` bila tarif aktif terakhir), `DELETE /:id` (soft-delete).

**Berubah — PERILAKU KONTRAK**
- **Tarif publik kini STRICT:** `GET /lapak/products/public` dan `/public/:slug` hanya
  menyajikan tarif `APPROVED`/`PUBLISHED`. Sebelumnya `DRAFT` ikut tampil. Produk terbit
  tanpa tarif terapprove menyajikan `rates: []` dan `startingPrice: 0`.
- **Filter waktu dinamis:** batas `effectiveFrom` dievaluasi per-request. Sebelumnya berupa
  konstanta modul yang membeku saat server start sehingga tarif baru tak pernah muncul
  sampai restart.

**Keputusan kontrak**
- Tarif adalah entitas ber-status sendiri: revisi harga tidak menurunkan status produk.
- `admin-opd` memegang `product:approve` untuk OPD-nya sendiri; batasnya adalah **lingkup OPD**,
  bukan kepemilikan izin.
- Selama revisi berjalan, publik tetap melihat harga lama; baris lama dinonaktifkan otomatis
  saat revisi **disetujui**, sehingga tidak ada jeda produk tanpa harga.

---

## 2026-10-20 — Modul Produk Katalog Lapak (LJ-1.2)

**Ditambah** — prefix `/api/lapak/products` (8 endpoint)
- Publik: `GET /public` (filter kategori/OPD/harga + paginasi), `GET /public/:slug`.
- CMS (`product:*`): list (tersaring lingkup OPD otomatis), detail, create + anak-anak,
  update (replace-set anak), `PATCH /:id/status/:action`, soft-delete.
- DB: 6 tabel — `lapak_products`, `lapak_product_rates`, `lapak_product_addons`,
  `lapak_product_requirements`, `lapak_product_images`, `lapak_product_facilities`
  (migrasi `20261020090000_add_lapak_products`).

**Keputusan kontrak**
- Tiga atribut produk (`pricingUnit/availabilityType/fulfillmentType`) **diwarisi nilai bawaan
  kategori** bila tidak dikirim; `null` eksplisit diperlakukan sama dengan tidak dikirim.
- Produk hanya boleh diedit pada `DRAFT`/`REJECTED`; hapus ditolak `409` saat masih `PUBLISHED`.
- `DELETE /lapak/categories/:id` kini ditolak `409` bila masih ada produk aktif yang memakainya.
- Tarif publik sementara menyertakan status `DRAFT` — pengetatan `APPROVED` dilakukan di LJ-2
  bersama alur persetujuan tarif terpisah (PRD 04 §C).

---

## 2026-10-19 — Modul Kategori Layanan Lapak (LJ-1.1, Fase 1 dimulai)

**Ditambah** — aplikasi `lapak-jambi-web`, prefix `/api/lapak/categories` (9 endpoint)
- Publik: `GET /public`, `GET /public/:slug`.
- CMS (`category:*`, hanya Bapenda): list, detail, create, `PATCH /reorder`, update,
  `PATCH /:id/active`, soft-delete.
- DB: tabel `lapak_categories` + 3 kolom nilai bawaan produk
  (`default_pricing_unit`, `default_availability_type`, `default_fulfillment_type`) — migrasi
  `20261019090000_add_lapak_categories` dan `20261019093000_add_lapak_category_defaults`.
- Seed: 8 kategori sesuai PRD 04 §3.

**Keputusan kontrak**
- `slug` unik per aplikasi; bentrok **ditolak** (bukan akhiran `-2`) — URL publik tidak berubah
  diam-diam. Slug milik kategori terhapus boleh dihidupkan kembali lewat create.
- Objek publik hanya 5 field (`id`, `name`, `slug`, `description`, `icon`).
- `default*` nullable: `null` = OPD memilih sendiri saat membuat produk (LJ-1.2).

---

## 2026-10-18 — Registrasi akun warga + kolom NIK

**Ditambah**
- `POST /api/auth/register` — pendaftaran mandiri akun `PUBLIC`. Hanya di aplikasi ber-audience
  `PUBLIC`; role ditetapkan server (default `warga`), bukan dari body. Body:
  `email`, `password`, `passwordConfirm`, `fullName`, `phoneNumber?`, `nik?`.
- Kolom `users.nik` (`VARCHAR(16)`, **unique**, nullable) lewat migrasi aditif
  `20261018100000_add_user_nik`.

**Diubah — aditif**
- `GET /api/users`, `GET /api/users/:id`, `POST/PATCH` — objek user kini membawa `nik`, selalu
  **termasking** (`••••••••••••1234`). Nilai penuh tidak pernah keluar lewat API.
- `PATCH /api/users/:id` menerima `nik` (16 digit atau `null` untuk mengosongkan).

**Dampak ke klien**
- `nik` **wajib ada** di response schema (`string | null`) — klien yang memvalidasi ketat perlu
  menambahkannya. Nilainya termasking, jadi tidak bisa dipakai sebagai kunci pencarian.
- `emailVerifiedAt` pada akun hasil registrasi bernilai `null`: verifikasi email/OTP belum
  dikerjakan (backlog `LJ-5.5`). Frontend sebaiknya tidak memblokir transaksi karenanya.

---

## 2026-10-18 — RBAC Lapak Jambi (aset daerah, bukan UMKM)

**Diubah — breaking untuk seed RBAC Lapak**
- Aplikasi `lapak-jambi-web`: permission `merchant:*`, `product:*` lama, `order:*` lama diganti
  13 entity baru sesuai PRD 04 §6 (73 permission).
- Role `pedagang` dihapus; diganti `warga` (PUBLIC) + `admin-opd`, `manajer-opd`,
  `petugas-lokasi` (INTERNAL).
- Menu CMS `lapak-jambi-web` disusun ulang: 20 item berawalan `/lapak` (Katalog, Transaksi,
  Master, Konten OPD, Laporan).

**Dampak ke klien**
- Frontend Lapak harus memakai nama role & permission baru. Token lama yang memegang role
  `pedagang` tidak valid lagi setelah seed ulang.

---

## 2026-10-18 — `GET /users/:id/roles` + lingkup OPD pada penugasan role

**Ditambah**
- `GET /api/users/:id/roles` — daftar penugasan role dengan paginasi (`page`, `limit`),
  filter (`applicationId`, `roleId`, `organizationId`, `status`), `sortBy`
  (`createdAt`/`expiresAt`/`application`), dan `summary` lintas halaman
  (`totalAssignments`, `activeAssignments`, `expiredAssignments`, `totalApplications`,
  `totalOrganizations`, `globalAssignments`).
- Permission baru: `user-app-role:list`.

**Diubah — aditif**
- `POST /api/users/:id/roles` menerima `organizationIds?: string[]` (maks 50, tanpa duplikat).
  Kosong = seluruh OPD. Daftar baru **mengganti** lingkup sebelumnya.
- `POST /api/users/:id/roles` — `expiresAt` kini menerima `null` secara eksplisit.
- `GET /api/users/:id` dan `GET /api/users/:id/roles` — setiap role kini membawa
  `organizations[]` (`id`, `code`, `name`, `shortName`). Array kosong = berlaku seluruh OPD.

**Error baru**
- `400` bila `organizationIds` memuat OPD yang tidak ada.

**Dampak ke klien**
- Response schema bersifat ketat: `organizations` **wajib ada** pada setiap item role. Klien yang
  memvalidasi respons dengan schema lama tetap kompatibel selama ia mengabaikan field baru.
- Frontend CMS disarankan menampilkan badge "Semua OPD" ketika `organizations` kosong, agar tidak
  terbaca sebagai "tidak punya akses".

---

## 2026-10-18 — Modul Organizations (baru)

**Ditambah** — 8 endpoint `/api/organizations`:
`GET /public`, `GET /public/:code` (publik), `GET /`, `GET /:id`, `POST /`, `PUT /:id`,
`PATCH /:id/active`, `DELETE /:id` (CMS, permission `organization:*`).
Permission baru di aplikasi `seloko`: `organization:create|read|update|delete|list`.
Menu baru: `sistem.organisasi` → `/seloko/sistem/organisasi`.

**Dampak ke klien**
- Tidak ada endpoint lama yang berubah. Tabel `organizations` & `user_app_role_organizations`
  ditambahkan lewat migrasi aditif `20261017120000_add_organizations`.

---

## 2026-10-17 — Modul Halaman Profil (belum tercatat sebelumnya)

**Ditambah** — 8 endpoint `/api/bapenda/pages` (2 publik, 6 CMS). Permission `page:*`
(grup `publishable`), menu `konten.halaman` → `/bapenda/halaman`.

---

## 2026-10-17 — Path menu CMS berawalan aplikasi

**Diubah — breaking untuk navigasi**
- `menus.path` internal kini berawalan kode aplikasi: `/seloko/...`, `/bapenda/...`, `/lapak/...`
  (prefix `/cms/` dibuang). Contoh: `/cms/berita` → `/bapenda/berita`.
- `dasbor` → `dashboard` (segmen path, bukan kode menu).
- Tautan eksternal (`isExternal`) dan aplikasi warga (`lapak-jambi-app`) tidak berubah.

**Dampak ke klien**
- Route frontend harus disesuaikan; `baseUrl` aplikasi tetap digabung dengan `path` seperti biasa.

---

## 2026-10-17 — Halaman profil & sanitasi HTML

**Diubah — perilaku**
- Sanitasi HTML dipindah ke `src/common/utils/html.ts` dan diperluas: `colspan`/`rowspan` serta
  `style` (`color`, `background-color`, `text-align`, `width`, `min-width`) kini dipertahankan
  dengan nilai berpola. Sebelumnya atribut-atribut itu dibuang, sehingga tabel halaman Pejabat
  rusak (1305 → 689 karakter).
- Berlaku untuk `news.content` dan `pages.content`.

---

## 2026-10-12 — `type` pada artikel (berita vs artikel)

**Ditambah**
- Enum PostgreSQL `ArticleType` (`NEWS`, `ARTICLE`) + kolom `type` pada `articles` dan
  `article_categories`.
- Unique slug menjadi per `(applicationId, type, slug)`; index
  `(applicationId, type, status, publishedAt)`.
- `excerpt` diperlebar dari 500 → 1000 karakter.

**Dampak ke klien**
- Respons artikel kini memuat `type`. Kategori hanya berlaku dalam `type` yang sama.

---

## Cara menambah entri

1. Tambahkan bagian baru di atas dengan tanggal hari ini.
2. Tulis **Ditambah / Diubah / Dihapus / Error baru / Dampak ke klien** — pilih yang relevan.
3. Sebut path dan nama field secara eksplisit; hindari "beberapa endpoint".
4. Tandai **breaking** bila klien lama akan gagal.
5. Perbarui juga berkas modulnya di `docs/api/<app>/<modul>.md`.
