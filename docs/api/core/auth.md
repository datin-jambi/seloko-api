# Auth

- **Aplikasi:** `seloko`
- **Prefix:** `/api/auth`
- **Sumber kode:** `src/modules/core/auth/auth.routes.ts`
- **Jumlah endpoint:** 5

## Ringkasan Endpoint

| No | Method | Path | Guard / Akses | Deskripsi |
|:--:|---|---|---|---|
| 1 | `POST` | `/login` | Rate limit | Autentikasi dengan `identity` (email **atau** username) + `password`. Token akses di body, refresh token di cookie HttpOnly. |
| 2 | `POST` | `/refresh` | Cookie HttpOnly | Rotasi pasangan token. Token lama dicabut; pemakaian ulang token yang sudah dicabut membatalkan **semua** sesi user. |
| 3 | `POST` | `/logout` | `authenticate` | Mencabut refresh token aktif, memblokir access token di Redis, menghapus cookie, membersihkan cache izin. |
| 4 | `POST` | `/logout-all` | `authenticate` | Mencabut seluruh sesi di semua perangkat. |
| 5 | `GET` | `/me` | `authenticate` | Profil pengguna + role & permission aktif **pada aplikasi `X-App-Code`**. |

## Detail Endpoint

### POST /login
- **Akses:** publik + rate limit (dev 200/menit, produksi 5/15 menit dengan ban).
- **Body:**
  ```json
  { "identity": "superadmin", "password": "SelokoBapenda@2025!" }
  ```
- **Aturan:** akun `INTERNAL` wajib memenuhi audience aplikasi `INTERNAL`; akun `PUBLIC` wajib
  punya penugasan role aktif di aplikasi yang diminta. Akun nonaktif/terhapus ditolak.
- **Response 200:**
  ```json
  {
    "success": true,
    "message": "Login berhasil",
    "data": {
      "accessToken": "eyJ...",
      "expiresIn": 900,
      "user": {
        "id": "01a1...", "email": "superadmin@gmail.com", "username": "superadmin",
        "fullName": "Super Administrator", "avatarUrl": null, "avatarFileId": null,
        "accountType": "INTERNAL", "isSuperAdmin": true
      }
    }
  }
  ```
  Cookie `seloko_rt` (HttpOnly, `SameSite=strict`, `Path=/api/auth`, `Secure` di produksi)
  ikut diset.
- **Error:** `401` kredensial salah/akun nonaktif · `403` audience aplikasi tidak cocok ·
  `429` rate limit.

### POST /refresh
- **Akses:** hanya cookie `seloko_rt`. **Tidak** butuh Bearer.
- **Response 200:** `{ success, message, data: { accessToken, expiresIn } }` + cookie baru.
- **Error:** `401` cookie tidak ada, kedaluwarsa, atau sudah dicabut.

### POST /logout
- **Akses:** `authenticate` (+ cookie). Bila cookie tidak terbaca, hanya sesi Bearer yang diblokir.
- **Response 200:** `{ success: true, message: "...", data: null }`

### POST /logout-all
- **Response 200:**
  ```json
  { "success": true, "message": "3 sesi berhasil dicabut", "data": { "revokedSessions": 3 } }
  ```

### GET /me
- **Akses:** `authenticate` (tanpa `requirePermission`).
- **Response 200:**
  ```json
  {
    "success": true, "message": "Profil berhasil diambil",
    "data": {
      "id": "01a1...", "nip": "197001011990031001", "email": "superadmin@gmail.com",
      "username": "superadmin", "fullName": "Super Administrator",
      "avatarUrl": null, "avatarFileId": null, "phoneNumber": "0811-7400-001",
      "accountType": "INTERNAL", "isSuperAdmin": true,
      "emailVerifiedAt": "2026-10-01T00:00:00.000Z", "lastLoginAt": "2026-10-18T05:00:00.000Z",
      "roles": ["superadmin"],
      "permissions": []
    }
  }
  ```
- **Catatan:** `permissions` kosong untuk super admin karena ia melewati seluruh pemeriksaan izin.
  Role & permission dibaca pada aplikasi `X-App-Code`, jadi untuk pegawai yang mengelola aplikasi
  lain hasilnya berbeda per header.

## Catatan Perilaku
- Access token berlaku 15 menit; refresh token 7 hari dan **dirotasi** setiap kali dipakai.
- Payload JWT memuat `sub`, `email`, `username`, `accountType`, `isSuperAdmin`, `appCode`.
  `appCode` tidak pernah berubah, jadi tidak bisa basi.
- Deteksi pemakaian ulang refresh token lama = indikasi token dicuri → semua sesi user dicabut.
- Login/logout dipublikasikan ke audit log lewat RabbitMQ (tidak memblokir respons).
