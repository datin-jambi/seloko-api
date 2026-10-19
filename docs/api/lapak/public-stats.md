# Transparansi PAD Publik — `/api/lapak/public-stats`

- **Aplikasi:** `lapak-jambi-web` · **Prefix:** `/api/lapak/public-stats` · **Jumlah endpoint:** 1
- **Sumber kode:** `src/modules/lapak/public-stats/public-stats.routes.ts`
- **Fase:** 3 (LJ-3.3)

## Ringkasan Endpoint

| Method | Path | Izin | Keterangan |
|---|---|---|---|
| `GET` | `/` | **publik** (tanpa login) | Agregat penerimaan per kategori & bulan |

## Dasar perancangan

### 1. PRD 04 §1: disajikan per KATEGORI, bukan per OPD

> *"data dikelola **per OPD**, tetapi disajikan ke publik **per kategori**
> (dikelola Bapenda) agar mudah dicerna."*

Karena itu endpoint ini **tidak** mengelompokkan per OPD. Alasannya bukan sekadar
keterbacaan: perbandingan *"OPD A menerima lebih banyak dari OPD B"* mudah berubah
menjadi polemik, padahal jumlah aset dan tarif setiap OPD berbeda. Kategori adalah
unit yang adil untuk dilihat publik.

### 2. Tujuan aplikasi (PRD 04 §1)

> *"**Masyarakat** mengetahui bahwa ada PAD di setiap tempat."*

Halaman ini menjawab pertanyaan warga: *"uang retribusi dari layanan yang saya pakai
pergi ke mana, dan berapa?"*

## Tiga Batas yang Dijaga

### 1. Hanya agregat

Tidak ada satu pun respons yang memuat:
- kode pesanan (`LJK-...`)
- nama pemohon
- NIK / telepon
- **nominal transaksi tunggal**
- identitas OPD per transaksi

Diuji: respons diperiksa terhadap semua nilai itu dan tidak boleh mengandungnya.

### 2. Suppression — agregasi saja tidak cukup

Ini bagian yang sering terlewat. Bila sebuah kategori hanya punya **1 pesanan
senilai Rp5.000.000**, maka menampilkan *"Kategori X: Rp5 jt"* **sama dengan
membuka nilai transaksi satu orang** — dan siapa pun yang tahu siapa yang menyewa
hari itu bisa menyimpulkan nominalnya.

| Jumlah pesanan | Nominal | `suppressed` |
|---|---|---|
| < 3 | `null` | `true` |
| ≥ 3 | ditampilkan | `false` |

**Jumlah pesanan tetap dilaporkan** meski nominal disembunyikan — publik tetap tahu
aktivitasnya ada, tanpa bisa menyimpulkan nilai per orang.

Ambang dapat dinaikkan dengan mengubah `MIN_ORDERS_FOR_DISCLOSURE` di
`public-stats.schema.ts`.

### 3. Hanya pesanan LUNAS

Janji yang belum dibayar bukan penerimaan. Diuji: pesanan `MENUNGGU_PEMBAYARAN`
tidak menambah total maupun jumlah.

## Field Request

| Field | Sumber | Tipe | Keterangan |
|---|---|---|---|
| `year` | query | int 2020–2100 | Tahun anggaran; kosong = tahun berjalan |

## Respons

`GET /api/lapak/public-stats?year=2026`

```json
{
  "statusCode": 200, "code": "SUCCESS",
  "message": "Ringkasan penerimaan publik",
  "data": {
    "year": 2026,
    "total": { "realized": 3000000, "orderCount": 3, "suppressed": false },
    "byCategory": [
      { "slug": "sewa-gedung-ruangan", "name": "Sewa Gedung / Ruangan",
        "realized": 3000000, "orderCount": 3, "suppressed": false }
    ],
    "byMonth": [
      { "month": "2026-01", "label": "Januari", "realized": 0, "orderCount": 0, "suppressed": false },
      { "month": "2026-10", "label": "Oktober", "realized": 3000000, "orderCount": 3, "suppressed": false }
    ],
    "disclosure": {
      "minOrders": 3,
      "note": "Kelompok dengan kurang dari 3 pesanan disembunyikan nominalnya untuk melindungi kerahasiaan pemesan. Jumlah pesanan tetap ditampilkan."
    },
    "generatedAt": "2026-10-23T11:00:00.000Z"
  }
}
```

### 12 bulan penuh, bukan hanya bulan berisi data

`byMonth` selalu berisi 12 entri. Bulan tanpa transaksi bernilai **`0`, bukan
`null`** dan **tidak** ditandai `suppressed`.

Perbedaan ini penting:
- `0` + `suppressed: false` → "memang tidak ada penerimaan"
- `null` + `suppressed: true` → "ada, tapi disembunyikan"

Grafik dengan lubang membuat publik mengira datanya tidak tersedia.

## Akses

**Tanpa login** — siapa pun bisa memanggilnya.

Namun header **`X-App-Code` tetap wajib** (`400` bila tidak ada). Endpoint ini
"publik" dalam arti *tanpa autentikasi pengguna*, bukan *tanpa identitas aplikasi*:
header tersebut menandai aplikasi mana yang dilayani dan dipakai guard multi-tenant.

## Zona Waktu

Batas tahun memakai **Asia/Jakarta**. Transaksi 31 Desember pukul 23:30 WIB tidak
jatuh ke tahun berikutnya — penting agar angka tahunan cocok dengan laporan resmi.

## Validasi

| Kondisi | Kode |
|---|---|
| `year` di luar 2020–2100 | `400` |
| Tanpa header `X-App-Code` | `400` |

## Yang Sengaja TIDAK Ada

| Hal | Alasan |
|---|---|
| Nominal per OPD | PRD mengamanatkan penyajian per kategori |
| Nominal per produk | Membuka detail komersial & memicu perbandingan antar-OPD |
| Jumlah pemesan unik | Bisa dipakai mengukur basis pengguna |
| Daftar transaksi | Itu domain internal (LJ-3.2) |

---

## 🎉 Fase 3 (Monitoring PAD) SELESAI

| LJ-3.1 | LJ-3.2 | LJ-3.3 |
|---|---|---|
| ✅ | ✅ | ✅ |

**Fase 1 (Katalog) 7/7 · Fase 2 (Transaksi) 8/8 · Fase 3 (Monitoring) 3/3**
