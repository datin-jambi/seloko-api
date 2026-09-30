# Data Seeder SELOKO API

Seluruh data seed ada di folder ini sebagai JSON. `prisma/seed.ts` hanya loader —
untuk menambah aplikasi, permission, role, atau akun uji, **edit JSON, jangan
sentuh kode.**

## Perintah

```
npm run db:seed          # seed / perbarui (idempoten, aman diulang)
npm run db:seed:reset    # kosongkan tabel RBAC lebih dulu, lalu seed
npm run db:smoke         # uji 26 skenario ke API yang sedang jalan
```

## Berkas

| Berkas | Isi |
|---|---|
| `applications.json` | Aplikasi terdaftar + permission per aplikasi |
| `roles.json` | Label aksi, grup aksi, role bawaan |
| `users.json` | Akun uji, penugasan role, pegawai massal |
| `smoke.sh` | Uji cepat: login, permission, pagination, /auth/me |

## Hasil seed

5 aplikasi, 81 permission, 27 role, 60 user, 65 penugasan role.

Password semua akun uji: `Seloko@2025!`
Superadmin: `SelokoBapenda@2025!` (bisa ditimpa env `SEED_SUPER_ADMIN_PASSWORD`).

## Akun uji dan gunanya

| Username | Untuk menguji |
|---|---|
| `superadmin` | Bypass seluruh permission (`isSuperAdmin`) |
| `admin.seloko` | Admin CMS **tanpa** flag superadmin — jalur `requirePermission` benar-benar dilewati |
| `operator.user` | Punya `user:create/read/list/update` tapi **tanpa** `user:delete` → 403 di DELETE |
| `viewer.only` | Hanya read/list/export → 403 di semua endpoint tulis |
| `editor.profil` | Hanya di `bapenda-profile` → login ke `seloko` harus 403 |
| `verifikator.lapak` | Role approve/reject |
| `multirole` | Dua role di **satu** aplikasi → union permission (19, bukan 13) |
| `lintasapp` | Role di tiga aplikasi → isolasi `X-App-Code` |
| `nonaktif` | `isActive=false` → 401 walau password benar |
| `terhapus` | `deletedAt` terisi → tak muncul di daftar, tak bisa login |
| `belum.verifikasi` | `emailVerifiedAt` null |
| `role.kedaluwarsa` | `expiresAt` sudah lewat → 403, permission kosong |
| `role.sementara` | `expiresAt` masih berlaku → 200 |
| `role.mati` | Ditugaskan ke role `isActive=false` → permission kosong |
| `tanpa.role` | Kredensial valid, tanpa penugasan → 403 di semua aplikasi |
| `pegawai001`–`pegawai045` | Pagination & pencarian (7 di antaranya nonaktif, 15 belum verifikasi) |

Aplikasi `seloko-nonaktif` sengaja `isActive=false` — untuk menguji penolakan
login pada aplikasi yang dimatikan.

## Menambah data

**Aplikasi/permission** → `applications.json`. Field `actions` menerima aksi
tunggal (`"read"`) atau nama grup dari `roles.json` (`"content"`,
`"publishable"`, `"verifiable"`, `"readonly"`). Kode permission tersusun
sebagai `<entity>:<action>`.

**Role** → `roles.json`. `allowedActions: null` berarti seluruh permission
aplikasi. Field `apps` mempersempit role ke aplikasi tertentu; bila absen, role
dibuat di semua aplikasi.

**User** → `users.json`. `roles` memakai `{ "app": "<kode>", "role": "<nama>" }`.
`expiresAt` menerima `null` (permanen), `"expired"` (1 hari lalu), `"+30d"` /
`"+12h"`, atau tanggal ISO. Salah tulis nama app/role akan **menggagalkan** seed
dengan pesan jelas, bukan terlewat diam-diam.

## Catatan

- Seed ulang **tidak** menimpa password akun yang sudah ada — kredensial
  pengujian tetap stabil.
- Hash argon2 di-cache per password; tanpa itu 60 akun memakan menit-menit.
- Sinkron penuh: permission yang dihapus dari JSON ikut dicabut dari role saat
  seed berikutnya.
- Kredensial di folder ini **hanya untuk development/staging**.
