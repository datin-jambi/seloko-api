# Daftar Transaksi & Ekspor CSV — `/api/lapak/reports`

- **Aplikasi:** `lapak-jambi-web` · **Prefix:** `/api/lapak/reports` · **Jumlah endpoint:** 2
- **Sumber kode:** `src/modules/lapak/reports/reports.routes.ts`
- **Fase:** 3 (LJ-3.2)

## Ringkasan Endpoint

| Method | Path | Izin | Keterangan |
|---|---|---|---|
| `GET` | `/transactions` | `report:read` | Daftar transaksi lintas OPD + ringkasan |
| `GET` | `/transactions/export` | `report:export` | Unduh CSV |

**Ekspor dipisah izinnya** dari membaca: melihat satu halaman di layar berbeda
risikonya dengan mengunduh seluruh riwayat transaksi ke berkas yang bisa berpindah
tangan. Di seed, `admin-opd` dan `viewer` memegang `export`.

## Beda dengan `/api/lapak/orders`

| | `/lapak/orders` | `/lapak/reports/transactions` |
|---|---|---|
| Tujuan | Operasional (verifikasi, konfirmasi) | **Audit & pelaporan** |
| Kolom | Data pesanan | + nomor SKRD, status pembayaran, tiket |
| Ringkasan | — | Total nilai & komposisi per status |
| Ekspor | — | CSV |

## Field Request

| Field | Sumber | Tipe | Keterangan |
|---|---|---|---|
| `from` | query | `YYYY-MM-DD` | Awal rentang (opsional) |
| `to` | query | `YYYY-MM-DD` | Akhir rentang (opsional) |
| `organization` | query | string ≤50 | Kode OPD |
| `status` | query | enum 11 status | Filter status pesanan |
| `q` | query | string ≤100 | Cari **kode pesanan** |
| `sort` | query | `NEWEST`\|`OLDEST`\|`HIGHEST`\|`LOWEST` | Default `NEWEST` |
| `page` | query | int ≥1 | Halaman (khusus daftar) |
| `limit` | query | int 1–100 | Per halaman (khusus daftar) |

## 1. Daftar Transaksi

`GET /api/lapak/reports/transactions?from=2026-01-01&to=2026-10-31&organization=BPSDM`

```json
{
  "statusCode": 200, "code": "SUCCESS",
  "message": "Daftar transaksi berhasil diambil",
  "data": [
    {
      "orderId": "01a15280-...",
      "code": "LJK-261023-K7M2P",
      "createdAt": "2026-10-23T09:00:00.000Z",
      "organizationCode": "BPSDM",
      "organizationName": "Badan Pengembangan SDM Provinsi Jambi",
      "status": "LUNAS",
      "amount": 2000000,
      "skrdNumber": "000001/SKRD/BAPENDA/X/2026",
      "skrdStatus": "LUNAS",
      "paymentStatus": "LUNAS",
      "paidAt": "2026-10-23T10:00:00.000Z",
      "applicantName": "Bu********o",
      "purpose": "Rapat koordinasi",
      "itemCount": 1,
      "tickets": { "total": 1, "used": 0 }
    }
  ],
  "summary": {
    "totalAmount": 6000000,
    "totalOrders": 3,
    "byStatus": [
      { "status": "LUNAS", "count": 2, "amount": 6000000 },
      { "status": "MENUNGGU_PEMBAYARAN", "count": 1, "amount": 2000000 }
    ]
  },
  "meta": { "page": 1, "limit": 20, "totalItems": 3, "totalPages": 1,
            "hasNextPage": false, "hasPreviousPage": false }
}
```

### `summary` mencakup seluruh hasil filter

`summary.totalAmount` dan `byStatus` dihitung dari **semua baris yang cocok filter**,
bukan hanya halaman yang tampil. Tanpa ini, pengawas bisa salah menyimpulkan total
karena hanya melihat 20 baris pertama.

### Pencarian hanya pada kode pesanan

`q` sengaja **tidak** mencari di nama pemohon. Mencari berdasar identitas akan
membuka jalur baru untuk menemukan warga lintas OPD hanya dengan menebak nama —
persis yang dicegah oleh masking.

## 2. Ekspor CSV

`GET /api/lapak/reports/transactions/export?from=...&to=...`

**Respons bukan JSON** — berkas dikirim sebagai lampiran:

```
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="transaksi-lapak-2026-10-23.csv"
X-Total-Rows: 137
```

### Kolom CSV

| # | Kolom |
|---|---|
| 1 | Kode Pesanan |
| 2 | Tanggal |
| 3 | OPD |
| 4 | Nama OPD |
| 5 | Status Pesanan |
| 6 | Nominal (Rp) |
| 7 | Nomor SKRD |
| 8 | Status SKRD |
| 9 | Status Pembayaran |
| 10 | Dibayar Pada |
| 11 | Pemohon *(dimasking)* |
| 12 | Maksud |
| 13 | Jumlah Item |
| 14 | Tiket Terbit |
| 15 | Tiket Terpakai |

### Kenapa CSV, bukan XLSX

- **Bisa diverifikasi tanpa aplikasi khusus** — pemeriksa dapat membaca isinya
  dengan editor teks, membandingkan baris, dan menghitung ulang.
- **Tidak menambah dependensi** ke `package.json` (saat ini 23 dependensi).
- Excel/LibreOffice membuka CSV tanpa masalah.

XLSX bisa ditambahkan kelak bila Bapenda butuh multi-sheet; CSV tetap jadi format
dasar karena paling mudah diaudit.

## Dua Perlindungan Keamanan

### 1. CSV Injection diblokir

Sel yang diawali `=`, `+`, `-`, `@`, TAB, atau CR akan **dieksekusi Excel sebagai
formula**. Nama pemohon dan maksud pemakaian diisi warga — jalur nyata untuk
menanam `=HYPERLINK("http://jahat","klik saya")` yang berjalan di komputer pegawai
saat berkas dibuka.

Setiap sel berisiko diberi prefiks `'` sehingga Excel memperlakukannya sebagai teks:

```
'=HYPERLINK("http://jahat.example","klik saya")
```

Diuji nyata: pesanan dengan maksud berisi `=HYPERLINK(...)` diekspor sebagai teks,
bukan formula.

### 2. PII tetap dimasking di CSV

Nama pemohon termasking (`Bu********o`) di daftar **dan** di CSV. NIK tidak pernah
ikut diekspor.

Ekspor lintas OPD bukan alasan menyebar identitas warga ke seluruh Bapenda — itu
justru risiko kebocoran terbesar, karena berkas bisa disalin ke mana saja.

## Detail Teknis CSV

- **BOM UTF-8** di awal berkas: Excel di Windows tanpa BOM akan menampilkan nama
  OPD berkarakter non-ASCII sebagai mojibake.
- **Pemisah koma**, kutip ganda di-escape (`""`), baris dipisah `\r\n` (RFC 4180).
- **Header `Content-Disposition: attachment`** wajib; tanpa itu browser menampilkan
  isi CSV sebagai teks di tab, bukan mengunduhnya.

## Lingkup OPD

| Peran | Melihat |
|---|---|
| Bapenda / superadmin | Semua OPD |
| Admin OPD | Hanya OPD-nya |

Filter `organization` di luar lingkup → **`404`** (bukan `403`), agar keberadaan OPD
lain tidak terbocorkan. Lingkup dipaksa **di server**.

## Validasi

| Kondisi | Kode |
|---|---|
| `from` setelah `to` | `400` |
| Format tanggal bukan `YYYY-MM-DD` | `400` |
| Kode OPD tidak dikenal | `404` |
| Kode OPD di luar lingkup | `404` |
| Tanpa izin `report:read` / `report:export` | `403` |

## Zona Waktu

Batas tanggal memakai waktu **lokal server (WIB)**. Transaksi pukul 23:30 WIB tidak
dihitung sebagai hari berikutnya.

## Berikutnya

**LJ-3.3** — ringkasan transparansi PAD publik: agregat tanpa PII, tanpa login,
untuk masyarakat.
