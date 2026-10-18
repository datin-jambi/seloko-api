# Kategori Layanan (Lapak)

- **Aplikasi:** `lapak-jambi-web` · **Prefix:** `/api/lapak/categories` · **Jumlah endpoint:** 9
- **Sumber kode:** `src/modules/lapak/categories/categories.routes.ts`
- **Permulaan:** `X-App-Code: lapak-jambi-web` untuk endpoint publik; CMS diakses pegawai
  lewat gateway `seloko` (izin dibaca dari aplikasi pemilik).

Master kategori layanan aset daerah (PRD 04 §3). **Dikelola Bapenda saja** — admin OPD hanya
MEMILIH kategori ini saat membuat produk (LJ-1.2), tidak pernah membuat sendiri.
Guard CMS memakai `category:*` milik aplikasi Lapak; role `admin-opd`/`manajer-opd`/`petugas-lokasi`
sengaja **tidak** memegang entity `category`.

## Ringkasan Endpoint

| No | Method | Path | Guard | Deskripsi |
|:--:|---|---|---|---|
| 1 | `GET` | `/public` | publik | Daftar kategori aktif untuk portal |
| 2 | `GET` | `/public/:slug` | publik | Detail via slug |
| 3 | `GET` | `/` | `category:list` | Daftar CMS berpaginasi |
| 4 | `GET` | `/:id` | `category:read` | Detail CMS |
| 5 | `POST` | `/` | `category:create` | Tambah |
| 6 | `PATCH` | `/reorder` | `category:update` | Urutkan ulang massal |
| 7 | `PUT` | `/:id` | `category:update` | Perbarui |
| 8 | `PATCH` | `/:id/active` | `category:update` | Aktif/nonaktif |
| 9 | `DELETE` | `/:id` | `category:delete` | Soft-delete |

> `/reorder` dan `/public/:slug` didaftarkan **sebelum** `/:id`.

## Bentuk Objek

| Field | Tipe | Keterangan |
|---|---|---|
| `id`, `applicationId` | string | UUID |
| `name` | string | 2–100 |
| `slug` | string | URL publik, unik per aplikasi |
| `description` | string \| null | ≤500 |
| `icon` | string \| null | Nama ikon lucide |
| `sortOrder` | integer | 0–9999 |
| `isActive` | boolean | — |
| `defaultPricingUnit` | enum \| null | `SESSION` `HOUR` `DAY` `NIGHT` `MONTH` `YEAR` `PERSON` `UNIT` `M2` `TEST` `TRIP` |
| `defaultAvailabilityType` | enum \| null | `SLOT` `DATE_RANGE` `CONTRACT` `STOCK` `SCHEDULE` |
| `defaultFulfillmentType` | enum \| null | `TICKET_QR` `BOOKING` `CONTRACT` `SCHEDULE` `RESULT` `DOCUMENT_SKRD` |
| `createdAt`, `updatedAt` | string | ISO 8601 |

Tiga kolom `default*` adalah **nilai bawaan yang diwarisi produk baru** pada kategori itu
(keputusan "satu model Produk", PRD 04 §3). `null` berarti OPD wajib memilih sendiri.

---

## 1. GET /api/lapak/categories/public

**Akses:** publik.

### Query Parameter

| Nama | Wajib | Tipe | Aturan | Keterangan |
|---|:--:|---|---|---|
| `search` | — | string | ≤100 karakter | Cari di `name` / `description` |

Hanya kategori `isActive: true`. Urut `sortOrder ASC` lalu `name ASC`. Tanpa paginasi (8 kategori).

### Response 200

```json
{
  "statusCode": 200, "code": "SUCCESS", "message": "Daftar kategori berhasil diambil",
  "data": [
    { "id": "01…", "name": "Sewa Gedung / Ruangan", "slug": "sewa-gedung-ruangan",
      "description": "Aula, auditorium, ruang rapat…", "icon": "building-2" }
  ]
}
```

Objek publik hanya 5 field — tanpa `isActive`, `sortOrder`, `default*`, dan waktu.

---

## 2. GET /api/lapak/categories/public/:slug

**Akses:** publik.

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `slug` | ✓ | string | 2–120 |

**Response 200:** shape ringkas sama dengan daftar publik.
**Error:** `404` slug tidak ada atau nonaktif.

---

## 3. GET /api/lapak/categories

**Akses:** `authenticate` + `category:list` (aplikasi `lapak-jambi-web`).

### Query Parameter

| Nama | Wajib | Tipe | Aturan | Default | Keterangan |
|---|:--:|---|---|---|---|
| `page` | — | integer | ≥ 1 | `1` | — |
| `limit` | — | integer | 1–100 | `20` | — |
| `search` | — | string | ≤100 karakter | — | `name`, `slug`, `description` |
| `isActive` | — | string | `"true"` \| `"false"` | — | Filter status |
| `sortBy` | — | enum | `sortOrder` \| `name` \| `createdAt` | `sortOrder` | — |
| `sortOrder` | — | enum | `asc` \| `desc` | `asc` | — |

**Response 200:** `data[]` (objek penuh) + `meta`.

---

## 4. GET /api/lapak/categories/:id

**Akses:** `authenticate` + `category:read`.

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `id` | ✓ | uuid | — |

**Response 200:** satu objek penuh. **Error:** `404`.

---

## 5. POST /api/lapak/categories

**Akses:** `authenticate` + `category:create`.

### Request Body

| Field | Wajib | Tipe | Aturan | Default | Nullable |
|---|:--:|---|---|---|:--:|
| `name` | ✓ | string | 2–100 | — | — |
| `slug` | — | string | 2–120, `^[a-z0-9]+(-[a-z0-9]+)*$` | dari `name` | — |
| `description` | — | string | ≤500 | — | ✓ |
| `icon` | — | string | ≤50 | — | ✓ |
| `sortOrder` | — | integer | 0–9999 | `0` | — |
| `isActive` | — | boolean | — | `true` | — |
| `defaultPricingUnit` | — | enum | lihat tabel objek | — | ✓ |
| `defaultAvailabilityType` | — | enum | lihat tabel objek | — | ✓ |
| `defaultFulfillmentType` | — | enum | lihat tabel objek | — | ✓ |

```json
{
  "name": "Sewa Tenda & Perlengkapan",
  "description": "Sewa tenda, kursi, dan sound system.",
  "icon": "tent",
  "defaultPricingUnit": "DAY",
  "defaultAvailabilityType": "STOCK",
  "defaultFulfillmentType": "SCHEDULE"
}
```

**Response 201:** objek penuh.
**Error:** `400` slug dari body tidak sesuai format · `409` slug sudah dipakai kategori aktif.

**Slug sebagai URL publik:** bentrok ditolak, tidak diberi akhiran `-2` (keputusan sama dengan
modul pages). Slug milik kategori yang sudah di-soft-delete **dihidupkan kembali** — konsisten
dengan perilaku seeder.

---

## 6. PATCH /api/lapak/categories/reorder

**Akses:** `authenticate` + `category:update`.

### Request Body

| Field | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `items` | ✓ | array | minimal 1 |
| `items[].id` | ✓ | uuid | semua harus milik aplikasi ini |
| `items[].sortOrder` | ✓ | integer | 0–9999 |

```json
{ "items": [{ "id": "<uuid a>", "sortOrder": 1 }, { "id": "<uuid b>", "sortOrder": 2 }] }
```

**Response 200:** `data: { updated: <jumlah> }`.
**Error:** `400` ada id yang bukan milik aplikasi ini / tidak ditemukan.

---

## 7. PUT /api/lapak/categories/:id

**Akses:** `authenticate` + `category:update`.

### Path Parameter

| Nama | Wajib | Tipe |
|---|:--:|---|
| `id` | ✓ | uuid |

### Request Body

Semua field `POST` menjadi opsional, minimal satu. `null` pada `default*` / `description` /
`icon` mengosongkan.

**Response 200:** objek penuh. **Error:** `404` · `409` slug bentrok dengan kategori lain.

---

## 8. PATCH /api/lapak/categories/:id/active

**Akses:** `authenticate` + `category:update`.

### Request Body

| Field | Wajib | Tipe |
|---|:--:|---|
| `isActive` | ✓ | boolean |

**Response 200:** objek penuh. Menonaktifkan menyembunyikan kategori dari portal, **tanpa**
menghapusnya — produk yang mengacu tetap ada (LJ-1.2).

---

## 9. DELETE /api/lapak/categories/:id

**Akses:** `authenticate` + `category:delete`.

### Path Parameter

| Nama | Wajib | Tipe |
|---|:--:|---|
| `id` | ✓ | uuid |

**Perilaku:** soft-delete + `isActive: false`.

**Response 200:** `{ statusCode, code, message, data: { id, deleted: true } }`

---

## Catatan Perilaku

- Seed 8 kategori (`prisma/seeds/lapak/categories.json`) sesuai infografis proposal PRD 04 §3.
- SKU kecil di DB: `default*` disimpan VARCHAR longgar (bukan enum Postgres) agar menambah jenis
  tarif tidak butuh migrasi; kontrak tetap ketat lewat Zod.
- Kategori yang masih dipakai produk nanti **tidak boleh** dihapus — penjaga `409` ditambahkan
  di LJ-1.2 begitu model `LapakProduct` ada (TODO di service).
- `/lapak/objek-retribusi` dan `/lapak/pengaturan-skrd` di menu belum punya endpoint — menyusul.
