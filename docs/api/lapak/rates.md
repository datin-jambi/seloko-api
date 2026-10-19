# Tarif Produk — `/api/lapak/rates`

- **Aplikasi:** `lapak-jambi-web` · **Prefix:** `/api/lapak/rates` · **Jumlah endpoint:** 8
- **Sumber kode:** `src/modules/lapak/rates/rates.routes.ts`
- **Fase:** 1 (LJ-1.3)

## Ringkasan Endpoint

| Method | Path | Izin | Keterangan |
|---|---|---|---|
| `GET` | `/` | `product:read` | Daftar tarif (lingkup OPD) |
| `GET` | `/:id` | `product:read` | Detail tarif |
| `POST` | `/product/:productId` | `product:update` | Tambah tarif ke produk |
| `PUT` | `/:id` | `product:update` | Ubah tarif belum disetujui |
| `POST` | `/:id/revise` | `product:update` | Revisi tarif approved |
| `PATCH` | `/:id/status/:action` | sesuai aksi | submit / approve / reject |
| `PATCH` | `/:id/deactivate` | `product:update` | Nonaktifkan tarif |
| `DELETE` | `/:id` | `product:delete` | Hapus (soft-delete) |

Tarif adalah **entitas ber-status sendiri**, terpisah dari produk. Produk bisa terbit
(`PUBLISHED`) sementara tarifnya masih `DRAFT`; sebaliknya, revisi harga tidak menurunkan
status produk. Portal publik hanya menyajikan tarif berstatus `APPROVED`/`PUBLISHED` yang
`effectiveFrom`-nya sudah tercapai (PRD 04 §C).

## Siklus Status Tarif

```
DRAFT ──submit──> PENDING_REVIEW ──approve──> APPROVED
                        │
                        └──reject(+note)──> REJECTED ──submit──> PENDING_REVIEW
```

| Aksi | Dari status | Izin | Catatan |
|---|---|---|---|
| `submit` | `DRAFT`, `REJECTED` | `product:update` | Tarif lahir `DRAFT` saat produk masih `DRAFT` |
| `approve` | `PENDING_REVIEW` | `product:approve` | Wajib dalam lingkup OPD pemilik produk |
| `reject` | `PENDING_REVIEW` | `product:reject` | `note` **wajib** diisi |

> **Penting:** `admin-opd` **memegang** `product:approve` untuk OPD-nya sendiri (PRD 04 §C).
> Yang membatasi adalah **lingkup**: tarif milik produk OPD lain tidak bisa disetujui.

## Aturan Publikasi

1. Portal publik hanya menampilkan tarif `APPROVED`/`PUBLISHED`.
2. Tarif dengan `effectiveFrom` di masa depan **tersembunyi** dari publik sampai waktunya tiba.
   Filter waktu dievaluasi **per-request**, bukan sebagai konstanta modul.
3. Produk tanpa tarif terlihat menyajikan `rates: []` dan `startingPrice: 0`.
4. Saat revisi dibuat, publik **tetap melihat harga lama**; harga baru menggantikan setelah disetujui.

## Field Request

| Field | Sumber | Tipe | Keterangan |
|---|---|---|---|
| `id` | param | uuid | ID tarif |
| `productId` | param / query | uuid | ID produk induk |
| `action` | param | enum | `submit` · `approve` · `reject` |
| `page` | query | int ≥1 | Halaman daftar |
| `limit` | query | int 1–100 | Per halaman |
| `status` | query | enum | Filter status tarif |
| `name` | body | string 1–100 | Nama tarif |
| `unit` | body | enum | Satuan tarif |
| `price` | body | number ≥0 | Harga |
| `minQty` | body | int ≥1 | Kuantitas minimum |
| `maxQty` | body | int ≥1 \| null | Kuantitas maksimum |
| `startTime` | body | `HH:MM` \| null | Jam mulai |
| `endTime` | body | `HH:MM` \| null | Jam selesai |
| `effectiveFrom` | body | ISO datetime \| null | Mulai berlaku |
| `isActive` | body | boolean | Tampil di publik |
| `note` | body | string ≤500 | Alasan penolakan |

## Revision

`POST /api/lapak/rates/:id/revise` membuat **baris baru** (`PENDING_REVIEW`) yang mewarisi nilai
baris lama. Baris lama tetap aktif selama revisi berjalan dan otomatis dinonaktifkan saat baris
revisi **disetujui** — mencegah produk kehilangan harga di tengah proses.

---

## 1. Daftar Tarif

`GET /api/lapak/rates`

Daftar tarif semua produk dalam lingkup OPD pengguna.

**Izin:** `product:read` (lingkup OPD otomatis)

**Query:**

| Field | Tipe | Default | Keterangan |
|---|---|---|:--:|---|
| `productId` | uuid | — | Filter satu produk |
| `status` | enum | — | `DRAFT` · `PENDING_REVIEW` · `APPROVED` · `REJECTED` · `PUBLISHED` |
| `page` | int ≥1 | 1 | Halaman |
| `limit` | int 1–100 | 50 | Per halaman |

**Respons `200`:**

```json
{
  "statusCode": 200,
  "code": "SUCCESS",
  "message": "Daftar tarif berhasil diambil",
  "data": [
    {
      "id": "01a15280-fdf3-70d1-ae01-3bc91eb61423",
      "productId": "01a15280-fdf3-70d1-ae01-3bb8c5921aa0",
      "name": "Sewa Aula Harian",
      "unit": "DAY",
      "price": 500000,
      "minQty": 1,
      "maxQty": null,
      "startTime": null,
      "endTime": null,
      "status": "APPROVED",
      "effectiveFrom": "2026-10-19T04:52:27.764Z",
      "isActive": true,
      "createdAt": "2026-10-19T04:52:27.764Z",
      "updatedAt": "2026-10-19T04:52:35.954Z"
    }
  ],
  "meta": {
    "page": 1, "limit": 50, "totalItems": 1,
    "totalPages": 1, "hasNextPage": false, "hasPreviousPage": false
  }
}
```

## 2. Detail Tarif

`GET /api/lapak/rates/:id`

**Izin:** `product:read` (lingkup OPD)

**Respons `200`:** `{ envelope, data: RateShape }` · **`404`** bila tidak ditemukan / di luar lingkup.

## 3. Tambah Tarif ke Produk

`POST /api/lapak/rates/product/:productId`

Tarif baru **tidak** mengubah status produk. Status awal mengikuti status produk:
`DRAFT` bila produk `DRAFT`, `PENDING_REVIEW` bila produk sudah `PUBLISHED`.

**Izin:** `product:update` (lingkup OPD)

**Body:**

| Field | Tipe | Wajib | Default | Keterangan |
|---|---|:--:|---|---|
| `name` | string 1–100 | ✅ | — | Nama tarif |
| `unit` | enum | ✅ | — | `HOUR` · `DAY` · `NIGHT` · `SESSION` · `PERSON` · `UNIT` · `PACKAGE` |
| `price` | number ≥0 | ✅ | — | Maks 99.999.999.999 |
| `minQty` | int ≥1 | — | 1 | Kuantitas minimum |
| `maxQty` | int ≥1 \| null | — | null | Kuantitas maksimum |
| `startTime` | `HH:MM` \| null | — | null | Jam mulai (tarif sesi) |
| `endTime` | `HH:MM` \| null | — | null | Jam selesai |
| `effectiveFrom` | ISO datetime \| null | — | sekarang | Mulai berlaku; publik baru melihat setelah tanggal ini |
| `isActive` | boolean | — | true | Nonaktif = tersembunyi dari publik |

**Respons `201`:** `{ envelope, data: RateShape }`

## 4. Ubah Tarif

`PUT /api/lapak/rates/:id`

Hanya tarif **belum disetujui** (`DRAFT`, `PENDING_REVIEW`, `REJECTED`) yang boleh diubah.
Tarif `APPROVED`/`PUBLISHED` ditolak **`409`** — gunakan `/revise`.

**Izin:** `product:update` (lingkup OPD)

**Body:** semua field opsional, minimal satu terisi (nama, unit, price, minQty, maxQty,
startTime, endTime, effectiveFrom, isActive).

**Respons `200`** · **`409`** tarif sudah disetujui.

## 5. Revisi Tarif

`POST /api/lapak/rates/:id/revise`

Merevisi tarif `APPROVED`/`PUBLISHED`: membuat baris baru `PENDING_REVIEW`, baris lama tetap
aktif sampai revisi disetujui, lalu dinonaktifkan otomatis (riwayat harga tetap).

**Izin:** `product:update` (lingkup OPD)

**Body:** field opsional yang ingin diubah (sama seperti `PUT`), minimal satu terisi.

**Respons `200`:** `{ envelope, data: RateShape }` berstatus `PENDING_REVIEW`

## 6. Transisi Status Tarif

`PATCH /api/lapak/rates/:id/status/:action`

`:action` = `submit` \| `approve` \| `reject`

**Izin:** `product:update` untuk `submit`; `product:approve` untuk `approve`;
`product:reject` untuk `reject` — semuanya wajib dalam lingkup OPD.

**Body** (opsional, wajib berisi `note` bila `reject`):

| Field | Tipe | Keterangan |
|---|---|---|
| `note` | string ≤500 | Alasan penolakan |

**Respons `200`:** `{ envelope, data: RateShape }`

**Error:**

| Kode | Kondisi |
|---|---|
| `400` | Transisi tidak sah dari status saat ini; `reject` tanpa `note` |
| `403` | Tidak memegang izin, atau di luar lingkup OPD |
| `404` | Tarif tidak ditemukan |

## 7. Nonaktifkan Tarif

`PATCH /api/lapak/rates/:id/deactivate`

Menyembunyikan tarif dari publik tanpa menghapus riwayat.

**Izin:** `product:update` (lingkup OPD)

**Respons `200`:** `{ envelope, data: RateShape }` dengan `isActive: false`

**`409`** bila tarif ini satu-satunya yang aktif — produk tidak boleh tanpa harga.

## 8. Hapus Tarif

`DELETE /api/lapak/rates/:id`

Soft-delete. Tarif aktif berstatus `APPROVED` ditolak **`409`** (nonaktifkan dulu).

**Izin:** `product:delete` (lingkup OPD)

**Respons `200`:**

```json
{
  "statusCode": 200,
  "code": "SUCCESS",
  "message": "Tarif berhasil dihapus",
  "data": { "id": "01a15280-...", "deleted": true }
}
```
