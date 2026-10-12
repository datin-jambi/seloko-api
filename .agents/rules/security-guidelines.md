---
trigger: always_on
project: seloko-api
description: Standar keamanan, perlindungan data pribadi (PII), audit trail, dan otorisasi multi-tenant SELOKO
---

# 🛡️ Security Guidelines & Data Protection — SELOKO API

Dokumen ini memuat standar keamanan wajib untuk seluruh layanan backend di ekosistem **SELOKO API (BPKPD Provinsi Jambi)**.

---

## 1. Prinsip Zero-Trust & Isolasi Multi-Tenant

1. **Header Wajib `X-App-Code`:**
   - Semua rute di bawah `/api/*` wajib membawa header `X-App-Code`.
   - Data antar aplikasi **terisolasi secara logis**: permission, roles, dan menu milik Aplikasi A tidak boleh dapat diakses atau disematkan pada Aplikasi B.
2. **Pemisahan Tipe Akun (`accountType`):**
   - Akun `INTERNAL` (Pegawai Pemprov) hanya boleh masuk lewat gateway internal `seloko`.
   - Akun `PUBLIC` (Masyarakat) mendaftar dan login di aplikasi publik masing-masing.
   - Pagar audiens wajib diterapkan pada role assignment (`role.audience === user.accountType`). Pegawai dilarang diberi role warga dan sebaliknya.

---

## 2. Perlindungan Data Sensitif & PII (Personally Identifiable Information)

1. **Hashing Kata Sandi:**
   - Kata sandi wajib di-hash menggunakan **Argon2id** (`memoryCost: 65536`, `timeCost: 3`, `parallelism: 4`).
   - Dilarang menyimpan password dalam bentuk plain text atau hash lemah (MD5/SHA1).
2. **Larangan Kebocoran Field Sensitif:**
   - Field `passwordHash` pada tabel `users` dan `tokenHash` pada tabel `refresh_tokens` **DILARANG KERAS** diekspos di kueri select Prisma atau di respons JSON apa pun.
   - Selalu gunakan konstanta `USER_SELECT` eksplisit tanpa `passwordHash`.
3. **Data Identitas Warga & ASN:**
   - Kolom NIK, NIP, nomor telepon, dan email adalah data pribadi sensitif. Akses ke data ini wajib dibatasi dengan guard izin spesifik (`user:read` / `user:list`).

---

## 3. Otorisasi RBAC & Redis Cache Lifecycle

1. **Guard Endpoint CMS:**
   - Setiap endpoint operasional internal wajib membawa guard ganda:
     ```typescript
     preHandler: [
       fastify.authenticate,
       fastify.requirePermission("<entity>:<action>", { app: APP_CODES.<TARGET_APP> }),
     ]
     ```
2. **Caching Izin di Redis:**
   - Hak akses pengguna di-cache di Redis dengan key `perms:user:{userId}:app:{appCode}` dengan TTL 5 menit.
3. **Invalidasi Seketika (Instant Invalidation):**
   - Setiap mutasi pada penugasan role pengguna, aktivasi/penonaktifan user/role, atau perubahan isi role **WAJIB seketika memicu invalidasi cache Redis**:
     - `invalidatePermissionCache(userId, appCode)`
     - `invalidateAllUserPermissionCaches(userId)`
     - `invalidateAppPermissionCaches(appCode)`

---

## 4. Keamanan Sesi & Siklus JWT

1. **Access Token:**
   - Berumur pendek (15 menit). Memuat payload klaim minimal: `sub`, `email`, `accountType`, `isSuperAdmin`, `appCode`.
2. **Refresh Token di HttpOnly Cookie:**
   - Disimpan di browser hanya melalui cookie dengan atribut:
     - `httpOnly: true` (kebal pencurian via JavaScript / XSS).
     - `sameSite: "strict"` (kebal serangan CSRF).
     - `secure: true` (pada production, hanya lewat HTTPS).
     - `path: "/api/auth"`
3. **Refresh Token Rotation & Token Reuse Detection:**
   - Setiap kali token di-refresh, token lama di-revoke dan diganti dengan token baru.
   - Jika token yang sudah di-revoke dicoba digunakan kembali, sistem wajib mendeteksi **token reuse** dan mencabut seluruh sesi aktif user di semua perangkat demi keamanan.
4. **Instant Logout via Redis Blocklist:**
   - Saat logout, access token yang masih hidup dimasukkan ke blocklist Redis (`blocked:at:<tokenHash>`) selama sisa TTL token tersebut agar langsung tidak berlaku.

---

## 5. Perlindungan Brute Force & Sanitasi Input

1. **Rate Limiting:**
   - Endpoint sensitif seperti `POST /api/auth/login` wajib menerapkan rate limit ketat (`RATE_LIMIT.LOGIN`, mis. 5 percobaan per 15 menit).
2. **Sanitasi Slug & URL:**
   - Kolom `slug` atau `code` wajib divalidasi dengan regex ketat (`/^[a-z0-9_-]+$/`) untuk mencegah path traversal dan injeksi URL.
3. **Sanitasi Unggahan Media:**
   - Unggahan berkas wajib melewati validasi MIME type ketat, pengecekan ukuran berkas (maksimal 50MB), dan pencegahan buffer terpotong (*truncation check*).
