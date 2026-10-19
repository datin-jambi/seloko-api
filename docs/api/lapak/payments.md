# Pembayaran Transfer Manual — `/api/lapak/payments`

- **Aplikasi:** `lapak-jambi-web` · **Prefix:** `/api/lapak/payments` · **Jumlah endpoint:** 6
- **Sumber kode:** `src/modules/lapak/payments/payments.routes.ts`
- **Fase:** 2 (LJ-2.6)

## Ringkasan Endpoint

| Method | Path | Izin | Keterangan |
|---|---|---|---|
| `GET` | `/order/:orderId` | login | Semua pembayaran pesanan sendiri |
| `GET` | `/:id` | login | Detail pembayaran (milik sendiri) |
| `POST` | `/:id/proof` | login | Unggah bukti transfer (ImageKit) |
| `GET` | `/` | `payment:read` | Daftar pembayaran CMS (lingkup OPD) |
| `POST` | `/:id/verify` | `payment:approve` | Konfirmasi → LUNAS |
| `POST` | `/:id/reject` | `payment:approve` | Tolak bukti |

## Alur

```
Checkout → pembayaran MENUNGGU_BUKTI (otomatis, batas waktu = dueAt SKRD)
   ↓ warga unggah bukti (ImageKit)
MENUNGGU_KONFIRMASI  (pesanan ikut berubah)
   ↓ admin OPD setujui              ↓ admin OPD tolak
LUNAS                                DITOLAK
(pembayaran + pesanan + SKRD)        → pesanan kembali MENUNGGU_PEMBAYARAN
                                       → warga boleh unggah ulang
```

## Bukti Transfer WAJIB dari ImageKit

Upload dulu lewat:

```
POST /api/storage/upload?module=lapak&subFolder=payments
Authorization: Bearer <token>
Content-Type: multipart/form-data   (field: file)

→ { "data": { "url": "https://ik.imagekit.io/...", "fileId": "..." } }
```

Lalu kirim kedua nilai itu ke `POST /api/lapak/payments/:id/proof`.

**Kenapa URL eksternal ditolak:** bukti bayar adalah lampiran resmi. Tautan yang tidak
kita kendalikan bisa hilang, berubah isinya, atau mati — sementara dokumen ini dipakai
sebagai dasar audit dan sengketa.

`senderName` & `senderBank` diminta agar admin OPD bisa mencocokkan dengan mutasi bank.

## Field Request

| Field | Sumber | Tipe | Keterangan |
|---|---|---|---|
| `orderId` | param | uuid | ID pesanan |
| `id` | param | uuid | ID pembayaran |
| `proofUrl` | body | URL http(s) ≤500 | **Wajib.** URL dari ImageKit |
| `proofFileId` | body | string 3–200 | **Wajib.** `fileId` ImageKit |
| `senderName` | body | string 3–150 | **Wajib.** Nama pengirim di mutasi |
| `senderBank` | body | string 2–100 | **Wajib.** Bank pengirim |
| `amount` | body | int > 0 | **Wajib.** Jumlah yang ditransfer |
| `paidAt` | body | ISO 8601 | **Wajib.** Waktu transfer |
| `note` | body | string ≤500 | Catatan warga |
| `reason` | body | string 5–500 | **Wajib** saat menolak — dibaca warga |
| `status` | query | enum | Filter daftar |
| `organization` | query | string ≤50 | Kode OPD |
| `page` / `limit` | query | int | Paginasi |

## 1. Pembayaran Otomatis Saat Checkout

Checkout membuat baris pembayaran `MENUNGGU_BUKTI` sekaligus. Respons pesanan
menyertakannya di `payments[]`.

**Batas waktu mengikuti `dueAt` SKRD**, bukan default terpisah — satu tanggal yang
dipakai warga maupun OPD.

## 2. Detail Pembayaran

`GET /api/lapak/payments/:id`

```json
{
  "statusCode": 200, "code": "SUCCESS", "message": "Detail pembayaran berhasil diambil",
  "data": {
    "id": "01a15280-...", "orderId": "01a15280-...", "orderCode": "LJK-261022-K7M2P",
    "method": "MANUAL_TRANSFER", "status": "MENUNGGU_BUKTI", "amount": 800000,
    "organization": { "code": "BPSDM", "name": "Badan Pengembangan SDM" },
    "bank": {
      "name": "Bank Jambi",
      "account": "001-02-000123-4",
      "holder": "Kas Daerah Provinsi Jambi"
    },
    "proofUrl": null, "proofFileId": null,
    "senderName": null, "senderBank": null,
    "note": null, "rejectReason": null,
    "paidAt": null, "confirmedAt": null,
    "expiresAt": "2026-10-29T09:00:00.000Z",
    "createdAt": "2026-10-22T09:00:00.000Z"
  }
}
```

**Rekening tujuan diambil dari SNAPSHOT SKRD**, bukan pengaturan hidup — nomor rekening
yang ditampilkan adalah yang tercetak di dokumen tagihan warga.

## 3. Unggah Bukti

`POST /api/lapak/payments/:id/proof`

```json
{
  "proofUrl": "https://ik.imagekit.io/seloko/lapak/payments/bukti-transfer.jpg",
  "proofFileId": "ik_file_abc123",
  "senderName": "Budi Santoso",
  "senderBank": "Bank Jambi",
  "amount": 800000,
  "paidAt": "2026-10-22T10:15:00+07:00",
  "note": "Transfer via mobile banking"
}
```

**Efek:** pembayaran → `MENUNGGU_KONFIRMASI`, pesanan → `MENUNGGU_KONFIRMASI`, log status
tercatat. `rejectReason` dibersihkan (ini unggahan baru setelah penolakan).

**Ditolak `400` bila:** pembayaran sudah `LUNAS`, sudah `KEDALUWARSA`, atau pesanan tidak
berstatus `MENUNGGU_PEMBAYARAN`.

## 4. Konfirmasi (LUNAS)

`POST /api/lapak/payments/:id/verify`

```json
{ "amount": 800000, "note": "Dana masuk rekening kas daerah" }
```

**Atomik** — dalam satu transaksi:
1. pembayaran → `LUNAS`, `confirmedBy`, `confirmedAt`
2. pesanan → `LUNAS` + log status
3. **SKRD → `LUNAS`**

Setengah jadi berarti negara menganggap lunas tetapi dokumennya belum.

### Pemeriksaan nominal

```json
// amount = 500000, tagihan 800000 → 400
{ "message": "Nominal diterima (500000) kurang dari tagihan (800000). Tolak pembayaran dan minta pelunasan." }
```

Admin **tidak boleh** menandai lunas bila uang yang diterima kurang. `amount` opsional —
bila diisi, nilai itulah yang dicatat (berguna saat kelebihan bayar atau pembulatan bank).

### Idempoten

Konfirmasi ulang pada pembayaran yang sudah `LUNAS` mengembalikan `200` dengan data sama —
tidak menggandakan efek.

## 5. Tolak Bukti

`POST /api/lapak/payments/:id/reject`

```json
{ "reason": "Bukti tidak terbaca, mohon unggah ulang" }
```

**Efek:** pembayaran → `DITOLAK`, pesanan kembali → `MENUNGGU_PEMBAYARAN` + log status.

Warga boleh **unggah ulang** — `rejectReason` dibersihkan saat unggahan baru. Riwayat
pembayaran tetap tersimpan untuk audit (satu pesanan boleh punya banyak baris).

## 6. Daftar Pembayaran CMS

`GET /api/lapak/payments?status&organization&page&limit`

Tersaring lingkup OPD otomatis. Bapenda/superadmin melihat semua OPD.

## Kepemilikan

Pembayaran milik user lain dijawab **`404`** (bukan `403`) agar keberadaannya tidak
terbocorkan. Pembayaran OPD di luar lingkup admin juga `404`.

## Kolom Gateway (Disiapkan Sejak Awal)

PRD 04 §E menuntut siap gateway tanpa migrasi besar. Kolom berikut sudah ada:

| Kolom | Untuk |
|---|---|
| `provider` | `bank-jambi`, `midtrans`, dll. |
| `vaNumber` | Virtual account |
| `qrisPayload` | Payload QRIS |
| `externalRef` | ID transaksi di provider |
| `rawCallback` | Payload callback mentah (audit) |
| `expiresAt` | Kedaluwarsa dari provider |

Menambah VA/QRIS = menambah adapter baru + mengisi kolom ini. **Tidak perlu migrasi.**

## Kedaluwarsa

`expireOverduePayments()` (dipanggil worker LJ-2.8) menandai pembayaran & pesanan yang
melewati `expiresAt` sebagai `KEDALUWARSA`, dan SKRD menjadi `CANCELLED`.

**Nomor SKRD tidak dikembalikan** — gapless (lihat `skrd.md`).

Pelepasan slot reservasi sengaja **tidak** dilakukan di sini — itu tanggung jawab worker
reservasi agar satu tempat mengatur slot.

## Belum termasuk

- **Worker kedaluwarsa** otomatis (LJ-2.8)
- **Notifikasi** (email/WA) saat bukti diunggah atau ditolak
- **Tiket QR** & check-in (LJ-2.7)
- **Refund**
