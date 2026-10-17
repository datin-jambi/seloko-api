# 00 — Konvensi API

Berlaku untuk seluruh endpoint di semua aplikasi.

## Header

| Header | Wajib | Keterangan |
|---|---|---|
| `X-App-Code` | ya (kecuali `/api/health`) | Kode aplikasi tenant, mis. `seloko`, `bapenda-profile`, `lapak-jambi-web`. Tidak ada bawaan — tanpa header ini respons `400`. |
| `Authorization` | pada endpoint terproteksi | `Bearer <accessToken>` dari `POST /api/auth/login`. |
| `Content-Type` | pada request ber-body | `application/json`, kecuali upload media (`multipart/form-data`). |

`appCode` pada token **wajib sama** dengan `X-App-Code` request. Beda → `403`.
Akun `PUBLIC` (warga) hanya boleh menyentuh aplikasi tempat ia terdaftar; akun `INTERNAL`
(pegawai) boleh menjangkau aplikasi lain dari `seloko`, sesuai role yang dipegang di sana.

## Format Respons

**Sukses** (modul core menyertakan `success`, modul Bapenda memakai `statusCode`/`code`):

```json
{
  "success": true,
  "message": "Daftar pengguna berhasil diambil",
  "data": [ ... ],
  "meta": { "page": 1, "limit": 20, "total": 45, "totalPages": 3, "hasNextPage": true, "hasPreviousPage": false }
}
```

**Error** (bentuk seragam dari `AppError`):

```json
{
  "statusCode": 403,
  "code": "FORBIDDEN",
  "message": "Permission denied: \"user:create\" is required on \"seloko\"",
  "timestamp": "2026-10-18T05:00:00.000Z"
}
```

| Status | Kode | Kapan |
|---|---|---|
| 400 | `BAD_REQUEST` / `VALIDATION_ERROR` | Body/query tidak lolos Zod, atau aturan bisnis dilanggar |
| 401 | `UNAUTHORIZED` | Token tidak ada, kedaluwarsa, atau sudah dicabut (blocklist Redis) |
| 403 | `FORBIDDEN` | Izin kurang, `X-App-Code` tidak cocok, atau lintas aplikasi ditolak |
| 404 | `NOT_FOUND` | Entitas tidak ada atau sudah soft-delete |
| 409 | `CONFLICT` | Unik bentrok (kode/slug/email), atau masih punya relasi aktif |
| 429 | `TOO_MANY_REQUESTS` | Rate limit (login produksi: 5/15 menit) |
| 500 | `INTERNAL_SERVER_ERROR` | Bug; tidak pernah membocorkan detail internal |

## Paginasi

Query baku: `page` (≥1, bawaan 1), `limit` (1–100, bawaan 20), `sortBy`, `sortOrder`
(`asc`/`desc`). `meta` selalu menyertakan `page`, `limit`, `total`, `totalPages`,
`hasNextPage`, `hasPreviousPage`.

## Filter Umum

`search` (teks, case-insensitive, maks 100 karakter) · `isActive` (`true`/`false`)
· `applicationId` (UUID). Filter tambahan per modul ada di berkas masing-masing.

## Penandaangan

- Semua ID adalah **UUID v7** (string). Tidak ada ID integer.
- Waktu dikirim sebagai string **ISO 8601** UTC, mis. `2026-10-18T05:00:00.000Z`.
- Kolom kosong dikirim sebagai `null`, bukan dihilangkan (kecuali dinyatakan opsional).
- Soft-delete: baris ber-`deletedAt` tidak muncul di daftar maupun detail, dan
  biasanya menahan penghapusan induknya.

## Aturan Akses

1. `authenticate` — memverifikasi JWT, mencocokkan `appCode` token dengan header, dan
   memeriksa blocklist Redis. Wajib sebelum `requirePermission`.
2. `requirePermission("<entity>:<action>", { app })` — izin dibaca pada **aplikasi pemilik
   modul**, bukan aplikasi pintu masuk. `isSuperAdmin` melewati seluruh pemeriksaan izin.
3. **Lingkup OPD** (modul yang punya kolom `organizationId`): penugasan role tanpa baris OPD
   berlaku untuk seluruh OPD; dengan baris OPD, hanya OPD tersebut. Lihat
   `src/common/guards/org-scope.ts`.

## Sanitasi

Konten HTML (`news`, `pages`, dan konten kaya lain) disaring `src/common/utils/html.ts` sebelum
disimpan: `<script>`, atribut event, dan skema berbahaya (`javascript:`) dibuang; `style` dibatasi
ke `color`, `background-color`, `text-align`, `width`, `min-width` dengan nilai berpola.
