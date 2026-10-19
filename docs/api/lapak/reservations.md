# Reservasi Slot & Anti Double-Booking — `/api/lapak/reservations`

- **Aplikasi:** `lapak-jambi-web` · **Prefix:** `/api/lapak/reservations` · **Jumlah endpoint:** 4
- **Sumber kode:** `src/modules/lapak/reservations/reservations.routes.ts`
- **Fase:** 2 (LJ-2.2)

## Ringkasan Endpoint

| Method | Path | Izin | Keterangan |
|---|---|---|---|
| `GET` | `/product/:productId/slots` | publik | Blok waktu yang sudah terpakai |
| `POST` | `/product/:productId` | publik | Pegang slot sementara (HOLD) |
| `POST` | `/:id/release` | publik | Lepas HOLD |
| `GET` | `/product/:productId` | `product:read` | Daftar reservasi (CMS) |

## Anti Double-Booking Ada di Database, Bukan di Kode

Ini keputusan inti modul ini:

```sql
ALTER TABLE lapak_reservations
  ADD CONSTRAINT ex_lapak_reservations_no_overlap
  EXCLUDE USING gist (product_id WITH =, period WITH &&)
  WHERE (status <> 'RELEASED');
```

Dua reservasi untuk produk yang sama dengan rentang **beririsan** (`&&`) **mustahil
tersimpan** — PostgreSQL menolak transaksi kedua dengan `23P01`, berapa pun banyaknya
request paralel.

**Mengapa bukan pengecekan di kode?** Pola `SELECT cek kosong → INSERT` selalu punya
jendela race: dua request bisa sama-sama lolos `SELECT` sebelum salah satunya `INSERT`.
Constraint menutup jendela itu sepenuhnya. Service hanya menerjemahkan `23P01` → `409`.

**Sudah diuji nyata** (bukan teori): dua `POST` paralel pada slot identik menghasilkan
**tepat satu `201` dan satu `409`**.

## Rentang Waktu

- Tipe `tstzrange`, batas atas **eksklusif** `[)`.
- Artinya booking `08:00–10:00` dan `10:00–12:00` **tidak bentrok** — bersambung boleh.
- `startAt`/`endAt` disimpan sebagai salinan untuk pembacaan, dijaga `CHECK` agar tidak
  mungkin bertentangan dengan `period`.

## Field Request

| Field | Sumber | Tipe | Keterangan |
|---|---|---|---|
| `productId` | param | uuid | ID produk |
| `id` | param | uuid | ID reservasi |
| `startAt` | body | ISO 8601 | Awal blok, wajib berzona waktu |
| `endAt` | body | ISO 8601 | Akhir blok (eksklusif) |
| `qty` | body | int ≥1 | Unit yang diblok (default 1) |
| `holdSeconds` | body | int 60–86400 | Masa HOLD (default 900 = 15 menit) |
| `userId` | body | uuid \| null | Pemesan |
| `from` | query | ISO 8601 | Awal rentang cek |
| `to` | query | ISO 8601 | Akhir rentang cek |
| `status` | query | enum | `HOLD` · `CONFIRMED` · `RELEASED` |
| `page` | query | int ≥1 | Halaman |
| `limit` | query | int 1–100 | Per halaman |

## 1. Pegang Slot (HOLD)

`POST /api/lapak/reservations/product/:productId`

```json
{ "startAt": "2026-12-01T08:00:00+07:00", "endAt": "2026-12-01T10:00:00+07:00", "qty": 1 }
```

**Respons `201`:**

```json
{
  "statusCode": 201, "code": "SUCCESS",
  "message": "Slot berhasil dipegang sementara (HOLD)",
  "data": {
    "id": "01a15280-...", "productId": "01a15280-...",
    "startAt": "2026-12-01T01:00:00.000Z", "endAt": "2026-12-01T03:00:00.000Z",
    "qty": 1, "status": "HOLD",
    "expiresAt": "2026-12-01T01:15:00.000Z",
    "userId": null, "createdAt": "2026-12-01T00:59:00.000Z"
  }
}
```

**Error:**

| Kode | Kondisi |
|---|---|
| `400` | `endAt` ≤ `startAt`; waktu lampau; di luar jam operasional; tanggal tutup; blok lintas hari |
| `404` | Produk tidak dikenal atau belum `PUBLISHED` |
| `409` | Slot sudah dipesan — **ditolak oleh exclusion constraint DB** |

Pesan `409` sengaja generik ("Slot waktu tersebut sudah dipesan") dan **tidak** menyebut
detail reservasi lain, agar tidak membocorkan data pemesan.

## 2. Cek Slot Terpakai

`GET /api/lapak/reservations/product/:productId/slots?from&to`

**Respons `200`:**

```json
{
  "statusCode": 200, "code": "SUCCESS",
  "message": "Ketersediaan slot berhasil diambil",
  "data": {
    "productId": "01a15280-...",
    "from": "2026-12-01T00:00:00.000Z",
    "to": "2026-12-01T23:59:00.000Z",
    "capacity": 1,
    "busy": [
      { "startAt": "2026-12-01T01:00:00.000Z", "endAt": "2026-12-01T03:00:00.000Z", "qty": 1, "status": "HOLD" }
    ],
    "remaining": 0
  }
}
```

HOLD yang **sudah kedaluwarsa** tidak dihitung — secara efektif bebas walau worker belum
sempat membersihkannya.

## 3. Lepas HOLD

`POST /api/lapak/reservations/:id/release`

Baris **tidak dihapus** (`status → RELEASED`): riwayat tetap ada, dan partial index
(`WHERE status <> 'RELEASED'`) membuat slotnya langsung bisa dipesan ulang.

**`400`** bila status bukan `HOLD` (mis. sudah dilepas) — bukan diam-diam sukses.

## 4. Daftar Reservasi (CMS)

`GET /api/lapak/reservations/product/:productId?from&to&status&page&limit`

Filter rentang memakai semantik irisan: `end_at > from AND start_at < to`.

## HOLD Kedaluwarsa

`releaseExpiredHolds()` tersedia di service untuk worker: melepas semua `HOLD` yang
`expires_at <= now()`. Aman dipanggil berulang. Penjadwalan worker menyusul bersama
modul pesanan (LJ-2.3+).

## Batasan yang Disengaja

- **Blok harus dalam satu hari kalender.** Menginap lintas hari dipecah menjadi beberapa
  blok atau ditangani aturan terpisah nanti.
- **Zona waktu** jam operasional memakai jam lokal server. Untuk deployment satu zona
  (WIB) ini benar; multi-zona butuh kolom zona per produk.
- **Kuota** disimpan di `qty` dan dilaporkan lewat `remaining`; penegakan kuota berlapis
  (advisory lock) menyusul saat keranjang/checkout dikerjakan.
