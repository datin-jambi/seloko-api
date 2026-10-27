# 💨 SELOKO API — Unified Smoke Testing

Folder ini memuat sistem **Smoke Testing** (uji sanity & end-to-end kilat) untuk memastikan bahwa server backend, lapisan keamanan (RBAC), multi-tenancy, dan data master yang tersimpan di database bekerja 100% normal.

Sistem pengujian ini ditulis murni menggunakan **TypeScript (Node.js fetch)** sehingga **100% cross-platform** (berjalan mulus di Windows PowerShell, Linux, maupun macOS tanpa butuh WSL atau Bash).

---

## 🚀 Cara Menjalankan

> **Prasyarat:** Pastikan server backend sedang aktif berjalan di terminal lain via `npm run dev`.

### 1. Jalankan Seluruh Uji Coba (Satu Pintu)
```bash
npm run db:smoke
```
Perintah ini akan menjalankan seluruh rangkaian pengujian dari Suite 1 hingga Suite 5 secara otomatis.

---

### 2. Jalankan Modul Tertentu (Filter)
Jika Anda hanya sedang mengerjakan satu fitur tertentu dan ingin menguji bagian itu saja tanpa menunggu modul lain, gunakan argumen nama modul:

```bash
# Uji modul autentikasi & login
npm run db:smoke -- auth

# Uji modul manajemen aplikasi multi-tenant
npm run db:smoke -- applications

# Uji modul role & permission (RBAC)
npm run db:smoke -- roles

# Uji integritas pohon sidebar menu
npm run db:smoke -- menus

# Uji modul domain Bapenda UPTD Samsat
npm run db:smoke -- uptds
```

---

## 📋 Daftar Modul Pengujian (Test Suites)

| Modul | Nama Suite | Hal yang Diuji |
| :--- | :--- | :--- |
| **`auth`** | Auth & Multi-Tenancy Guard | Login superadmin, login pegawai via gateway `seloko`, penolakan user nonaktif (401), penolakan password salah (401), validasi wajib header `X-App-Code` (400), dan response data profil `/auth/me`. |
| **`applications`** | Multi-Tenant Applications | Listing aplikasi terdaftar, detail metadata aplikasi, isolasi role viewer tanpa izin `application:create` (403). |
| **`roles` / `permissions`** | Roles & Permissions (RBAC) | Validasi daftar roles, permissions per modul, dan pengecekan hak akses user aktif melalui `/permissions/:appId/me`. |
| **`menus`** | Sidebar Menu Integrity | Integritas pohon relasi menu di database, menu akar (root), dan keterhubungan parent-child sidebar. |
| **`uptds`** | Domain Bapenda - UPTD Samsat | Direktori publik UPTD Samsat aktif, detail kantor Samsat by code (misal: `UPTD-001`), pencarian lokasi berdasarkan nama kota, dan CMS endpoint admin dengan paginasi. |

---

## 🔑 Kredensial Akun Pengujian Bawaan

| Username | Role & Karakteristik | Skenario yang Diuji |
| :--- | :--- | :--- |
| `superadmin` | Super Administrator | Memiliki akses penuh ke seluruh aplikasi & endpoint |
| `admin.seloko` | Administrator Seloko | Admin internal yang melewati guard `requirePermission` |
| `operator.user` | Operator Pengguna | Memiliki izin kelola user tapi **tanpa** `user:delete` (403 pada DELETE) |
| `viewer.only` | Viewer Only | Hanya memiliki izin read/list (403 pada semua endpoint mutasi/tulis) |
| `kasir.lapak` | Kasir Loket (Lapak) | `payment:approve` untuk retribusi; tidak punya wewenang master (kategori/objek retribusi) |
| `bendahara.lapak` | Bendahara (Lapak) | Baca & ekspor penerimaan (order/payment/report); semua mutasi ditolak 403 |
| `pimpinan.lapak` | Pimpinan (Lapak) | Hanya laporan & analitik; sidebar Katalog/Transaksi tidak tampil |
| `nonaktif` | User Inactive | `isActive = false` (harus ditolak 401 saat login) |

* **Aplikasi aktif di seed:**
  | code | audience |
  |---|---|
  | `seloko` | INTERNAL |
  | `bapenda-profile` | INTERNAL (CMS) |
  | `bapenda-portal` | PUBLIC (portal) |
  | `lapak-jambi-web` | INTERNAL (CMS) |
  | `lapak-jambi-app` | PUBLIC (portal) |
* **Akun warga** (`warga.pedagang@gmail.com`) login lewat `lapak-jambi-app`, bukan CMS.
  Token warga terikat `X-App-Code: lapak-jambi-app`.
* **Password akun standar:** `Seloko@2025!`
* **Password superadmin:** `SelokoBapenda@2025!` *(atau sesuai env `SEED_SUPER_ADMIN_PASSWORD`)*
