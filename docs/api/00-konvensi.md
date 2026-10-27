# 00 — Konvensi API

Berlaku untuk seluruh endpoint di semua aplikasi.

## Legenda Tabel Parameter

Dipakai di seluruh berkas modul:

| Simbol | Arti |
|:--:|---|
| ✓ | **Wajib** — request ditolak `400` bila tidak diisi |
| — | Opsional — boleh dihilangkan |
| `null` | Boleh dikirim eksplisit `null` untuk mengosongkan nilai (hanya bila kolom "Nullable" bertanda ✓) |

Tiap tabel parameter mencantumkan **Nama · Wajib · Tipe · Aturan validasi · Default · Keterangan**.
"Aturan" adalah batas yang benar-benar ditegakkan Zod, bukan saran.

## Header

| Header | Wajib | Nilai | Keterangan |
|---|:--:|---|---|
| `X-App-Code` | ✓ ¹ | `seloko` \| `bapenda-profile` \| `bapenda-portal` \| `lapak-jambi-web` \| `lapak-jambi-app` | Kode aplikasi tenant. Pola `^[a-z0-9_-]{2,50}$`. Tanpa header → `400` |
| `Authorization` | ✓ ² | `Bearer <accessToken>` | Token dari `POST /api/auth/login` |
| `Content-Type` | ✓ ³ | `application/json` | `multipart/form-data` untuk `POST /api/storage/upload` |
| `Cookie` | — | `seloko_rt=...` | Refresh token, diset otomatis oleh server |

¹ Kecuali `/api/health` dan `/api/health/ready`.
² Kecuali endpoint publik (`/public*`, `/login`, `/refresh`, `/public-config/:code`).
³ Hanya untuk request ber-body.

`appCode` di dalam JWT **wajib sama** dengan `X-App-Code` request. Beda → `403`.

## Format Respons

**Modul Core** (`auth`, `users`, `applications`, `permissions`, `roles`, `menus`, `organizations`):

```json
{
  "success": true,
  "message": "Daftar pengguna berhasil diambil",
  "data": [],
  "meta": { "page": 1, "limit": 20, "total": 45, "totalPages": 3, "hasNextPage": true, "hasPreviousPage": false }
}
```

**Modul Bapenda** (`uptds`, `banners`, `news`, `pages`) — warisan modul domain:

```json
{
  "statusCode": 200,
  "code": "SUCCESS",
  "message": "Daftar banner berhasil diambil",
  "data": [],
  "meta": { "page": 1, "limit": 20, "totalItems": 3, "totalPages": 1, "hasNextPage": false, "hasPreviousPage": false }
}
```

**Modul Storage** — mengikuti standar media, `data` bisa objek atau array:

```json
{ "statusCode": 201, "code": "SUCCESS", "message": "...", "data": { "fileId": "...", "url": "..." } }
```

> Perbedaan nama field meta: Core memakai `total`, Bapenda memakai `totalItems`. Ini sengaja
> dipertahankan agar tidak memutus klien yang sudah jalan.

**Error** (seragam dari `AppError`):

```json
{
  "statusCode": 403,
  "code": "FORBIDDEN",
  "message": "Permission denied: \"user:create\" is required on \"seloko\"",
  "timestamp": "2026-10-18T05:00:00.000Z"
}
```

| Status | `code` | Kapan |
|---|---|---|
| 400 | `BAD_REQUEST` | Aturan bisnis dilanggar (induk tidak ada, siklus hierarki, OPD tak dikenal) |
| 400 | `VALIDATION_ERROR` | Body/query/params tidak lolos Zod; `details[]` menyebut field & alasan |
| 401 | `UNAUTHORIZED` | Token tidak ada, kedaluwarsa, atau sudah dicabut (blocklist Redis) |
| 403 | `FORBIDDEN` | Izin kurang, `X-App-Code` tidak cocok, lintas aplikasi ditolak, atau di luar lingkup OPD |
| 404 | `NOT_FOUND` | Entitas tidak ada atau sudah soft-delete |
| 409 | `CONFLICT` | Unik bentrok (kode/slug/email), atau masih punya relasi aktif |
| 429 | `TOO_MANY_REQUESTS` | Rate limit (login produksi: 5/15 menit + ban) |
| 500 | `INTERNAL_SERVER_ERROR` | Bug; tidak membocorkan detail internal |

Bentuk `VALIDATION_ERROR`:

```json
{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "message": "Validasi gagal",
  "details": [{ "path": ["email"], "message": "Format email tidak valid" }]
}
```

## Paginasi

| Parameter | Wajib | Tipe | Aturan | Default |
|---|:--:|---|---|---|
| `page` | — | integer | ≥ 1 | `1` |
| `limit` | — | integer | 1–100 (beberapa modul 200) | `20` |
| `sortBy` | — | string | enum per modul | per modul |
| `sortOrder` | — | string | `asc` \| `desc` | per modul |

`meta` selalu menyertakan `page`, `limit`, `total` (atau `totalItems`), `totalPages`,
`hasNextPage`, `hasPreviousPage`. `totalPages` = `ceil(total / limit)`, minimal `1`.

## Filter Umum

| Parameter | Wajib | Tipe | Aturan | Keterangan |
|---|:--:|---|---|---|
| `search` | — | string | ≤100 karakter, case-insensitive | Kolom yang dicari berbeda per modul |
| `isActive` | — | string | `"true"` \| `"false"` | Dikirim sebagai **string**, bukan boolean |
| `applicationId` | — | uuid | Format UUID v4/v7 | Batasi ke satu aplikasi |

## Penandaangan & Tipe Data

| Aspek | Aturan |
|---|---|
| Primary key | UUID v7 (string), tidak ada ID integer |
| Waktu | ISO 8601 UTC, mis. `2026-10-18T05:00:00.000Z` |
| Kosong | Dikirim `null`, bukan dihilangkan (kecuali dinyatakan opsional) |
| Boolean di query | Ditulis `"true"`/`"false"` (string) |
| Boolean di body | JSON `true`/`false` |
| Soft-delete | Baris ber-`deletedAt` tidak muncul di daftar/detail dan menahan penghapusan induk |
| Angka desimal | JSON number (mis. `latitude: -1.61`) |

## Aturan Akses

1. **`authenticate`** — verifikasi JWT, cocokkan `appCode` token dengan header, cek blocklist
   Redis. Wajib sebelum `requirePermission`.
2. **`requirePermission("<entity>:<action>", { app })`** — izin dibaca pada **aplikasi pemilik
   modul**, bukan aplikasi pintu masuk. `isSuperAdmin` melewati seluruh pemeriksaan.
3. **Lingkup OPD** — untuk modul yang punya kolom `organizationId`:
   - penugasan role **tanpa** baris OPD → berlaku seluruh OPD (level Bapenda);
   - penugasan **dengan** baris OPD → hanya OPD tersebut;
   - lingkup kosong = **tolak semua** (gagal tertutup).
   Implementasi: `src/common/guards/org-scope.ts`.
4. **Audience** — akun `INTERNAL` (pegawai) login hanya lewat `seloko`; akun `PUBLIC` (warga)
   hanya ke aplikasi publik tempat ia punya penugasan.

## Sanitasi

Konten HTML (`news.content`, `pages.content`) disaring `src/common/utils/html.ts` **sebelum**
disimpan:

| Diizinkan | Dibuang |
|---|---|
| Tag HTML standar + `<img>` | `<script>`, `<iframe>`, `<object>` |
| `class` di semua tag | Atribut event (`onclick`, `onerror`, …) |
| `img`: `src`, `alt`, `title`, `width`, `height` | Skema `javascript:`, `data:` |
| Tabel: `colspan`, `rowspan` | — |
| `style`: `color`, `background-color`, `text-align`, `width`, `min-width` (nilai berpola) | `position`, `background-image: url(...)`, nilai non-pola |
