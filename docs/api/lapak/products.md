# Produk / Aset Katalog (Lapak)

- **Aplikasi:** `lapak-jambi-web` · **Prefix:** `/api/lapak/products` · **Jumlah endpoint:** 8
- **Sumber kode:** `src/modules/lapak/products/products.routes.ts`
- **Lingkup OPD:** CMS menyaring otomatis dari `user_app_role_organizations`. Bapenda
  (tanpa baris lingkup / superadmin) melihat semua OPD; admin-opd hanya OPD-nya; upaya
  menyentuh produk OPD lain → `403`.

Satu model untuk seluruh jenis aset (PRD 04 §3). Tiga atribut (`pricingUnit`,
`availabilityType`, `fulfillmentType`) **diwarisi nilai bawaan kategori** bila tidak dikirim.

## Ringkasan Endpoint

| No | Method | Path | Guard | Deskripsi |
|:--:|---|---|---|---|
| 1 | `GET` | `/public` | publik | Katalog publik + filter & paginasi |
| 2 | `GET` | `/public/:slug` | publik | Detail untuk halaman katalog |
| 3 | `GET` | `/` | `product:list` | Daftar CMS (tersaring OPD) |
| 4 | `GET` | `/:id` | `product:read` | Detail CMS |
| 5 | `POST` | `/` | `product:create` | Tambah (DRAFT) + anak-anak |
| 6 | `PUT` | `/:id` | `product:update` | Perbarui + replace-set anak |
| 7 | `PATCH` | `/:id/status/:action` | `product:read` + izin aksi | Alur persetujuan |
| 8 | `DELETE` | `/:id` | `product:delete` | Soft-delete |

> `/public/:slug` didaftarkan sebelum `/:id`.

## Alur Status

```text
DRAFT ──submit──► PENDING_REVIEW ──approve──► APPROVED ──publish──► PUBLISHED
  ▲                    │                                              │
  └────unpublish───────┴──reject──► REJECTED ──submit──► PENDING_REVIEW
DRAFT ──publish──► PUBLISHED
```

| Aksi | Dari | Izin |
|---|---|---|
| `submit` | `DRAFT`, `REJECTED` | cukup `product:read` (penulis) |
| `approve` | `PENDING_REVIEW` | `product:approve` |
| `reject` | `PENDING_REVIEW` | `product:reject` |
| `publish` | `DRAFT`, `APPROVED` | `product:publish` (manajer-opd/Bapenda) |
| `unpublish` | `PUBLISHED` | `product:publish` |

## Bentuk Objek (CMS)

| Field | Tipe | Keterangan |
|---|---|---|
| `id`, `applicationId`, `organizationId`, `categoryId` | string | UUID |
| `retributionObjectId` | string \| null | Wajib penuh saat LJ-2 (SKRD) |
| `name`, `slug` | string | Slug unik per aplikasi |
| `excerpt` | string \| null | ≤1000 |
| `description` | string | ≥10 |
| `address`, `latitude`, `longitude` | — | Lokasi aset |
| `capacity`, `areaM2` | int \| null | Orang / m² |
| `pricingUnit` | enum | `SESSION` `HOUR` `DAY` `NIGHT` `MONTH` `YEAR` `PERSON` `UNIT` `M2` `TEST` `TRIP` |
| `availabilityType` | enum | `SLOT` `DATE_RANGE` `CONTRACT` `STOCK` `SCHEDULE` |
| `fulfillmentType` | enum | `TICKET_QR` `BOOKING` `CONTRACT` `SCHEDULE` `RESULT` `DOCUMENT_SKRD` |
| `status` | enum | `ContentStatus` (sama dengan artikel) |
| `publishedAt` | string \| null | Diisi saat publish, dikosongkan saat unpublish |
| `coverUrl`, `coverFileId` | — | Sampul |
| `organization` | object | `{ id, code, name }` |
| `category` | object | `{ id, name, slug }` |
| `rates` | array | Tarif — `id,name,unit,price,minQty,maxQty,startTime,endTime,status,effectiveFrom,isActive` |
| `addons` | array | `{ id,name,unit,price,isActive }` |
| `requirements` | array | `{ id,label,fieldType,options,isRequired,sortOrder }` |
| `facilities` | array | `{ id,name,icon }` |
| `images` | array | `{ id,url,fileId,altText,isPrimary,sortOrder }` |
| `createdAt`, `updatedAt` | string | ISO 8601 |

## Media Produk (LJ-1.5)

Gambar produk disimpan sebagai baris `lapak_product_images` (`url`, `fileId`, `altText`,
`isPrimary`, `sortOrder`). Berkas fisik diunggah lebih dulu lewat modul core:

`POST /api/storage/upload?module=lapak&subFolder=products` → `{ url, fileId }`, lalu `fileId`
dan `url` itu dimasukkan ke `images[]` saat create/update produk.

**Aturan `isPrimary` — dinormalisasi server:**

| Kondisi kiriman | Hasil |
|---|---|
| 0 gambar | `images: []`, `coverUrl` tetap seperti dikirim |
| 1+ bertanda `isPrimary: true` | **Hanya satu** yang dipakai — yang `sortOrder` terkecil |
| Tidak ada yang bertanda | Gambar `sortOrder` terkecil **diangkat otomatis** |
| `coverUrl` tidak diisi | Diisi otomatis dari URL gambar primer |

Normalisasi bersifat **menurunkan**, bukan menolak: klien yang mengirim semua `true`
(mis. UI dengan checkbox tercentang semua) tetap mendapat hasil wajar `201`/`200`.

**Fasilitas** (`lapak_product_facilities`: `name`, `icon`) bersifat dekoratif — daftar
ikon Lucide opsional, tidak memengaruhi harga maupun ketersediaan.

## Aturan Edit & Hapus

- Hanya `DRAFT` / `REJECTED` yang boleh diedit — produk lain ditolak `403` ("unpublish dahulu").
- Produk `PUBLISHED` tidak boleh dihapus — `409`.

---

## 1. GET /api/lapak/products/public

**Akses:** publik.

### Query Parameter

| Nama | Wajib | Tipe | Aturan | Default | Keterangan |
|---|:--:|---|---|---|---|
| `page` | — | integer | ≥ 1 | `1` | — |
| `limit` | — | integer | 1–50 | `12` | — |
| `search` | — | string | ≤100 | — | `name`, `description`, `address` |
| `category` | — | string | ≤120 | — | **Slug** kategori |
| `organization` | — | string | ≤50 | — | **Kode** OPD (mis. `BPSDM`) |
| `minPrice` | — | number | ≥ 0 | — | Filter tarif termurah ≥ |
| `maxPrice` | — | number | ≥ 0 | — | Filter tarif termurah ≤ |
| `sortBy` | — | enum | `publishedAt` \| `name` \| `price` | `publishedAt` | — |
| `sortOrder` | — | enum | `asc` \| `desc` | `desc` | — |

Hanya `status: PUBLISHED`. `startingPrice` = tarif aktif termurah.

**Response 200:** kartu ringkas — `id,name,slug,excerpt,coverUrl,address,pricingUnit,startingPrice,organization{code,name},category{name,slug}` + `meta`.

---

## 2. GET /api/lapak/products/public/:slug

**Akses:** publik.

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `slug` | ✓ | string | 2–180 |

**Response 200:** detail lengkap termasuk `rates` (tanpa `status`), `addons`, `requirements`, `facilities`, `images`. **Error:** `404`.

---

## 3. GET /api/lapak/products

**Akses:** `authenticate` + `product:list`. Hasil otomatis tersaring lingkup OPD.

### Query Parameter

| Nama | Wajib | Tipe | Aturan | Default | Keterangan |
|---|:--:|---|---|---|---|
| `page` | — | integer | ≥ 1 | `1` | — |
| `limit` | — | integer | 1–100 | `20` | — |
| `search` | — | string | ≤100 | — | — |
| `organizationId` | — | uuid | — | — | Filter OPD (Bapenda) |
| `categoryId` | — | uuid | — | — | Filter kategori |
| `status` | — | enum | `DRAFT`…`PUBLISHED` | — | — |
| `sortBy` | — | enum | `createdAt` \| `updatedAt` \| `name` \| `publishedAt` | `updatedAt` | — |
| `sortOrder` | — | enum | `asc` \| `desc` | `desc` | — |

**Response 200:** `data[]` objek penuh + `meta`.

---

## 4. GET /api/lapak/products/:id

**Akses:** `authenticate` + `product:read`. Produk di luar lingkup → `403`.

---

## 5. POST /api/lapak/products

**Akses:** `authenticate` + `product:create`. `organizationId` harus dalam lingkup.

### Request Body

| Field | Wajib | Tipe | Aturan | Default | Nullable | Keterangan |
|---|:--:|---|---|---|:--:|---|
| `organizationId` | ✓ | uuid | OPD aktif | — | — | — |
| `categoryId` | ✓ | uuid | Kategori aktif | — | — | — |
| `name` | ✓ | string | 3–150 | — | — | — |
| `slug` | — | string | 2–180, kebab-case | dari `name` | — | Bentrok → `409` |
| `excerpt` | — | string | ≤1000 | — | ✓ | — |
| `description` | ✓ | string | ≥10 | — | — | — |
| `address` | — | string | ≤255 | — | ✓ | — |
| `latitude` | — | number | −90…90 | — | ✓ | — |
| `longitude` | — | number | −180…180 | — | ✓ | — |
| `capacity` | — | integer | ≥ 1 | — | ✓ | — |
| `areaM2` | — | integer | ≥ 1 | — | ✓ | — |
| `pricingUnit` | — | enum \| null | — | bawaan kategori | ✓ | `null` = fallback kategori |
| `availabilityType` | — | enum \| null | — | bawaan kategori | ✓ | idem |
| `fulfillmentType` | — | enum \| null | — | bawaan kategori | ✓ | idem |
| `coverUrl` | — | string | URL | otomatis dari gambar primer | ✓ | — |
| `coverFileId` | — | string | ≤100 | — | ✓ | — |
| `rates` | — | array | maks 50 | `[]` | — | `id?` ada = (di update) perbarui |
| `addons` | — | array | maks 50 | `[]` | — | — |
| `requirements` | — | array | maks 30 | `[]` | — | `options` wajib bila `SELECT`, dan **hanya** boleh pada `SELECT` |
| `facilities` | — | array | maks 50 | `[]` | — | — |
| `images` | — | array | maks 20 | `[]` | — | `isPrimary` dinormalisasi: tepat satu per produk |

Bila kategori tidak punya bawaan lengkap dan atribut tidak dikirim → `400` dengan pesan eksplisit.

**Response 201:** objek penuh, `status: "DRAFT"`.

---

## 6. PUT /api/lapak/products/:id

**Akses:** `authenticate` + `product:update`. Semua field `POST` opsional (minimal satu).

**Anak-anak bersifat replace-set**: item dengan `id` diperbarui, tanpa `id` dibuat baru, dan yang
ada di DB tapi tidak dikirim di-soft-delete.

**Response 200:** objek penuh.

---

## 7. PATCH /api/lapak/products/:id/status/:action

**Akses:** `authenticate` + `product:read`; izin aksi diperiksa di service (`approve`/`reject`/`publish`) — dalam lingkup OPD.

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `id` | ✓ | uuid | — |
| `action` | ✓ | enum | `submit` \| `approve` \| `reject` \| `publish` \| `unpublish` |

**Perilaku:** `publishedAt` diisi saat publish, dikosongkan saat unpublish.

**Response 200:** objek penuh.
**Error:** `400` transisi tidak sah · `403` izin kurang / di luar lingkup.

---

## 8. DELETE /api/lapak/products/:id

**Akses:** `authenticate` + `product:delete`.

**Response 200:** `{ id, deleted: true }`. **Error:** `403` di luar lingkup · `409` masih terbit.

---

## Catatan Perilaku

- Produk yang di-soft-delete **tidak** lagi menghalangi penghapusan kategorinya (hitungan penjaga hanya produk aktif).
- Tarif menyimpan status sendiri (`ContentStatus`) — PRD 04 §C: mengubah tarif produk terbit tidak menurunkan produk. Saat ini tarif yang dibuat bersama produk ber-status `DRAFT` dan tetap tampil di publik; pengetatan jadi `APPROVED`+ dilakukan di LJ-2 bersama alur tarif terpisah.
- Urutan tarif publik: harga termurah dulu; `startingPrice` dihitung dari baris pertama itu.
- Sort `price` di katalog dilakukan di memori (post-paginasi) — jumlah kartu kecil; bila katalog membesar, ganti ke orderBy agregat.
