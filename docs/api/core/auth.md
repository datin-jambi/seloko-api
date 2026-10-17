# Auth

- **Aplikasi:** `seloko` · **Prefix:** `/api/auth` · **Jumlah endpoint:** 6
- **Sumber kode:** `src/modules/core/auth/auth.routes.ts`

## Ringkasan Endpoint

| No | Method | Path | Guard | Deskripsi |
|:--:|---|---|---|---|
| 1 | `POST` | `/login` | rate limit | Autentikasi `identity` + `password` |
| 2 | `POST` | `/refresh` | cookie HttpOnly | Rotasi pasangan token |
| 3 | `POST` | `/logout` | `authenticate` | Akhiri sesi ini |
| 4 | `POST` | `/logout-all` | `authenticate` | Akhiri semua sesi |
| 5 | `GET` | `/me` | `authenticate` | Profil + role & permission aktif |
| 6 | `POST` | `/register` | rate limit | Pendaftaran mandiri akun **warga** (hanya aplikasi publik) |

---

## 1. POST /api/auth/login

**Akses:** publik + rate limit (dev 200/menit; produksi 5/15 menit dengan ban).

### Request Body

| Field | Wajib | Tipe | Aturan | Keterangan |
|---|:--:|---|---|---|
| `identity` | ✓ | string | 3–100 | Email **atau** username |
| `password` | ✓ | string | 8–100 | — |

```json
{ "identity": "superadmin", "password": "SelokoBapenda@2025!" }
```

### Aturan Bisnis

1. Akun `INTERNAL` hanya bisa login ke aplikasi ber-audience `INTERNAL` (`seloko`).
2. Akun `PUBLIC` hanya bisa login ke aplikasi publik tempat ia **punya penugasan role aktif**.
3. Akun nonaktif, soft-deleted, atau tanpa role → `403`/`401`.

### Response 200

| Field | Tipe | Keterangan |
|---|---|---|
| `data.accessToken` | string | JWT, berlaku 900 detik |
| `data.expiresIn` | integer | TTL access token (detik) |
| `data.user.id` | string | UUID v7 |
| `data.user.email` | string | — |
| `data.user.username` | string \| null | `null` untuk akun `PUBLIC` |
| `data.user.fullName` | string | — |
| `data.user.avatarUrl` | string \| null | — |
| `data.user.avatarFileId` | string \| null | — |
| `data.user.accountType` | enum | `INTERNAL` \| `PUBLIC` |
| `data.user.isSuperAdmin` | boolean | — |

```json
{
  "success": true,
  "message": "Login berhasil",
  "data": {
    "accessToken": "eyJhbGciOi...",
    "expiresIn": 900,
    "user": {
      "id": "01a1...", "email": "superadmin@gmail.com", "username": "superadmin",
      "fullName": "Super Administrator", "avatarUrl": null, "avatarFileId": null,
      "accountType": "INTERNAL", "isSuperAdmin": true
    }
  }
}
```

**Cookie yang diset:** `seloko_rt` — `HttpOnly`, `SameSite=strict`, `Path=/api/auth`,
`Secure` hanya di produksi, umur 7 hari.

**Error:** `401` kredensial salah / akun nonaktif · `403` audience aplikasi tidak cocok ·
`400` header `X-App-Code` tidak ada · `429` rate limit.

---

## 2. POST /api/auth/refresh

**Akses:** hanya cookie `seloko_rt`. **Tidak** butuh `Authorization`.

### Request Body

Tidak ada.

### Perilaku

- Rotasi penuh: refresh token lama dicabut, pasangan baru diterbitkan, cookie diganti.
- Memakai kembali refresh token yang **sudah dicabut** dianggap token dicuri →
  **seluruh sesi user dibatalkan**.

### Response 200

| Field | Tipe | Keterangan |
|---|---|---|
| `data.accessToken` | string | Token baru |
| `data.expiresIn` | integer | Detik |

```json
{ "success": true, "message": "Token berhasil diperbarui", "data": { "accessToken": "eyJ...", "expiresIn": 900 } }
```

**Error:** `401` cookie tidak ada / kedaluwarsa / sudah dicabut.

---

## 3. POST /api/auth/logout

**Akses:** `authenticate` (+ cookie bila ada).

### Request Body

Tidak ada.

### Perilaku

1. Mencabut refresh token di database (bila cookie terbaca).
2. Memasukkan access token ke blocklist Redis (langsung tidak berlaku).
3. Menghapus cookie dan cache izin user.

### Response 200

```json
{ "success": true, "message": "Logout berhasil", "data": null }
```

**Error:** `401` token tidak valid / sudah kedaluwarsa.

---

## 4. POST /api/auth/logout-all

**Akses:** `authenticate`.

### Perilaku

Mencabut **seluruh** sesi user di semua perangkat & aplikasi, memblokir token saat ini, dan
membersihkan seluruh cache izin.

### Response 200

| Field | Tipe | Keterangan |
|---|---|---|
| `data.revokedSessions` | integer | Jumlah sesi yang dicabut |

```json
{ "success": true, "message": "3 sesi berhasil dicabut", "data": { "revokedSessions": 3 } }
```

---

## 5. GET /api/auth/me

**Akses:** `authenticate` (tanpa `requirePermission` — isinya milik pemanggil).

### Query Parameter

Tidak ada. Aplikasi target ditentukan oleh header `X-App-Code`.

### Response 200

| Field | Tipe | Keterangan |
|---|---|---|
| `id` | string | UUID v7 |
| `nip` | string \| null | NIP ASN |
| `email` | string | — |
| `username` | string \| null | — |
| `fullName` | string | — |
| `avatarUrl`, `avatarFileId` | string \| null | — |
| `phoneNumber` | string \| null | — |
| `accountType` | enum | `INTERNAL` \| `PUBLIC` |
| `isSuperAdmin` | boolean | `true` → `permissions` kosong (bypass) |
| `emailVerifiedAt` | string \| null | ISO 8601 |
| `lastLoginAt` | string \| null | ISO 8601 |
| `roles` | string[] | Nama role aktif **pada aplikasi header** |
| `permissions` | string[] | Kode `entity:action` aktif pada aplikasi header |

```json
{
  "success": true, "message": "Profil berhasil diambil",
  "data": {
    "id": "01a1...", "nip": "197001011990031001", "email": "superadmin@gmail.com",
    "username": "superadmin", "fullName": "Super Administrator",
    "avatarUrl": null, "avatarFileId": null, "phoneNumber": "0811-7400-001",
    "accountType": "INTERNAL", "isSuperAdmin": true,
    "emailVerifiedAt": "2026-10-01T00:00:00.000Z", "lastLoginAt": "2026-10-18T05:00:00.000Z",
    "roles": ["superadmin"], "permissions": []
  }
}
```

**Catatan penting:** hasil `roles`/`permissions` **berbeda per header**. Pegawai yang mengelola
Lapak cukup mengubah `X-App-Code: lapak-jambi-web` untuk melihat izinnya di sana.

---

## 6. POST /api/auth/register

**Akses:** publik + rate limit (setara login). **Hanya** untuk aplikasi ber-audience `PUBLIC`.

### Request Body

| Field | Wajib | Tipe | Aturan | Keterangan |
|---|:--:|---|---|---|
| `email` | ✓ | string | format email, ≤100 | Unik di antara akun `PUBLIC` |
| `password` | ✓ | string | 8–100, ≥1 huruf besar, ≥1 angka | Di-hash Argon2id |
| `passwordConfirm` | ✓ | string | harus sama dengan `password` | — |
| `fullName` | ✓ | string | 2–150 | — |
| `phoneNumber` | — | string | ≤20 | — |
| `nik` | — | string | tepat 16 digit angka, unik bila diisi | Opsional; PII |

`roleName` / `role` **tidak** ada di schema — bila dikirim, diabaikan. Role ditetapkan server.

```json
{
  "email": "warga@contoh.id",
  "password": "RahasiaWarga2026",
  "passwordConfirm": "RahasiaWarga2026",
  "fullName": "Warga Baru",
  "phoneNumber": "0812-3456-7890",
  "nik": "1501010101900001"
}
```

### Aturan Bisnis

1. Aplikasi harus `audience: PUBLIC` dan aktif. Di aplikasi `INTERNAL` (`seloko`) → `403`.
2. Role yang diberikan: `warga` bila ada, jika tidak role `PUBLIC` aktif pertama pada aplikasi itu.
   Tanpa role PUBLIC sama sekali → `400` (salah konfigurasi, bukan salah pengguna).
3. `emailVerifiedAt` dibiarkan `null` — verifikasi email/OTP masuk backlog `LJ-5.5`. Akun bisa
   langsung dipakai sampai itu dikerjakan.
4. Pesan konflik sengaja umum ("Email atau NIK sudah terdaftar") agar tidak membocorkan NIK
   orang lain ke penebak.

### Response 201

| Field | Tipe | Keterangan |
|---|---|---|
| `id` | string | UUID v7 |
| `email` | string | — |
| `fullName` | string | — |
| `accountType` | enum | Selalu `PUBLIC` |
| `emailVerifiedAt` | string \| null | `null` sampai verifikasi dikerjakan |
| `roleName` | string | Role yang diberikan server, mis. `warga` |

```json
{
  "success": true,
  "message": "Pendaftaran berhasil sebagai warga. Silakan masuk.",
  "data": {
    "id": "01a2...", "email": "warga@contoh.id", "fullName": "Warga Baru",
    "accountType": "PUBLIC", "emailVerifiedAt": null, "roleName": "warga"
  }
}
```

**Error:** `400` validasi / konfirmasi password beda / aplikasi tanpa role PUBLIC ·
`403` aplikasi INTERNAL · `409` email atau NIK sudah terdaftar · `429` rate limit.

**Catatan:** respons **tidak** memuat NIK. NIK hanya bisa dibaca lewat CMS dalam bentuk
termasking (lihat [users.md](./users.md)).

---

## Catatan Perilaku

| Aspek | Nilai |
|---|---|
| Umur access token | 15 menit |
| Umur refresh token | 7 hari, dirotasi setiap dipakai |
| Hashing password | Argon2id (`memoryCost 64MB`, `timeCost 3`, `parallelism 4`) |
| Penyimpanan refresh token | Hash SHA-256 di tabel `refresh_tokens` |
| Isi JWT | `sub`, `email`, `username`, `accountType`, `isSuperAdmin`, `appCode`, `jti` |
| Audit | login/logout dipublikasikan ke RabbitMQ; kegagalan broker tidak menggagalkan request |
