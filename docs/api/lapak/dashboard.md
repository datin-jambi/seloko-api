# Dashboard Penerimaan & Target — `/api/lapak/dashboard`

- **Aplikasi:** `lapak-jambi-web` · **Prefix:** `/api/lapak/dashboard` · **Jumlah endpoint:** 4
- **Sumber kode:** `src/modules/lapak/dashboard/dashboard.routes.ts`
- **Fase:** 3 (LJ-3.1)

## Dasar perancangan (hasil riset)

### 1. Format mengikuti laporan resmi SIKD/DJPK Kemenkeu

Portal SIKD (`djpk.kemenkeu.go.id`) menyajikan APBD dengan **empat kolom**:

| Akun | Anggaran/Pagu | Realisasi | % |
|---|---|---|---|

Struktur itu dipakai apa adanya — Bapenda tidak perlu belajar format baru saat
menyandingkan angka Lapak dengan laporan PAD resmi.

### 2. Konteks nyata Provinsi Jambi 2024 (data SIKD)

| Akun | Anggaran | Realisasi | % |
|---|---|---|---|
| Pendapatan Daerah | 4.665,05 M | 4.725,73 M | 101,30 |
| PAD | 2.210,63 M | 2.089,31 M | 94,51 |
| Pajak Daerah | 1.854,03 M | 1.839,11 M | 99,20 |
| **Retribusi Daerah** | **17,10 M** | **14,31 M** | **83,72** |
| Hasil Kekayaan Dipisahkan | 48,26 M | 35,48 M | 73,51 |
| Lain-Lain PAD Sah | 291,24 M | 200,41 M | 68,81 |

**Dua kesimpulan yang membentuk desain ini:**

1. **Retribusi hanya 0,68% dari PAD** (14,31 M dari 2.089,31 M) — Lapak Jambi
   menyasar ceruk kecil. Dashboard tidak boleh membuatnya terlihat lebih besar
   dari kenyataan; angka harus konsisten dengan laporan resmi.
2. **Capaian retribusi 83,72%, terendah di antara komponen PAD** (pajak 99,20%).
   Artinya pekerjaan rumah Bapenda ada persis di sini — dashboard ini alat
   pengawasan, bukan pajangan.

### 3. Target vs capaian: mengikuti `TargetOPD` backend lama

Backend Bapenda sebelumnya (`kito-api`) memakai:

```prisma
model TargetOPD {
  opd_id  Int
  tahun   Int
  total   Decimal   // target
  achieve Decimal   // capaian (DISIMPAN)
  @@unique([opd_id, tahun])
}
```

Saya pertahankan **target per OPD per tahun**, tetapi **`achieve` tidak disimpan**.
Realisasi selalu dihitung dari transaksi `LUNAS`. Alasannya: capaian yang disimpan
manual bisa menyimpang dari data pesanan, dan penyimpangan itu tidak akan pernah
terdeteksi. Target boleh ditetapkan manusia; capaian harus dihitung mesin.

## Ringkasan Endpoint

| Method | Path | Izin | Keterangan |
|---|---|---|---|
| `GET` | `/` | `report:read` | Ringkasan target vs realisasi + pending + tren |
| `GET` | `/targets` | `report:read` | Daftar target |
| `POST` | `/targets` | `report:update` | Simpan target (upsert) |
| `DELETE` | `/targets/:id` | `report:update` | Hapus target |

## Field Request

| Field | Sumber | Tipe | Keterangan |
|---|---|---|---|
| `period` | query | `TODAY`\|`THIS_MONTH`\|`THIS_YEAR`\|`LAST_MONTH`\|`LAST_YEAR`\|`CUSTOM` | Default `THIS_YEAR` |
| `from` | query | `YYYY-MM-DD` | **Wajib** bila `period=CUSTOM` |
| `to` | query | `YYYY-MM-DD` | **Wajib** bila `period=CUSTOM` |
| `organization` | query | string ≤50 | Kode OPD |
| `groupBy` | query | `ORG`\|`CATEGORY`\|`MONTH` | Default `ORG` |
| `year` | query | int 2020–2100 | Filter daftar target |
| `organizationCode` | body | string ≤50 \| null | Kosong = target default aplikasi |
| `amount` | body | int ≥0 | Target tahunan (rupiah) |
| `note` | body | string ≤255 | Catatan target |
| `id` | param | uuid | ID target |

## 1. Ringkasan Penerimaan

`GET /api/lapak/dashboard?period=THIS_YEAR&groupBy=ORG`

```json
{
  "statusCode": 200, "code": "SUCCESS",
  "message": "Ringkasan penerimaan berhasil diambil",
  "data": {
    "period": {
      "from": "2026-01-01T00:00:00.000Z",
      "to": "2026-12-31T23:59:59.999Z",
      "label": "Tahun 2026"
    },
    "groupBy": "ORG",
    "rows": [
      {
        "key": "BPSDM",
        "label": "Badan Pengembangan SDM Provinsi Jambi",
        "target": 60000000,
        "realized": 5000000,
        "percentage": 8.33,
        "orderCount": 1
      },
      {
        "key": "DISBUDPAR",
        "label": "Dinas Kebudayaan dan Pariwisata",
        "target": null,
        "realized": 3000000,
        "percentage": null,
        "orderCount": 1
      }
    ],
    "summary": { "target": 60000000, "realized": 8000000, "percentage": 13.33, "orderCount": 2 },
    "pending": {
      "awaitingPayment": 5000000,
      "awaitingConfirmation": 0,
      "expired": 0,
      "count": { "awaitingPayment": 1, "awaitingConfirmation": 0, "expired": 0 }
    },
    "trend": [ { "date": "2026-10-23", "realized": 8000000 } ]
  }
}
```

### Hanya `LUNAS` yang dihitung sebagai realisasi

Pesanan `MENUNGGU_PEMBAYARAN` **tidak** masuk `realized` — diuji nyata: pesanan
Rp5.000.000 yang belum dibayar tidak menambah realisasi OPD-nya.

### `pending` — selisih yang harus diawasi

| Field | Arti | Mengapa penting |
|---|---|---|
| `awaitingPayment` | Nilai pesanan menunggu bayar | Tagihan yang belum jadi uang |
| `awaitingConfirmation` | Bukti transfer menunggu konfirmasi | **Uang mungkin sudah masuk rekening tetapi belum diakui** |
| `expired` | Nilai pesanan kedaluwarsa | Potensi penerimaan yang hangus |

`awaitingConfirmation` adalah angka yang paling perlu dilihat pengawas: di sinilah
uang bisa "hilang" dari laporan karena kelalaian konfirmasi, bukan karena tidak dibayar.

### `percentage` null, bukan 0

Bila target belum ditetapkan, `percentage` bernilai `null` — **bukan 0%**.
0% menyiratkan "tidak ada penerimaan", padahal artinya "belum ada pagu untuk
dibandingkan". Frontend harus membedakan keduanya.

## 2. Dimensi Pengelompokan

| `groupBy` | Baris berisi | Target? |
|---|---|---|
| `ORG` | Per OPD | ✅ dari `lapak_targets` |
| `CATEGORY` | Per kategori produk | ❌ pagu hanya per OPD |
| `MONTH` | Per bulan (`YYYY-MM`) | ❌ target tahunan |

`groupBy=MONTH` memakai zona waktu **Asia/Jakarta** (`AT TIME ZONE 'Asia/Jakarta'`)
agar transaksi pukul 23:30 WIB tidak jatuh ke tanggal/bulan berikutnya.

## 3. Target

`POST /api/lapak/dashboard/targets`

```json
{ "year": 2026, "organizationCode": "BPSDM", "amount": 60000000, "note": "Target retribusi BPSDM" }
```

Kosongkan `organizationCode` untuk **target default** aplikasi.

Upsert per `(OPD, tahun)` — menyimpan ulang tahun dan OPD yang sama akan
memperbarui baris yang ada, bukan menambah baris baru (diuji).

### Pagu mana yang dipakai di ringkasan?

- `groupBy=ORG` + filter OPD → target OPD tersebut
- Tanpa filter → **jumlah target semua OPD dalam lingkup**
- Target default tidak dijumlahkan dengan target OPD (target OPD lebih spesifik)

## 4. Lingkup OPD

| Peran | Melihat |
|---|---|
| Bapenda / superadmin | Semua OPD |
| Admin OPD | Hanya OPD-nya |

Permintaan OPD di luar lingkup → **`404`**, bukan `403`, agar keberadaan data OPD
lain tidak terbocorkan. Lingkup dipaksa **di server**; klien tidak bisa
melebarkannya lewat parameter.

## Zona Waktu

Batas hari/bulan memakai waktu **lokal server (WIB)**, bukan UTC. Laporan keuangan
daerah berpijak pada hari kalender setempat; memakai UTC akan menggeser transaksi
malam ke hari yang salah sehingga laporan harian tidak cocok dengan rekening.

## Yang Belum Ada

| Hal | Tugas |
|---|---|
| Daftar transaksi lintas OPD + ekspor | LJ-3.2 |
| Ringkasan transparansi publik (agregat, tanpa PII) | LJ-3.3 |
| Perbandingan dengan target PAD resmi dari SIKD | belum direncanakan |
| Ekspor Excel/CSV dashboard | bersama LJ-3.2 |
