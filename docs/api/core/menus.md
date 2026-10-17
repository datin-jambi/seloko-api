# Menus

- **Aplikasi:** `seloko` · **Prefix:** `/api/menus` · **Jumlah endpoint:** 8
- **Sumber kode:** `src/modules/core/menus/menus.routes.ts`

Sidebar dinamis per aplikasi. **Path internal wajib berawalan kode aplikasinya**
(`/seloko/...`, `/bapenda/...`, `/lapak/...`) supaya satu frontend super app bisa merutekan tanpa
bentrok.

## Ringkasan Endpoint

| No | Method | Path | Guard | Deskripsi |
|:--:|---|---|---|---|
| 1 | `GET` | `/me` | `authenticate` | Pohon menu pemanggil, sudah tersaring |
| 2 | `GET` | `/` | `application:read` | Daftar CMS: flat berpaginasi atau pohon penuh |
| 3 | `PATCH` | `/reorder` | `application:update` | Urutkan ulang massal |
| 4 | `GET` | `/:id` | `application:read` | Detail + parent/children/permission/roles |
| 5 | `POST` | `/` | `application:update` | Buat menu |
| 6 | `PATCH` | `/:id` | `application:update` | Perbarui menu |
| 7 | `PATCH` | `/:id/activate` | `application:update` | Aktif/nonaktif |
| 8 | `DELETE` | `/:id` | `application:update` | Hapus permanen + cascade |

> `/me` dan `/reorder` didaftarkan **sebelum** `/:id` agar tidak tertangkap rute dinamis.

## Bentuk Objek

| Field | Tipe | Keterangan |
|---|---|---|
| `id` | string | UUID v7 |
| `code` | string | Unik per aplikasi; kunci upsert seeder |
| `label` | string | Teks yang tampil |
| `icon` | string \| null | Nama ikon lucide |
| `path` | string \| null | Kosong = grup parent |
| `isExternal` | boolean | `true` = URL absolut |
| `sortOrder` | integer | Urutan tampil |
| `isActive` | boolean | — |
| `parentId` | string \| null | Hierarki |
| `permissionId` | string \| null | Menu hanya tampil bagi pemegang izin ini |
| `roles[]` | array | Role pembatas; kosong = semua role |

---

## 1. GET /api/menus/me

**Akses:** `authenticate` saja.

### Query Parameter

| Nama | Wajib | Tipe | Aturan | Default | Keterangan |
|---|:--:|---|---|---|---|
| `applicationId` | — | uuid | — | — | Aplikasi target (alternatif `appCode`) |
| `appCode` | — | string | — | `X-App-Code` | Kode aplikasi target |

### Penyaringan (3 lapis)

1. Menu & aplikasi harus aktif.
2. `permissionId` harus dipegang user (kosong = bebas).
3. `menuRoles` harus cocok (kosong = semua role).
4. Grup yang seluruh anaknya tersembunyi ikut disembunyikan.

### Response 200

```json
{
  "success": true, "message": "...",
  "data": {
    "application": { "id": "...", "code": "bapenda-profile", "name": "Bapenda Profile Portal",
                      "baseUrl": "http://localhost:3002", "icon": "globe" },
    "menus": [{
      "id": "...", "code": "konten", "label": "Konten", "icon": "newspaper",
      "path": null, "isExternal": false,
      "children": [{
        "id": "...", "code": "konten.berita", "label": "Berita",
        "icon": "file-text", "path": "/bapenda/berita", "isExternal": false, "children": []
      }]
    }]
  }
}
```

---

## 2. GET /api/menus

**Akses:** `authenticate` + `application:read`.

### Query Parameter

| Nama | Wajib | Tipe | Aturan | Default | Keterangan |
|---|:--:|---|---|---|---|
| `page` | — | integer | ≥ 1 | `1` | Diabaikan saat `tree=true` |
| `limit` | — | integer | 1–200 | `50` | Diabaikan saat `tree=true` |
| `applicationId` | — | uuid | — | — | Batasi ke satu aplikasi |
| `parentId` | — | string | UUID **atau** literal `root` | — | `root` = menu tingkat atas |
| `isActive` | — | string | `"true"` \| `"false"` | — | Filter status |
| `search` | — | string | — | — | Cari di `label` dan `code` |
| `tree` | — | string | `"true"` | — | `true` → pohon hierarki penuh, `meta` tidak dikirim |

### Response 200

- Mode flat: `data[]` bentuk objek + `meta` paginasi.
- Mode `tree=true`: `data[]` berupa node bersarang (`children[]`), **tanpa** `meta`.

```json
{
  "success": true, "message": "...",
  "data": [{ "id": "...", "code": "konten", "label": "Konten", "icon": "newspaper",
             "path": null, "isExternal": false, "sortOrder": 2, "isActive": true,
             "parentId": null, "permissionId": null,
             "children": [] }],
  "meta": { "page": 1, "limit": 50, "total": 14, "totalPages": 1, "hasNextPage": false, "hasPreviousPage": false }
}
```

---

## 3. PATCH /api/menus/reorder

**Akses:** `authenticate` + `application:update`.

### Request Body

| Field | Wajib | Tipe | Aturan | Keterangan |
|---|:--:|---|---|---|
| `applicationId` | ✓ | uuid | — | Lingkup aplikasi |
| `items` | ✓ | array | minimal 1 item | — |
| `items[].id` | ✓ | uuid | — | Menu yang diubah |
| `items[].sortOrder` | ✓ | integer | — | Posisi baru |
| `items[].parentId` | — | uuid \| null | tidak boleh membentuk siklus | `null` = jadikan root |

```json
{
  "applicationId": "<uuid>",
  "items": [
    { "id": "<uuid a>", "sortOrder": 1 },
    { "id": "<uuid b>", "sortOrder": 2, "parentId": "<uuid a>" }
  ]
}
```

**Response 200:** `{ success: true, message: "...", data: { updatedCount: 2 } }`
**Error:** `400` ada item yang membentuk hierarki melingkar.

---

## 4. GET /api/menus/:id

**Akses:** `authenticate` + `application:read`.

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `id` | ✓ | uuid | — |

### Response 200

Field objek + tambahan:

| Field | Tipe | Keterangan |
|---|---|---|
| `parent` | object \| null | `{ id, code, label }` |
| `children[]` | array | Sub-menu langsung |
| `permission` | object \| null | `{ id, code }` |
| `roles[]` | array | `{ id, name }` pembatas |

**Error:** `404`.

---

## 5. POST /api/menus

**Akses:** `authenticate` + `application:update`.

### Request Body

| Field | Wajib | Tipe | Aturan | Default | Nullable | Keterangan |
|---|:--:|---|---|---|:--:|---|
| `applicationId` | ✓ | uuid | — | — | — | Aplikasi pemilik |
| `code` | ✓ | string | unik per aplikasi | — | — | Kunci upsert; **jangan diubah** |
| `label` | ✓ | string | 1–100 | — | — | — |
| `parentId` | — | uuid | harus menu aplikasi yang sama | — | ✓ | Kosong = root |
| `icon` | — | string | ≤50 | — | ✓ | Nama ikon lucide |
| `path` | — | string | ≤255; internal wajib berawalan `/seloko`\|`/bapenda`\|`/lapak` | — | ✓ | Kosong = grup parent |
| `isExternal` | — | boolean | — | `false` | — | `true` → `path` URL absolut |
| `sortOrder` | — | integer | — | `0` | — | — |
| `isActive` | — | boolean | — | `true` | — | — |
| `permissionId` | — | uuid | harus permission aplikasi yang sama | — | ✓ | — |
| `roleIds` | — | uuid[] | harus role aplikasi yang sama | `[]` | — | Kosong = semua role |

```json
{
  "applicationId": "<uuid lapak-jambi-web>",
  "code": "katalog.produk",
  "label": "Produk & Layanan",
  "icon": "package",
  "path": "/lapak/produk",
  "permissionId": "<uuid product:list>",
  "sortOrder": 2
}
```

**Response 201:** bentuk detail menu.
**Error:** `409` kode sudah dipakai di aplikasi itu · `400` path tidak berawalan benar.

---

## 6. PATCH /api/menus/:id

**Akses:** `authenticate` + `application:update`.

### Path Parameter

| Nama | Wajib | Tipe |
|---|:--:|---|
| `id` | ✓ | uuid |

### Request Body

Semua field `POST` **kecuali `applicationId` dan `code`** (keduanya tidak dapat diubah).

| Field | Wajib | Tipe | Nullable | Keterangan |
|---|:--:|---|:--:|---|
| `label` | — | string (1–100) | — | — |
| `parentId` | — | uuid | ✓ | `null` = jadikan root |
| `icon` | — | string ≤50 | ✓ | — |
| `path` | — | string ≤255 | ✓ | — |
| `isExternal` | — | boolean | — | — |
| `sortOrder` | — | integer | — | — |
| `isActive` | — | boolean | — | — |
| `permissionId` | — | uuid | ✓ | `null` = lepas proteksi |
| `roleIds` | — | uuid[] | — | Mengganti seluruh role pembatas bila dikirim |

**Response 200:** bentuk detail menu.

---

## 7. PATCH /api/menus/:id/activate

**Akses:** `authenticate` + `application:update`.

### Request Body

| Field | Wajib | Tipe |
|---|:--:|---|
| `isActive` | ✓ | boolean |

**Response 200:**

```json
{ "success": true, "message": "...", "data": { "id": "...", "code": "konten.berita", "label": "Berita", "isActive": false } }
```

---

## 8. DELETE /api/menus/:id

**Akses:** `authenticate` + `application:update`.

### Path Parameter

| Nama | Wajib | Tipe |
|---|:--:|---|
| `id` | ✓ | uuid |

**Perilaku:** hapus **permanen**; seluruh sub-menu ikut terhapus (cascade).

### Response 200

```json
{ "success": true, "message": "...", "data": { "id": "...", "code": "konten", "label": "Konten", "deletedChildrenCount": 3 } }
```

---

## Catatan Perilaku

- Sumber seed: `prisma/seeds/core/menus.json`. `code` adalah kunci upsert — ubah `label` sesuka
  hati, **jangan ubah `code`**.
- `path` relatif digabung dengan `Application.baseUrl` saat frontend merender tautan, jadi menu
  Bapenda `/bapenda/berita` menjadi `http://localhost:3002/bapenda/berita`.
- Pengecekan awalan path diuji otomatis: `prisma/smoke/menus.check.ts` (22 pemeriksaan).
- Tautan eksternal (`isExternal: true`) dikecualikan dari aturan awalan.
