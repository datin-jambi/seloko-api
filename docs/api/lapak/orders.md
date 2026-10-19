# Quote & Checkout → Pesanan — `/api/lapak/orders`

- **Aplikasi:** `lapak-jambi-web` · **Prefix:** `/api/lapak/orders` · **Jumlah endpoint:** 5
- **Sumber kode:** `src/modules/lapak/orders/orders.routes.ts`
- **Fase:** 2 (LJ-2.4)

## Ringkasan Endpoint

| Method | Path | Izin | Keterangan |
|---|---|---|---|
| `GET` | `/cart/:cartId/quote` | login | Hitung rincian harga (tidak menyimpan) |
| `POST` | `/cart/:cartId/checkout` | login | Buat pesanan + bekukan snapshot |
| `GET` | `/mine` | login | Pesanan milik warga |
| `GET` | `/:id` | login | Detail pesanan (milik sendiri) |
| `GET` | `/` | `order:read` | Daftar pesanan CMS (lingkup OPD) |

## Dua Prinsip yang Dijaga

### 1. Snapshot, bukan referensi hidup

Checkout **menyalin** nama produk, nama tarif, satuan, dan harga ke baris pesanan.
Bila Bapenda menaikkan tarif besok, **pesanan kemarin tidak berubah** — ia bukti
transaksi pada harga saat itu.

```json
// Pesanan dibuat saat tarif Rp300.000
{ "productName": "Sewa Aula", "rateName": "Harian", "price": 300000, "lineTotal": 600000 }

// Tarif dinaikkan ke Rp999.000 → pesanan TETAP 300.000
```

### 2. PII tidak pernah keluar utuh

`applicant` disimpan lengkap untuk keperluan SKRD, tetapi **setiap respons memakai versi
termasking**. NIK 16 digit → `1234********3456`, telepon 12 digit → `0812****7890`.

Aturan ini konsisten dengan `security-guidelines.md` — data pemohon adalah PII.

## Field Request

| Field | Sumber | Tipe | Keterangan |
|---|---|---|---|
| `cartId` | param | uuid | ID keranjang |
| `id` | param | uuid | ID pesanan |
| `applicant` | body | object | **Wajib.** Snapshot data pemohon |
| `applicant.name` | body | string 3–150 | Nama pemohon/penanggung jawab |
| `applicant.nik` | body | 16 digit \| null | NIK |
| `applicant.npwp` | body | string ≤20 \| null | NPWP |
| `applicant.phone` | body | string 8–20 | Telepon |
| `applicant.email` | body | email \| null | Email |
| `applicant.institution` | body | string ≤150 \| null | Instansi |
| `applicant.address` | body | string ≤255 \| null | Alamat |
| `purpose` | body | string ≤500 | Maksud pemakaian |
| `dueHours` | body | int 1–720 | Masa berlaku bayar (default 24 jam) |
| `status` | query | enum | Filter status pesanan |
| `organization` | query | string ≤50 | Kode OPD (CMS) |
| `page` | query | int ≥1 | Halaman |
| `limit` | query | int 1–100 | Per halaman |

## 1. Quote

`GET /api/lapak/orders/cart/:cartId/quote`

Menghitung harga **tanpa menyimpan apa pun**. Aman dipanggil berkali-kali.

```json
{
  "statusCode": 200, "code": "SUCCESS",
  "message": "Rincian harga berhasil dihitung",
  "data": {
    "organization": { "code": "BPSDM", "name": "Badan Pengembangan SDM" },
    "lines": [
      {
        "cartItemId": "01a15280-...", "productId": "01a15280-...",
        "productName": "Sewa Aula", "rateId": "01a15280-...", "rateName": "Harian",
        "unit": "DAY", "price": 300000, "qty": 2, "lineTotal": 600000,
        "startAt": null, "endAt": null, "warning": null
      }
    ],
    "subtotal": 600000, "total": 600000,
    "ready": true,
    "warnings": []
  }
}
```

`ready: false` menandakan ada baris yang **tidak bisa** di-checkout (produk tidak terbit,
tarif belum disetujui, reservasi kedaluwarsa). Frontend bisa menampilkan peringatan tanpa
mencoba checkout dulu.

## 2. Checkout

`POST /api/lapak/orders/cart/:cartId/checkout`

```json
{
  "applicant": {
    "name": "Budi Santoso", "nik": "1234567890123456", "phone": "081234567890",
    "email": "budi@example.com", "institution": "PT Contoh Jambi",
    "address": "Jl. Merdeka No. 1, Jambi"
  },
  "purpose": "Rapat koordinasi tahunan",
  "dueHours": 24
}
```

**Respons `201`:**

```json
{
  "statusCode": 201, "code": "SUCCESS",
  "message": "Pesanan berhasil dibuat",
  "data": {
    "id": "01a15280-...", "code": "LJK-261021-K7M2P",
    "status": "MENUNGGU_PEMBAYARAN",
    "organization": { "code": "BPSDM", "name": "Badan Pengembangan SDM" },
    "items": [
      { "id": "01a15280-...", "productName": "Sewa Aula", "rateName": "Harian",
        "unit": "DAY", "price": 300000, "qty": 2, "lineTotal": 600000,
        "startAt": null, "endAt": null, "note": null }
    ],
    "subtotal": 600000, "total": 600000,
    "purpose": "Rapat koordinasi tahunan",
    "expiresAt": "2026-10-22T22:00:00.000Z",
    "createdAt": "2026-10-21T22:00:00.000Z",
    "applicant": {
      "name": "Budi Santoso", "nik": "1234********3456", "phone": "0812****7890",
      "npwp": null, "email": "budi@example.com",
      "institution": "PT Contoh Jambi", "address": "Jl. Merdeka No. 1, Jambi"
    }
  }
}
```

**Error:**

| Kode | Kondisi |
|---|---|
| `400` | Keranjang kosong; `ready:false` (ada baris bermasalah); data pemohon tidak valid |
| `404` | Keranjang bukan milik user |
| `409` | Slot sudah tidak tersedia saat konfirmasi reservasi |

### Atomik

Pesanan, baris, log status, dan konfirmasi reservasi (HOLD → CONFIRMED) berada dalam
**satu transaksi**. Bila satu reservasi gagal dikonfirmasi, seluruh checkout dibatalkan —
lebih baik gagal bersih daripada pesanan setengah jadi yang menahan slot tanpa bukti.

Setelah berhasil, **keranjang dikosongkan** — isinya sudah dipindahkan sebagai snapshot
ke pesanan.

### Kode Pesanan

Format `LJK-YYMMDD-XXXXX` dengan 5 karakter acak dari alfabet tanpa `I/O/0/1`
(agar tidak salah baca). **Bukan berurutan** — kode dipakai warga untuk melacak pesanan
di halaman publik, jadi nomor urut yang mudah ditebak akan membocorkan volume transaksi.

## 3. Pesanan Saya

`GET /api/lapak/orders/mine?status&page&limit`

Hanya pesanan milik user yang login. PII tetap termasking.

## 4. Detail Pesanan

`GET /api/lapak/orders/:id`

Pesanan milik user lain dijawab **`404`** (bukan `403`) agar keberadaannya tidak terbocorkan.

## 5. Daftar Pesanan CMS

`GET /api/lapak/orders?status&organization&page&limit`

**Izin:** `order:read`, tersaring lingkup OPD otomatis. Bapenda/superadmin melihat semua.

PII **selalu termasking** — bahkan untuk CMS, karena list tidak memerlukan NIK utuh.
Data lengkap hanya dibutuhkan saat menerbitkan SKRD (LJ-2.5).

## Status Pesanan

Modul ini memakai `MENUNGGU_PEMBAYARAN`. Alur lengkap (PRD 04 §5):

```
DRAFT → [MENUNGGU_VERIFIKASI] → MENUNGGU_PEMBAYARAN → MENUNGGU_KONFIRMASI
      → LUNAS → AKTIF → SELESAI
      ↘ DITOLAK | DIBATALKAN | KEDALUWARSA | REFUND
```

Status lain disiapkan di enum agar SKRD/pembayaran/tiket tidak perlu migrasi enum lagi.

## Jejak Audit

Setiap perubahan status dicatat di `lapak_order_status_logs` (`fromStatus`, `toStatus`,
`actorId`, `note`). `actorId` null berarti perubahan oleh sistem (worker kedaluwarsa).

## Belum termasuk

- **SKRD** & penomoran gapless (LJ-2.5)
- **Pembayaran** transfer manual (LJ-2.6)
- **Tiket QR** & check-in (LJ-2.7)
- **Worker kedaluwarsa** (LJ-2.8)
- Addon & dokumen persyaratan (menyusul bersama checkout lanjutan)
