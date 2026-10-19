# Katalog Publik OPD — `/api/lapak/organizations`

- **Aplikasi:** `lapak-jambi-web` · **Prefix:** `/api/lapak` · **Jumlah endpoint:** 2
- **Sumber kode:** `src/modules/lapak/catalog/catalog.routes.ts`
- **Fase:** 1 (LJ-1.6)

## Ringkasan Endpoint

| Method | Path | Izin | Keterangan |
|---|---|---|---|
| `GET` | `/organizations/:code` | publik | Profil OPD + jumlah produk terbit |
| `GET` | `/organizations/:code/products` | publik | Katalog produk milik OPD (filter + paginasi) |

Halaman SEO `/lapak/opd/:code` di frontend dapat dirender dari dua endpoint ini tanpa
memanggil modul core secara terpisah. Keduanya **tanpa autentikasi** — cukup header
`X-App-Code: lapak-jambi-web`.

> **Mengapa di modul lapak, bukan core?** Responsnya menggabungkan data OPD dengan katalog
> produk. Menaruhnya di `core/organizations` akan memaksa core mengimpor modul lapak —
> coupling terbalik.

## Field Request

| Field | Sumber | Tipe | Keterangan |
|---|---|---|---|
| `code` | param | string 1–50 | Kode OPD, mis. `BPSDM` |
| `page` | query | int ≥1 | Halaman (default 1) |
| `limit` | query | int 1–50 | Per halaman (default 12) |
| `category` | query | string ≤120 | Slug kategori |
| `search` | query | string ≤100 | Cari nama produk |
| `sortBy` | query | enum | `publishedAt` · `name` · `price` |
| `sortOrder` | query | enum | `asc` · `desc` |

## 1. Profil OPD

`GET /api/lapak/organizations/:code`

**Respons `200`:**

```json
{
  "statusCode": 200,
  "code": "SUCCESS",
  "message": "Profil OPD berhasil diambil",
  "data": {
    "code": "BPSDM",
    "name": "Badan Pengembangan Sumber Daya Manusia Provinsi Jambi",
    "shortName": "BPSDM",
    "description": null,
    "address": null,
    "phone": null,
    "email": null,
    "website": null,
    "logoUrl": null,
    "productCount": 0
  }
}
```

**`404`** bila kode tidak dikenal atau OPD non-aktif. Sengaja `404`, bukan katalog kosong:
katalog kosong untuk kode salah akan menyamarkan salah ketik URL di halaman SEO.

`productCount` menghitung produk **PUBLISHED** milik aplikasi lapak saja — OPD bisa punya
produk di aplikasi lain, dan angka ini harus mencerminkan isi katalog itu sendiri.

Field internal (`id`, `isActive`, `parentId`, `createdAt`) tidak pernah dikirim.

## 2. Produk OPD

`GET /api/lapak/organizations/:code/products`

Memakai ulang filter katalog `/api/lapak/products/public` dengan `organization` dipaksa ke
`:code` — klien tidak bisa melebarkan lingkup lewat query.

**Respons `200`:**

```json
{
  "statusCode": 200,
  "code": "SUCCESS",
  "message": "Produk OPD berhasil diambil",
  "data": [
    {
      "id": "01a15280-...",
      "name": "Sewa Aula",
      "slug": "sewa-aula",
      "excerpt": null,
      "coverUrl": null,
      "address": null,
      "pricingUnit": "DAY",
      "startingPrice": 500000,
      "organization": { "code": "BPSDM", "name": "BPSDM" },
      "category": { "name": "Sewa Gedung / Ruangan", "slug": "sewa-gedung-ruangan" }
    }
  ],
  "meta": {
    "page": 1, "limit": 12, "totalItems": 1,
    "totalPages": 1, "hasNextPage": false, "hasPreviousPage": false
  }
}
```

**`404`** kode OPD tidak dikenal · **`400`** bila `sortBy`/`sortOrder` di luar enum.

OPD tanpa produk terbit tetap `200` dengan `data: []` — halaman profilnya masih berguna.
