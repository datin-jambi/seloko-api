# Keranjang per OPD — `/api/lapak/carts`

- **Aplikasi:** `lapak-jambi-web` · **Prefix:** `/api/lapak/carts` · **Jumlah endpoint:** 8
- **Sumber kode:** `src/modules/lapak/carts/carts.routes.ts`
- **Fase:** 2 (LJ-2.3)

## Ringkasan Endpoint

| Method | Path | Izin | Keterangan |
|---|---|---|---|
| `GET` | `/` | login | Semua keranjang milik user (satu per OPD) |
| `GET` | `/opd/:code` | login | Ambil atau buat keranjang OPD |
| `GET` | `/:id` | login | Detail satu keranjang |
| `POST` | `/:id/items` | login | Tambah produk |
| `PUT` | `/:id/items/:itemId` | login | Ubah qty / tarif / catatan |
| `DELETE` | `/:id/items/:itemId` | login | Hapus item |
| `POST` | `/:id/clear` | login | Kosongkan keranjang |
| `DELETE` | `/:id` | login | Hapus keranjang |

**Semua rute butuh login.** Tidak ada endpoint yang menerima `userId` dari klien — keranjang
selalu milik user yang terautentikasi, sehingga warga tidak bisa mengakses keranjang orang
lain dengan menebak ID.

## Aturan Inti: Satu Keranjang per (user, OPD)

PRD 04 §4.F: SKRD diterbitkan per penerbit, jadi **satu pesanan = satu OPD**. Warga boleh
punya **beberapa keranjang** — satu untuk tiap OPD — dan checkout lintas OPD dipecah menjadi
beberapa pesanan.

Aturan ini ditegakkan **dua lapis**:

1. **Unique index** `uq_lapak_carts_user_org` di database (jaminan terakhir).
2. Pemeriksaan ramah di service yang menghasilkan `409` berpesan jelas.

Menambah produk dari OPD lain ke keranjang yang sudah ada **ditolak `409`**, bukan digabung
diam-diam — penggabungan akan membuat satu checkout berisi dua penerbit SKRD, yang mustahil
diterbitkan.

```json
// POST /api/lapak/carts/{cartId}/items  — produk OPD lain
// 409
{ "message": "Keranjang ini milik OPD lain. Satu pesanan hanya untuk satu OPD — buat keranjang terpisah untuk produk ini." }
```

## Harga TIDAK Disimpan di Keranjang

`unitPrice` dan `subtotal` di respons hanya **informasi** dari tarif aktif saat ini. Angka
final dibekukan sebagai snapshot di pesanan saat quote/checkout (LJ-2.4).

Alasannya: menyimpan harga di keranjang berarti harga yang sudah basi bisa ikut ter-checkout.

## Field Request

| Field | Sumber | Tipe | Keterangan |
|---|---|---|---|
| `code` | param | string 1–50 | Kode OPD, mis. `BPSDM` |
| `id` | param | uuid | ID keranjang |
| `itemId` | param | uuid | ID item keranjang |
| `productId` | body | uuid | Produk yang ditambahkan |
| `rateId` | body | uuid \| null | Tarif dipilih; null = tarif termurah |
| `reservationId` | body | uuid \| null | Reservasi HOLD untuk baris ini |
| `qty` | body | int ≥1 | Jumlah (default 1) |
| `startAt` | body | ISO 8601 \| null | Awal rentang yang dipilih |
| `endAt` | body | ISO 8601 \| null | Akhir rentang |
| `note` | body | string ≤500 \| null | Catatan pemohon |

## 1. Daftar Keranjang

`GET /api/lapak/carts`

```json
{
  "statusCode": 200, "code": "SUCCESS",
  "message": "Daftar keranjang berhasil diambil",
  "data": [
    {
      "id": "01a15280-...",
      "organization": { "code": "BPSDM", "name": "Badan Pengembangan SDM Provinsi Jambi" },
      "items": [
        {
          "id": "01a15280-...", "productId": "01a15280-...",
          "productName": "Sewa Aula", "productSlug": "sewa-aula",
          "rateId": "01a15280-...", "rateName": "Harian",
          "reservationId": null, "qty": 2,
          "startAt": null, "endAt": null, "note": null,
          "unitPrice": 200000, "lineTotal": 400000
        }
      ],
      "itemCount": 2,
      "subtotal": 400000
    }
  ]
}
```

## 2. Ambil / Buat Keranjang OPD

`GET /api/lapak/carts/opd/:code`

Idempoten — meminta dua kali mengembalikan keranjang yang **sama**. `404` bila kode OPD
tidak dikenal.

## 3. Tambah Item

`POST /api/lapak/carts/:id/items`

```json
{ "productId": "01a15280-...", "rateId": "01a15280-...", "qty": 2 }
```

**Validasi:**

| Kode | Kondisi |
|---|---|
| `400` | Produk belum `PUBLISHED`; tarif tidak tersedia/belum disetujui; reservasi bukan milik user / tidak `HOLD` / kedaluwarsa |
| `404` | Keranjang bukan milik user, atau produk tidak dikenal |
| `409` | Produk milik OPD lain (aturan satu pesanan = satu OPD) |

**Duplikat digabung:** produk + tarif + rentang waktu yang identik menambah `qty` baris yang
ada, bukan membuat baris baru yang membingungkan di UI.

## 4. Ubah / Hapus Item

`PUT /api/lapak/carts/:id/items/:itemId` — body minimal satu field (`qty`, `rateId`, `note`).

`DELETE /api/lapak/carts/:id/items/:itemId` — hapus satu baris.

## 5. Kosongkan / Hapus Keranjang

`POST /api/lapak/carts/:id/clear` — hapus semua item, keranjang tetap ada.

`DELETE /api/lapak/carts/:id` — hapus keranjang beserta itemnya (cascade).

```json
{ "statusCode": 200, "code": "SUCCESS", "message": "Keranjang dihapus",
  "data": { "id": "01a15280-...", "deleted": true } }
```

## Kaitan dengan Reservasi (LJ-2.2)

`reservationId` menautkan blok waktu yang sudah di-HOLD ke baris keranjang. Bila keranjang
ditinggalkan, HOLD kedaluwarsa sendiri lewat `expiresAt` — baris keranjang tidak perlu ikut
dihapus. Satu reservasi hanya boleh ditautkan ke **satu** baris keranjang (unique index).

## Kepemilikan Keranjang

Keranjang milik user lain dijawab **`404`**, bukan `403` — agar keberadaannya tidak
terbocorkan.
