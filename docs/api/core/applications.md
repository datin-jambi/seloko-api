# Applications

- **Aplikasi:** `seloko` · **Prefix:** `/api/applications` · **Jumlah endpoint:** 8
- **Sumber kode:** `src/modules/core/applications/applications.routes.ts`

Tenant aplikasi ekosistem SELOKO. `code` dipakai sebagai header `X-App-Code`. `audience` dan
`code` bersifat **final** setelah dibuat.

## Ringkasan Endpoint

| No | Method | Path | Guard | Deskripsi |
|:--:|---|---|---|---|
| 1 | `GET` | `/` | `application:list` | Daftar + `counts` entitas turunan |
| 2 | `GET` | `/public-config/:code` | **publik** | Bootstrap frontend (branding, kontak, SEO) |
| 3 | `GET` | `/me` | `authenticate` | Aplikasi milik pemanggil — launcher super app |
| 4 | `GET` | `/:id` | `application:read` | Detail + roles + permission per modul |
| 5 | `POST` | `/` | `application:create` | Daftarkan aplikasi |
| 6 | `PATCH` | `/:id` | `application:update` | Perbarui metadata/branding/settings |
| 7 | `PATCH` | `/:id/activate` | `application:update` | Aktif/nonaktif |
| 8 | `DELETE` | `/:id` | `application:delete` | Hapus permanen (cascade) |

> Urutan rute penting: `/public-config/:code` dan `/me` didaftarkan **sebelum** `/:id`.

---

## 1. GET /api/applications

**Akses:** `authenticate` + `application:list` (aplikasi `seloko`).

### Query Parameter

| Nama | Wajib | Tipe | Aturan | Default | Keterangan |
|---|:--:|---|---|---|---|
| `page` | — | integer | ≥ 1 | `1` | — |
| `limit` | — | integer | 1–100 | `20` | — |
| `search` | — | string | ≤100 karakter | — | Cari di `code` dan `name` |
| `audience` | — | enum | `INTERNAL` \| `PUBLIC` | — | Filter jenis audiens |
| `isActive` | — | string | `"true"` \| `"false"` | — | Filter status |

**Urutan:** `code ASC` (tetap).

### Response 200

| Field | Tipe | Keterangan |
|---|---|---|
| `id`, `code`, `name` | string | — |
| `tagline`, `description` | string \| null | — |
| `baseUrl` | string \| null | Pangkal URL; `path` menu digabung ke sini |
| `icon` | string \| null | Nama ikon launcher |
| `audience` | enum | `INTERNAL` \| `PUBLIC` |
| `logoUrl` / `logoFileId` | string \| null | ImageKit |
| `logoDarkUrl` / `logoDarkFileId` | string \| null | Varian tema gelap |
| `faviconUrl` / `faviconFileId` | string \| null | — |
| `ogImageUrl` / `ogImageFileId` | string \| null | Open Graph |
| `settings` | object | `{ branding, contact, seo, features, legal }` |
| `isActive` | boolean | — |
| `createdAt`, `updatedAt` | string | ISO 8601 |
| `counts` | object | `{ permissions, roles, menuItems, userAppRoles }` |

```json
{
  "success": true, "message": "Daftar aplikasi berhasil diambil",
  "data": [{
    "id": "...", "code": "bapenda-profile", "name": "Bapenda Profile Portal",
    "tagline": null, "description": "Portal resmi Bapenda",
    "baseUrl": "http://localhost:3002", "icon": "globe", "audience": "PUBLIC",
    "logoUrl": "https://cdn.../lapak.png", "logoFileId": "abc", "logoDarkUrl": null, "logoDarkFileId": null,
    "faviconUrl": null, "faviconFileId": null, "ogImageUrl": null, "ogImageFileId": null,
    "settings": { "branding": {}, "contact": {}, "seo": {}, "features": {} },
    "isActive": true, "createdAt": "...", "updatedAt": "...",
    "counts": { "permissions": 34, "roles": 5, "menuItems": 9, "userAppRoles": 12 }
  }],
  "meta": { "page": 1, "limit": 20, "total": 5, "totalPages": 1, "hasNextPage": false, "hasPreviousPage": false }
}
```

---

## 2. GET /api/applications/public-config/:code

**Akses:** **publik** — tanpa token. Header `X-App-Code` tetap wajib.

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `code` | ✓ | string | 2–50 |

### Response 200

Hanya field yang aman untuk publik:

| Field | Tipe |
|---|---|
| `code`, `name`, `tagline`, `description`, `baseUrl`, `icon` | string / null |
| `audience` | enum |
| `logoUrl`, `logoDarkUrl`, `faviconUrl`, `ogImageUrl` | string \| null |
| `settings` | object (`branding`, `contact`, `seo`, `features`) |

**Tidak** memuat: role, permission, pengguna, `counts`, timestamp.

**Error:** `404` kode tidak ada atau aplikasi nonaktif.

---

## 3. GET /api/applications/me

**Akses:** `authenticate` saja (tanpa izin) — isinya milik pemanggil, dipakai merender launcher.

### Query Parameter

Tidak ada.

### Response 200

| Field | Tipe | Keterangan |
|---|---|---|
| `id`, `code`, `name`, `tagline`, `description` | string | — |
| `baseUrl`, `icon`, `logoUrl`, `logoDarkUrl`, `faviconUrl` | string \| null | — |
| `roles` | string[] | Nama role di aplikasi itu; **kosong untuk super admin** (bypass) |
| `expiresAt` | string \| null | Kapan akses hilang; `null` = permanen |

```json
{
  "success": true, "message": "Daftar aplikasi Anda berhasil diambil",
  "data": [{
    "id": "...", "code": "lapak-jambi-web", "name": "Lapak Jambi Web",
    "tagline": "...", "description": "...", "baseUrl": "http://localhost:3003",
    "icon": "shopping-bag", "logoUrl": "...", "logoDarkUrl": null, "faviconUrl": null,
    "roles": ["admin-opd"], "expiresAt": null
  }]
}
```

`isSuperAdmin` melihat seluruh aplikasi **aktif**.

---

## 4. GET /api/applications/:id

**Akses:** `authenticate` + `application:read`.

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `id` | ✓ | uuid | — |

### Response 200

Field aplikasi + `counts` + tambahan:

| Field | Tipe | Keterangan |
|---|---|---|
| `roles[]` | array | `{ id, name, description, audience, isSystemRole, isActive, permissionCount }` |
| `permissionsByModule[]` | array | `{ module, permissions: [{ id, code, name }] }` |

**Error:** `400` id bukan UUID · `404`.

---

## 5. POST /api/applications

**Akses:** `authenticate` + `application:create`.

### Request Body

| Field | Wajib | Tipe | Aturan | Default | Nullable | Keterangan |
|---|:--:|---|---|---|:--:|---|
| `code` | ✓ | string | 2–50, `^[a-z0-9_-]+$`, unik | — | — | **Final**; dipakai sebagai `X-App-Code` |
| `name` | ✓ | string | 2–100 | — | — | — |
| `audience` | ✓ | enum | `INTERNAL` \| `PUBLIC` | — | — | **Final** setelah dibuat |
| `tagline` | — | string | ≤150 | — | ✓ | — |
| `description` | — | string | ≤500 | — | ✓ | — |
| `baseUrl` | — | string | URL valid, ≤255 | — | ✓ | — |
| `icon` | — | string | ≤50 | — | ✓ | — |
| `logoUrl` | — | string | URL valid, ≤255 | — | ✓ | — |
| `logoFileId` | — | string | ≤100 | — | ✓ | — |
| `logoDarkUrl` | — | string | URL valid, ≤255 | — | ✓ | — |
| `logoDarkFileId` | — | string | ≤100 | — | ✓ | — |
| `faviconUrl` | — | string | URL valid, ≤255 | — | ✓ | — |
| `faviconFileId` | — | string | ≤100 | — | ✓ | — |
| `ogImageUrl` | — | string | URL valid, ≤255 | — | ✓ | — |
| `ogImageFileId` | — | string | ≤100 | — | ✓ | — |
| `settings` | — | object | `.strict()` — key asing ditolak | `{}` | — | Lihat tabel `settings` |
| `isActive` | — | boolean | — | `true` | — | — |

### Struktur `settings`

| Sub-objek | Field | Tipe | Aturan |
|---|---|---|---|
| `branding` | `shortName` | string | ≤50 |
| | `primaryColor` | string | hex 6 digit `#RRGGBB` |
| `contact` | `email` | string \| null | email valid, ≤100 |
| | `phone`, `whatsapp` | string \| null | ≤30 |
| | `address` | string \| null | ≤255 |
| | `googleMapsUrl` | string \| null | URL valid, ≤500 |
| | `workingHours` | string \| null | ≤100 |
| | `socialMedia` | object \| null | `instagram`, `facebook`, `youtube`, `twitter`, `tiktok` (URL ≤255) |
| `seo` | `titleTemplate`, `metaTitle` | string \| null | ≤100 |
| | `metaDescription`, `description` | string \| null | ≤300 |
| | `ogImageUrl`, `canonicalUrl` | string \| null | URL ≤255 |
| | `keywords` | string[] \| null | maks 20 item, tiap ≤50 karakter |
| `features` | `maintenanceMode` | boolean | bawaan `false` |
| | `maintenanceMessage` | string \| null | ≤300 |
| | `enablePayment` | boolean | bawaan `false` |
| | `enableRegistration` | boolean | bawaan `true` |
| | `announcement` | object | `{ isActive: boolean, message: string≤500, type: "info"\|"warning"\|"danger" }` |
| `legal` | `termsUrl`, `privacyPolicyUrl` | string \| null | ≤255 |

### Aturan Media

Berkas ImageKit divalidasi **hanya** saat `isActive: true`:
ukuran ≤2 MB, dimensi ≥32×32 px. Draft boleh tanpa validasi.

### Contoh Request

```json
{
  "code": "simpad",
  "name": "SIMPAD Pajak Daerah",
  "audience": "PUBLIC",
  "tagline": "Cek & simulasi pajak kendaraan",
  "baseUrl": "http://localhost:3004",
  "settings": {
    "branding": { "shortName": "SIMPAD", "primaryColor": "#0F766E" },
    "features": { "enableRegistration": true, "enablePayment": false }
  },
  "isActive": false
}
```

**Response 201:** bentuk aplikasi.
**Error:** `409` kode sudah dipakai · `400` media tidak valid / settings tidak sesuai schema.

---

## 6. PATCH /api/applications/:id

**Akses:** `authenticate` + `application:update`.

### Path Parameter

| Nama | Wajib | Tipe | Aturan |
|---|:--:|---|---|
| `id` | ✓ | uuid | — |

### Request Body

Sama dengan `POST`, **kecuali `code` dan `audience`** (keduanya final). Minimal satu field.

| Field | Wajib | Tipe | Nullable |
|---|:--:|---|:--:|
| `name` | — | string (2–100) | — |
| `tagline` | — | string ≤150 | ✓ |
| `description` | — | string ≤500 | ✓ |
| `baseUrl`, `icon` | — | string | ✓ |
| `logoUrl`, `logoFileId`, `logoDarkUrl`, `logoDarkFileId` | — | string | ✓ |
| `faviconUrl`, `faviconFileId`, `ogImageUrl`, `ogImageFileId` | — | string | ✓ |
| `settings` | — | object | — |
| `isActive` | — | boolean | — |

**Response 200:** bentuk aplikasi.

---

## 7. PATCH /api/applications/:id/activate

**Akses:** `authenticate` + `application:update`.

### Request Body

| Field | Wajib | Tipe | Keterangan |
|---|:--:|---|---|
| `isActive` | ✓ | boolean | `false` mencabut sesi berjalan pada aplikasi itu |

**Response 200:** `{ success, message, data: { isActive } }`
**Error:** `403` aplikasi inti `seloko` tidak boleh dinonaktifkan.

---

## 8. DELETE /api/applications/:id

**Akses:** `authenticate` + `application:delete`.

### Path Parameter

| Nama | Wajib | Tipe |
|---|:--:|---|
| `id` | ✓ | uuid |

**Perilaku:** hapus **permanen** + cascade (roles, permissions, menus).

**Response 200:** `{ success: true, message: "...", data: null }`
**Error:** `403` aplikasi inti `seloko` · `409` masih ada pengguna yang ditugaskan.

---

## Catatan Perilaku

- `audience` tidak dapat diubah: akun yang sudah terdaftar akan terdampar bila jenis aplikasi
  berganti.
- `settings` memakai `.strict()` — salah ketik nama field (`primaryColour`) ditolak, tidak
  tersimpan diam-diam.
- `baseUrl` dan `icon` dikelola lewat `prisma/seeds/core/menus.json` saat seeding.
- Aplikasi `seloko` dilindungi dari penghapusan & penonaktifan (`PROTECTED_APP_CODES`).
