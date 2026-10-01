# Data Seeder SELOKO API

Seluruh data seed ada di folder ini sebagai JSON. `prisma/seed.ts` hanya
orkestrator dan logikanya ada di `prisma/seed/*.seeder.ts` — untuk menambah
aplikasi, permission, role, menu, atau akun uji, **edit JSON, jangan sentuh
kode.**

## Perintah

```
npm run db:seed                # seed / perbarui (idempoten, aman diulang)
npm run db:seed:reset          # kosongkan BARIS tabel RBAC lebih dulu, lalu seed
npm run db:migrate:reset       # ⚠️ jatuhkan & bangun ulang SKEMA dari migration (tanpa seed)
npm run db:migrate:reset:seed  # ⚠️ bangun ulang skema lalu seed
npm run db:smoke               # uji 26 skenario ke API yang sedang jalan
npm run db:check:menus         # verifikasi pohon sidebar hasil seed terhadap DB
```

`db:seed:reset` hanya menghapus baris — skema tetap. `db:migrate:reset`
menjatuhkan seluruh database lalu menjalankan ulang semua migration; pakai itu
saat skema berubah atau migration history perlu diuji dari nol. **Keduanya
hanya untuk database development.**

## Kode seeder

| Berkas | Tanggung jawab |
|---|---|
| `prisma/seed.ts` | Orkestrator: baca JSON, panggil seeder berurutan, cetak ringkasan |
| `prisma/seed/types.ts` | Bentuk seluruh berkas JSON — satu-satunya definisi |
| `prisma/seed/utils.ts` | Prisma client bersama, `loadJson`, hash argon2 ber-cache |
| `prisma/seed/reset.ts` | Pengosongan baris untuk `--reset` |
| `prisma/seed/applications.seeder.ts` | Aplikasi, permission, role (**jalan pertama**) |
| `prisma/seed/menus.seeder.ts` | Sidebar + `baseUrl`/`icon` aplikasi |
| `prisma/seed/users.seeder.ts` | Akun uji, penugasan role, pegawai massal |

Urutan di `seed.ts` wajib: menu dan user menautkan diri ke permission/role
lewat kode/nama, jadi `applications.seeder` harus selesai lebih dulu.

## Berkas

| Berkas | Isi |
|---|---|
| `applications.json` | Aplikasi terdaftar + permission per aplikasi |
| `roles.json` | Label aksi, grup aksi, role bawaan |
| `users.json` | Akun uji, penugasan role, pegawai massal |
| `menus.json` | Sidebar per aplikasi: hirarki, ikon, alamat, pembatas izin/role |
| `smoke.sh` | Uji cepat: login, permission, pagination, /auth/me |
| `menus.check.ts` | Verifikasi 15 sifat pohon sidebar langsung dari DB |

## Hasil seed

5 aplikasi, 81 permission, 27 role, 60 user, 65 penugasan role,
36 menu sidebar, 12 pembatas role menu.

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

**Menu sidebar** → `menus.json`. Bentuknya bersarang mengikuti sidebar
sesungguhnya; `items` boleh sedalam apa pun. Per aplikasi juga diisi `baseUrl`
dan `icon` aplikasi (keduanya ditulis ke tabel `applications`).

| Field | Arti |
|---|---|
| `code` | Kunci upsert dalam lingkup aplikasi. **Jangan diubah** — label boleh |
| `label` / `icon` | Tampilan di sidebar; `icon` memakai nama ikon lucide |
| `path` | Relatif (`/cms/produk`) digabung dengan `baseUrl`; absolut dipakai apa adanya; absen = parent grup saja |
| `isExternal` | Buka di tab baru — untuk tautan ke aplikasi lain |
| `permission` | Kode permission di aplikasi yang **sama**. Absen = bebas izin |
| `roles` | Nama role yang boleh melihat. Absen/kosong = seluruh role |
| `isActive` | `false` menyembunyikan dari semua orang |

Urutan array menentukan `sortOrder` (dikali 10, menyisakan ruang untuk
menyelipkan menu lewat CMS tanpa menomori ulang saudara sekandungnya).
Permission atau role yang salah tulis **menggagalkan** seed — menu yang
seharusnya terbatas tidak boleh diam-diam tampil untuk semua orang.

## Catatan

- Seed ulang **tidak** menimpa password akun yang sudah ada — kredensial
  pengujian tetap stabil.
- Hash argon2 di-cache per password; tanpa itu 60 akun memakan menit-menit.
- Sinkron penuh: permission yang dihapus dari JSON ikut dicabut dari role saat
  seed berikutnya.
- Sinkron penuh juga berlaku untuk menu: baris yang `code`-nya tidak lagi ada di
  `menus.json` **dihapus**, begitu pula pembatas role yang dicabut. Tanpa itu
  menu hantu tertinggal di sidebar.
- Kredensial di folder ini **hanya untuk development/staging**.
