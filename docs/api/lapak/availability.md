# Jam Operasional & Tanggal Tutup — `/api/lapak/availability`

- **Aplikasi:** `lapak-jambi-web` · **Prefix:** `/api/lapak/availability` · **Jumlah endpoint:** 6
- **Sumber kode:** `src/modules/lapak/availability/availability.routes.ts`
- **Fase:** 2 (LJ-2.1)

## Ringkasan Endpoint

| Method | Path | Izin | Keterangan |
|---|---|---|---|
| `GET` | `/product/:productId/availability` | publik | Cek ketersediaan harian |
| `GET` | `/product/:productId/hours` | `product:read` | Jam operasional mingguan |
| `PUT` | `/product/:productId/hours` | `product:update` | Ganti seluruh jadwal mingguan |
| `GET` | `/product/:productId/blackouts` | `product:read` | Daftar tanggal tutup |
| `POST` | `/product/:productId/blackouts` | `product:update` | Tambah rentang tanggal tutup |
| `DELETE` | `/product/:productId/blackouts/:id` | `product:update` | Hapus tanggal tutup |

## Model Jadwal

- **Satu baris per hari BUKA.** Hari tanpa baris = tutup. Tidak ada kolom `isOpen`,
  sehingga tidak mungkin ada keadaan "baris ada tapi ditandai tutup".
- **`weekday`**: `0` = Minggu … `6` = Sabtu (selaras `Date.getDay()`).
- **Format jam**: `HH:MM` 24 jam. `closeTime` < `openTime` berarti **lintas tengah malam**
  (mis. `20:00`–`02:00`).
- **Tanggal tutup** (blackout) berupa **rentang inklusif** — maintenance sering berhari-hari.
  Blackout **menang** atas jam operasional.
- Batas cek ketersediaan: **92 hari** (~satu kuartal), cukup untuk kalender publik.

## Field Request

| Field | Sumber | Tipe | Keterangan |
|---|---|---|---|
| `productId` | param | uuid | ID produk |
| `id` | param | uuid | ID tanggal tutup |
| `from` | query | `YYYY-MM-DD` | Awal rentang cek |
| `to` | query | `YYYY-MM-DD` | Akhir rentang cek |
| `hours` | body | array (maks 7) | Jadwal mingguan penuh |
| `weekday` | body | int 0–6 | Hari |
| `openTime` | body | `HH:MM` | Jam buka |
| `closeTime` | body | `HH:MM` | Jam tutup (boleh < `openTime`) |
| `startDate` | body | `YYYY-MM-DD` | Awal tanggal tutup |
| `endDate` | body | `YYYY-MM-DD` | Akhir tanggal tutup (≥ `startDate`) |
| `reason` | body | string ≤255 | Alasan tutup |

## 1. Cek Ketersediaan (publik)

`GET /api/lapak/availability/product/:productId/availability?from&to`

Tanpa autentikasi. Hanya produk **PUBLISHED** yang dilayani (`404` untuk DRAFT).

**Respons `200`** — satu baris **per tanggal**, termasuk yang tutup, agar frontend bisa
merender kalender penuh tanpa menebak hari yang hilang:

```json
{
  "statusCode": 200,
  "code": "SUCCESS",
  "message": "Ketersediaan produk berhasil diambil",
  "data": {
    "productId": "01a15280-...",
    "from": "2026-11-02",
    "to": "2026-11-08",
    "days": [
      { "date": "2026-11-02", "weekday": 1, "isOpen": true, "openTime": "08:00", "closeTime": "16:00", "reason": null },
      { "date": "2026-11-07", "weekday": 6, "isOpen": false, "openTime": null, "closeTime": null, "reason": "Tutup pada hari ini" },
      { "date": "2026-11-08", "weekday": 0, "isOpen": false, "openTime": null, "closeTime": null, "reason": "Tutup pada hari ini" }
    ]
  }
}
```

**Error:** `400` rentang > 92 hari atau `to` < `from` · `404` produk tidak dikenal/DRAFT.

## 2. Jam Operasional Mingguan

`GET|PUT /api/lapak/availability/product/:productId/hours`

`PUT` bersifat **replace-set**: seluruh jadwal diganti dalam satu transaksi. Alasannya, jam
buka adalah keputusan atas satu minggu — replace-set mencegah keadaan setengah jadi, dan
hari duplikat ditolak `400` **sebelum** menyentuh database.

```json
// PUT body — Senin s/d Jumat buka
{ "hours": [
  { "weekday": 1, "openTime": "08:00", "closeTime": "16:00" },
  { "weekday": 2, "openTime": "08:00", "closeTime": "16:00" },
  { "weekday": 3, "openTime": "08:00", "closeTime": "16:00" },
  { "weekday": 4, "openTime": "08:00", "closeTime": "16:00" },
  { "weekday": 5, "openTime": "08:00", "closeTime": "16:00" }
] }
```

Mengirim `{ "hours": [] }` berarti produk **tutup sepanjang waktu**.

## 3. Tanggal Tutup

`GET|POST /api/lapak/availability/product/:productId/blackouts`
`DELETE /api/lapak/availability/product/:productId/blackouts/:id`

**POST body:**

```json
{ "startDate": "2026-11-03", "endDate": "2026-11-04", "reason": "Renovasi atap" }
```

**Respons `201`:** `{ envelope, data: { id, startDate, endDate, reason } }`

**Error:** `400` `endDate` < `startDate` atau format tanggal salah.

Hapus bersifat **hard delete** — jadwal bukan data transaksi, tidak perlu riwayat.
**Respons `200`:** `{ envelope, data: { id, deleted: true } }`

## Lingkup OPD

Endpoint CMS otomatis disaring ke OPD pemilik produk lewat `user_app_role_organizations`.
Bapenda/superadmin tanpa baris lingkup melihat semua OPD.

Produk di luar lingkup dijawab **`403`** (guard izin menolak lebih dulu) atau **`404`**
(lolos guard tapi di luar lingkup) — keduanya benar; yang penting data tidak terbocorkan
dan tidak pernah `200`.

## Belum termasuk (LJ-2.2)

Modul ini murni **jadwal**. Kuota, `tstzrange`, exclusion constraint anti-double-booking,
dan hold `expiresAt` dikerjakan di LJ-2.2 bersama reservasi.
