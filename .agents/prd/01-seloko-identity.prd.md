# 🏛️ PRD 01: SELOKO Core Identity & Super App Engine

- **Kode Aplikasi Inti:** `seloko`
- **Tipe Domain:** Centralized Identity Provider, Single Sign-On (SSO) Gateway, & Multi-Tenant Platform Manager
- **Status Modul:** ✅ **Stabil (Production Ready & 100% Tested)**

---

## 1. Latar Belakang & Masalah Bisnis
Sebelumnya, aplikasi-aplikasi di lingkungan Pemerintah Provinsi Jambi (BPKPD) berdiri sendiri-sendiri, memiliki database pengguna terpisah, dan tidak memiliki standar keamanan terpadu.

**Solusi SELOKO Identity Engine:**
Menjadi satu-satunya *Identity Gateway* terpusat yang melayani autentikasi pegawai ASN dan masyarakat, mengelola hak akses (*dynamic RBAC*), mengarahkan sesi ke berbagai aplikasi publik (*multi-tenancy*), dan menyediakan media storage terpusat.

---

## 2. Fitur & Modul Fungsional

### A. Multi-Tenancy & Application Management (`/api/applications`)
- **Header Wajib:** Setiap request API membawa `X-App-Code` untuk mengisolasi data tenant.
- **Klasifikasi Audiens:** 
  - `INTERNAL`: Khusus pegawai lewat konsol `seloko`.
  - `PUBLIC`: Aplikasi publik (warga login di aplikasi masing-masing).
- **Public Bootstrap Config (`GET /public-config/:code`):** Endpoint unauthenticated untuk client frontend (branding, SEO, kontak resmi, status fitur).
- **Manajemen Media Branding (ImageKit):** 
  - `logoUrl` / `logoFileId`, `logoDarkUrl` / `logoDarkFileId`, `faviconUrl` / `faviconFileId`, `ogImageUrl` / `ogImageFileId`.
  - Validasi fisik ImageKit **hanya dipicu saat status `isActive: true`**. Mode draft diizinkan bypass validasi.
  - Auto-cleanup asinkron saat media diganti.
- **Proteksi Aplikasi Inti:** Aplikasi `seloko` dilindungi dari penghapusan dan penonaktifan.

### B. Otentikasi & Keamanan Sesi (`/api/auth`)
- **Hashing Kredensial:** Argon2id (`memoryCost: 64MB`, `timeCost: 3`, `parallelism: 4`).
- **Access Token:** JWT berumur pendek (15 menit).
- **Refresh Token di HttpOnly Cookie:** Atribut `httpOnly: true`, `sameSite: strict`, `path: /api/auth`, `secure: true`. Token di-hash SHA-256 di database.
- **Refresh Token Rotation & Token Reuse Detection:** Jika refresh token lama yang sudah dicabut dicoba dipakai kembali, sistem seketika membatalkan SELURUH sesi aktif user di semua perangkat.
- **Instant Logout Blocklist di Redis:** Access token yang masih hidup langsung diblokir di Redis saat logout.
- **Perlindungan Brute-force:** Rate limiting ketat pada endpoint login.

### C. Dynamic RBAC: Permissions & Roles (`/api/permissions` & `/api/roles`)
- **Format Permission:** `<entity>:<action>` unik per aplikasi (`@@unique([applicationId, code])`), bersifat kekal (*immutable*).
- **Matriks Checklist Role:** Endpoint detail role mengembalikan seluruh permission aplikasi dengan flag boolean `granted: true/false` terkelompok per modul untuk kemudahan form CMS.
- **Perlindungan Role Sistem (`isSystemRole: true`):** Dilarang dihapus, diubah namanya, atau dinonaktifkan.
- **Cache Izin di Redis:** Di-cache dengan TTL 5 menit (`perms:user:{userId}:app:{appCode}`) dan otomatis di-invalidasi seketika saat ada mutasi role/permission.

### D. Manajemen Pengguna (`/api/users`)
- **Pemisahan Akun:** `accountType: "INTERNAL"` (pegawai) vs `accountType: "PUBLIC"` (warga). Pagar audiens mencegah akun warga memegang role pegawai.
- **Transparansi Akses:** 
  - List users membawa ringkasan jumlah aplikasi dan total roles.
  - Detail user memetakan secara eksplisit daftar aplikasi dan role yang dimiliki pengguna di setiap aplikasi.
- **Media Avatar:** Terintegrasi ImageKit (max 2MB, min 100x100 px, auto-cleanup).
- **Soft-Delete:** Menandai `deletedAt`, menonaktifkan akun, dan mencabut semua token aktif.

### E. Sidebar Navigasi Dinamis (`/api/menus`)
- **Penyaringan 3 Lapis pada `GET /menus/me`:**
  - Lapis 1: Menu & aplikasi berstatus aktif.
  - Lapis 2: Pengecekan permission (`permissionId`).
  - Lapis 3: Pengecekan role pembatas (`menuRoles`).
- **Post-Order Pruning:** Grup/folder menu yang semua anaknya tersembunyi otomatis disembunyikan.
- **Dukungan CMS:** Tampilan flat terpaginasi atau pohon penuh (`?tree=true`), reorder massal (`PATCH /menus/reorder`), dan proteksi *circular hierarchy*.

### F. Centralized Media Storage (`/api/storage`)
- **Two-Step Upload:** Upload fisik ke `/api/storage/upload` $\rightarrow$ peroleh `url` & `fileId` $\rightarrow$ kirim via JSON payload modul.
- **Format Direktori:** `/{appCode}/{module}/{subFolder}`
- **Format Nama Berkas Unik:** `{prefix}_{YYYYMMDD}_{HHmmss}_{hash8}{ext}`
- **Batasan Berkas:** Maks 50MB, MIME types ketat, proteksi berkas terpotong (*truncation guard*).

---

## 3. Matriks Status Endpoint & Pengujian
- **Status Smoke Test:** ✅ 52 / 52 Test Passed.
- **Status Typecheck:** ✅ 0 Error.
