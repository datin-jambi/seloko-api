# Pengaturan & Penerbitan SKRD — `/api/lapak/skrd`

- **Aplikasi:** `lapak-jambi-web` · **Prefix:** `/api/lapak/skrd` · **Jumlah endpoint:** 10
- **Sumber kode:** `src/modules/lapak/skrd/skrd.routes.ts`
- **Fase:** 2 (LJ-2.5)

## Ringkasan Endpoint

| Method | Path | Izin | Keterangan |
|---|---|---|---|
| `GET` | `/verify/:token` | **publik** | Verifikasi keaslian dokumen lewat QR |
| `GET` | `/settings` | `order:read` | Daftar pengaturan SKRD |
| `POST` | `/settings` | `order:update` | Simpan pengaturan (upsert) |
| `DELETE` | `/settings/:id` | `order:update` | Hapus pengaturan |
| `GET` | `/settings/preview/:organizationCode` | `order:read` | Pratinjau nomor berikutnya |
| `GET` | `/` | `order:read` | Daftar SKRD (lingkup OPD) |
| `POST` | `/order/:orderId` | `order:update` | Terbitkan SKRD untuk pesanan lama |
| `GET` | `/order/:orderId` | login | SKRD milik pesanan |
| `GET` | `/:id` | login | Detail SKRD |
| `POST` | `/:id/cancel` | `order:update` | Batalkan SKRD |

## Penomoran Gapless — Bagian Paling Sensitif

PRD 04 §D: nomor SKRD **gapless per penerbit per tahun**, via tabel sequence + row lock.

### Tiga aturan yang dijaga

1. **Berurutan tanpa lompat** per `(penerbit, tahun)`.
2. **Nomor tidak pernah dipakai ulang** — meski SKRD dibatalkan. `last_number` hanya naik.
3. **Tidak ada nomor kembar** meski checkout bersamaan.

### Cara mencapainya

```sql
-- Di DALAM transaksi penerbitan SKRD:
SELECT last_number FROM lapak_skrd_sequences
WHERE issuer_key = $1 AND year = $2
FOR UPDATE;   -- ← request kedua MENGANTRE di sini
```

Tanpa row lock, dua request bisa membaca `last_number` yang sama → nomor kembar.

**Konsumsi nomor terjadi dalam transaksi yang sama** dengan pembuatan SKRD. Bila pembuatan SKRD gagal, seluruh transaksi rollback sehingga nomor tidak terbuang — **lubang nomor adalah temuan audit**.

### Diuji nyata di smoke

| Uji | Hasil |
|---|---|
| Checkout berurutan | `000001`, `000002`, `000003` ✅ |
| **Dua checkout PARALEL** | `000004` & `000005`, tidak kembar ✅ |
| Batalkan `000001` lalu checkout | lanjut `000006` — **tidak** memakai ulang ✅ |

## Format Nomor

Template dengan token yang divalidasi **saat menyimpan pengaturan** — salah ketik tertangkap sebelum menerbitkan dokumen negara.

| Token | Hasil |
|---|---|
| `{seq}` | `1` |
| `{seq6}` | `000001` |
| `{issuer}` | `BAPENDA` atau kode OPD |
| `{orgCode}` | kode OPD |
| `{romanMonth}` | `I` … `XII` |
| `{month}` | `01` … `12` |
| `{year}` | `2026` |

**Default:** `{seq6}/SKRD/{issuer}/{romanMonth}/{year}` → `000001/SKRD/BAPENDA/X/2026`

**Validasi:**

| Aturan | Kode |
|---|---|
| Wajib memuat `{seq}` atau `{seq6}` | `400` — tanpa itu nomor tidak unik |
| Hanya token yang dikenal | `400` — mencegah `{seqq}` lolos dan menghasilkan kurung kurawal mentah |

## Field Request

### Pengaturan

| Field | Tipe | Keterangan |
|---|---|---|
| `token` | string 10–64 | *(param)* Token verifikasi publik pada `/verify/:token` |
| `id` | uuid | *(param)* ID pengaturan |
| `orderId` | uuid | *(param)* ID pesanan |
| `organizationCode` | string ≤50 \| null | Kosong = pengaturan **default** (Bapenda) |
| `status` | enum \| null | *(query)* Filter daftar SKRD: `TERBIT`, `LUNAS`, `CANCELLED` |
| `organization` | string ≤50 | *(query)* Kode OPD |
| `page` | int ≥1 | *(query)* Halaman daftar SKRD |
| `limit` | int 1–100 | *(query)* Per halaman |
| `issuer` | `BAPENDA` \| `OPD` | **Wajib** |
| `numberFormat` | string 5–200 | Template nomor |
| `signerName` | string 3–150 | **Wajib** — nama penandatangan |
| `signerNip` | string ≤30 \| null | NIP |
| `signerPosition` | string ≤150 \| null | Jabatan |
| `bankName` | string ≤100 \| null | Bank |
| `bankAccount` | string ≤50 \| null | Nomor rekening (RKUD) |
| `bankHolder` | string ≤150 \| null | Nama pemilik rekening |
| `dueDays` | int 1–365 | Jatuh tempo (default 7) |
| `isActive` | boolean | Default true |

### Penerbitan ulang

| Field | Tipe | Keterangan |
|---|---|---|
| `documentType` | `SKRD` \| `DIPERSAMAKAN` | Default `SKRD` |
| `issuedAt` | ISO \| null | Kosong = sekarang; berguna untuk migrasi data lama |

## 1. Verifikasi Publik

`GET /api/lapak/skrd/verify/:token` — **tanpa login**.

```json
{
  "statusCode": 200, "code": "SUCCESS", "message": "Dokumen terverifikasi",
  "data": {
    "number": "000001/SKRD/BAPENDA/X/2026",
    "documentType": "SKRD",
    "issuerCode": "BAPENDA",
    "issuerName": "Badan Pengelolaan Keuangan dan Pendapatan Daerah Provinsi Jambi",
    "amount": 500000,
    "issuedAt": "2026-10-22T09:00:00.000Z",
    "dueAt": "2026-10-29T09:00:00.000Z",
    "status": "TERBIT",
    "orderCode": "LJK-261022-K7M2P",
    "applicantName": "Bu********o",
    "valid": true
  }
}
```

**Sengaja TIDAK memuat PII.** Tujuan verifikasi hanya membuktikan dokumen asli, bukan menampilkan identitas pemohon. Nama pun dimasking.

Token bukan turunan nomor — 24 byte acak (`base64url`), sehingga tidak bisa ditebak dari nomor dokumen.

`valid: false` bila SKRD berstatus `CANCELLED`.

## 2. Pengaturan

`POST /api/lapak/skrd/settings`

```json
{
  "issuer": "BAPENDA",
  "numberFormat": "{seq6}/SKRD/{issuer}/{romanMonth}/{year}",
  "signerName": "H. Al Haris",
  "signerNip": "196505121990031010",
  "signerPosition": "Gubernur Jambi",
  "bankName": "Bank Jambi",
  "bankAccount": "001-02-000123-4",
  "bankHolder": "Kas Daerah Provinsi Jambi",
  "dueDays": 7
}
```

### Urutan kekhususan

```
Pengaturan OPD  →  Pengaturan default (Bapenda)  →  400
```

Bila keduanya tidak ada, **checkout ditolak `400`** dengan pesan jelas. Lebih baik gagal terang-terangan daripada menerbitkan dokumen negara tanpa penandatangan & rekening.

### Sequence terpisah per penerbit

Penerbit `BAPENDA` memakai satu sequence global. Penerbit `OPD` memakai sequence per kode OPD — jadi BPSDM dan DISBUDPAR masing-masing mulai dari `000001`.

## 3. Pratinjau Nomor

`GET /api/lapak/skrd/settings/preview/:organizationCode`

```json
{
  "data": {
    "issuer": "BAPENDA", "issuerKey": "BAPENDA", "year": 2026,
    "nextSeq": 1, "preview": "000001/SKRD/BAPENDA/X/2026"
  }
}
```

**Tidak memakai nomor** — aman dipanggil berkali-kali. Berguna untuk UI pengaturan Bapenda.

## 4. SKRD Terbit Saat Checkout

Sesuai PRD 04 §D, SKRD terbit **saat checkout**, bukan saat pembayaran. Respons `POST /api/lapak/orders/cart/:cartId/checkout` menyertakan ringkasan SKRD:

```json
{
  "skrd": {
    "id": "01a15280-...",
    "number": "000001/SKRD/BAPENDA/X/2026",
    "documentType": "SKRD",
    "issuer": "BAPENDA",
    "issuerCode": "BAPENDA",
    "issuerName": "Badan Pengelolaan Keuangan...",
    "amount": 500000,
    "issuedAt": "2026-10-22T09:00:00.000Z",
    "dueAt": "2026-10-29T09:00:00.000Z",
    "status": "TERBIT"
  }
}
```

## 5. Snapshot, Bukan Referensi Hidup

Saat terbit, seluruh isi SKRD **disalin**: penerbit, penandatangan, rekening, jumlah, jatuh tempo.

Mengubah pengaturan besok **tidak mengubah** dokumen yang sudah terbit. SKRD adalah dokumen hukum — ia harus tetap menunjukkan apa yang ditetapkan saat itu.

## 6. Pembatalan

`POST /api/lapak/skrd/:id/cancel`

Status menjadi `CANCELLED`. **Nomor tidak dikembalikan** — sequence tidak pernah turun. Nomor yang sudah dipakai tetap terpakai; pembatalan tidak menciptakan nomor yang bisa dipakai ulang.

## Jenis Dokumen

| `documentType` | Kapan |
|---|---|
| `SKRD` | Retribusi umum (sewa gedung, asrama, kendaraan, dll.) |
| `DIPERSAMAKAN` | Kategori 8 — penjualan hasil usaha daerah (bibit, ikan, ternak) |

Keduanya memakai penomoran & verifikasi yang sama.

## Belum termasuk

- **Pembayaran** transfer manual & konfirmasi (LJ-2.6)
- **PDF SKRD** & QR code tergambar (menyusul bersama tiket)
- **Denda/keterlambatan** otomatis
- **Notifikasi** jatuh tempo (worker)
