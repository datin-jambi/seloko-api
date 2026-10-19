# Tiket QR & Check-in — `/api/lapak/tickets`

- **Aplikasi:** `lapak-jambi-web` · **Prefix:** `/api/lapak/tickets` · **Jumlah endpoint:** 5
- **Sumber kode:** `src/modules/lapak/tickets/tickets.routes.ts`
- **Fase:** 2 (LJ-2.7)

## Ringkasan Endpoint

| Method | Path | Izin | Keterangan |
|---|---|---|---|
| `GET` | `/verify/:token` | **publik** | Periksa tiket via QR/kode, tanpa data pribadi |
| `GET` | `/order/:orderId` | login | Tiket milik pesanan sendiri |
| `GET` | `/:id` | login | Detail tiket (milik sendiri) |
| `GET` | `/` | `ticket:read` | Daftar tiket CMS (lingkup OPD) |
| `POST` | `/:id/use` | `ticket:approve` | Tandai terpakai (scan petugas) |

## Tiket Terbit Saat LUNAS, Bukan Saat Checkout

Tiket adalah **bukti hak pakai**. Hak itu baru sah setelah dibayar — menerbitkan lebih awal
berarti warga bisa masuk tanpa membayar.

```
Checkout → (belum ada tiket)
   ↓ bukti transfer diunggah
   ↓ admin OPD konfirmasi → LUNAS
TIKET TERBIT (satu per baris pesanan)
```

Diuji: sebelum LUNAS `tickets: []`, setelah LUNAS tiket muncul dengan `status: AKTIF`.

## Jenis Tiket

Mengikuti `fulfillmentType` produk:

| `fulfillmentType` produk | `kind` tiket | Contoh |
|---|---|---|
| `TICKET_QR` | `TICKET` | Kolam renang, GOR |
| `BOOKING` | `BOOKING` | Aula, asrama |
| `CONTRACT` | `CONTRACT` | Sewa kendaraan |
| `RESULT` | `RESULT` | Hasil laboratorium |
| `SCHEDULE` | `SCHEDULE` | Kunjungan berulang |
| `DOCUMENT_SKRD` | `HANDOVER` | Serah terima barang |

Produk tanpa `fulfillmentType` tetap mendapat tiket `BOOKING` sebagai bukti transaksi —
lebih baik punya bukti berlebih daripada warga tidak punya apa pun untuk ditunjukkan.

## Sekali Pakai — Ditegakkan Atomik

```sql
UPDATE lapak_tickets SET status='DIGUNAKAN', used_at=now()
WHERE id = $1 AND status = 'AKTIF';
-- count = 0 → 409 Conflict
```

**Kenapa bukan cek-lalu-update:** pola `SELECT status → UPDATE` punya jendela race. Dua
petugas yang scan bersamaan bisa sama-sama membaca `AKTIF` lalu sama-sama berhasil — satu
tiket dipakai dua orang.

Syarat `status = 'AKTIF'` di `WHERE` membuat database yang memutuskan pemenangnya.

### Diuji nyata

```js
const [s1, s2] = await Promise.all([use, use]);  // scan bersamaan
// Hasil: tepat 1×200, 1×409 ✅
```

## Field Request

| Field | Sumber | Tipe | Keterangan |
|---|---|---|---|
| `token` | param | string 10–64 | Token QR **atau** kode pendek (`TKT-XXXXXX`) |
| `orderId` | param | uuid | ID pesanan |
| `id` | param | uuid | ID tiket |
| `note` | body | string ≤500 | Catatan petugas lokasi |
| `status` | query | enum | `AKTIF`\|`DIGUNAKAN`\|`KEDALUWARSA`\|`DIBATALKAN` |
| `kind` | query | enum | Jenis tiket |
| `organization` | query | string ≤50 | Kode OPD |
| `page` / `limit` | query | int | Paginasi |

## 1. Verifikasi Publik

`GET /api/lapak/tickets/verify/:token` — **tanpa login**.

Menerima **token QR** (24 byte acak) **atau kode pendek** (`TKT-7K2M9P`) — kode dipakai
bila QR rusak atau kamera tidak tersedia.

```json
{
  "statusCode": 200, "code": "SUCCESS", "message": "Tiket ditemukan",
  "data": {
    "code": "TKT-7K2M9P",
    "kind": "TICKET",
    "productName": "Tiket Kolam Renang",
    "rateName": "Per Orang",
    "organizationName": "Badan Pengembangan SDM",
    "status": "AKTIF",
    "validFrom": "2026-10-23T01:00:00.000Z",
    "validUntil": "2026-10-23T09:00:00.000Z",
    "usedAt": null,
    "usable": true,
    "reason": null
  }
}
```

**Tanpa data pribadi.** Petugas lokasi hanya perlu tahu: tiket ini asli, milik produk apa,
dan boleh dipakai atau tidak. Nama pemesan tidak dikirim.

### `usable` — keputusan siap pakai

| Kondisi | `usable` | `reason` |
|---|---|---|
| `AKTIF` & dalam masa berlaku | `true` | `null` |
| `DIGUNAKAN` | `false` | `"Tiket sudah dipakai pada ..."` |
| `DIBATALKAN` | `false` | `"Tiket dibatalkan"` |
| `KEDALUWARSA` | `false` | `"Tiket kedaluwarsa"` |
| Sebelum `validFrom` | `false` | `"Belum bisa dipakai sebelum ..."` |
| Setelah `validUntil` | `false` | `"Sudah lewat masa berlaku (...)"` |

Frontend cukup membaca `usable` + `reason` — tidak perlu meniru logika ini.

## 2. Tandai Terpakai

`POST /api/lapak/tickets/:id/use` — izin `ticket:approve`.

```json
{ "note": "Rombongan 3 orang, masuk pukul 09.15" }
```

**Efek:** `status` → `DIGUNAKAN`, `usedAt` → sekarang, `checkedInBy` → petugas.

**Ditolak:**

| Kode | Kondisi |
|---|---|
| `400` | Sebelum `validFrom` / setelah `validUntil` |
| `403` | Tidak punya izin `ticket:approve` |
| `404` | Tiket OPD lain (tidak bocor keberadaannya) |
| `409` | Sudah dipakai / dibatalkan — **sekali pakai** |

## 3. Masa Berlaku

Diisi dari **rentang pesanan** (`startAt`/`endAt`):

| Kondisi | `validFrom` | `validUntil` |
|---|---|---|
| Pesanan punya rentang | `startAt` | `endAt` |
| Pesanan tanpa rentang | Waktu terbit | `null` (tanpa batas) |

Tiket dengan `validUntil` lewat otomatis menjadi `KEDALUWARSA` lewat
`expireOverdueTickets()` (worker LJ-2.8).

**Masa berlaku diperiksa dua kali:** saat verifikasi (untuk `usable`) dan saat
`use` (untuk menolak `400`). Status `AKTIF` saja tidak cukup — tiket kemarin tetap
`AKTIF` secara status sampai worker berjalan.

## 4. Snapshot

Tiket menyimpan `productName` & `rateName` sendiri. Bila produk diganti nama atau dihapus
setelah tiket terbit, **tiket tidak berubah** — ia bukti apa yang dibeli saat itu.

## 5. Idempoten

`issueTicketsInTx` melewati baris yang sudah punya tiket. Konfirmasi pembayaran ulang
**tidak menggandakan** tiket.

## 6. Kode Pendek

`TKT-XXXXXX` — 6 karakter dari alfabet tanpa `I/O/0/1` (agar tidak salah baca di lapangan),
unik per OPD.

Token QR terpisah: 24 byte acak `base64url` — **tidak bisa diturunkan dari kode pendek**,
jadi menebak kode tidak memberi akses ke token.

## Alur Lengkap Sampai Pemenuhan

```
Checkout → SKRD terbit → pembayaran MENUNGGU_BUKTI
   ↓ unggah bukti
MENUNGGU_KONFIRMASI
   ↓ admin OPD konfirmasi
LUNAS → SKRD LUNAS → TIKET TERBIT
   ↓ petugas scan di lokasi
DIGUNAKAN (sekali pakai)
```

## Belum termasuk

- **Worker** kedaluwarsa tiket otomatis (LJ-2.8)
- **Gambar QR** (PNG/SVG) — menyusul bersama PDF SKRD
- **Check-out** untuk `BOOKING` (saat ini hanya check-in)
- **Catatan petugas** belum disimpan (model belum punya kolomnya)
