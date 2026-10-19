# 📡 Dokumentasi API — SELOKO API

Dokumentasi kontrak API yang **tinggal di repo**, satu berkas per modul, dikelompokkan per aplikasi.
Sumber kebenaran tetap Zod schema di `src/**/*.schema.ts`; berkas di sini adalah cermin yang harus
diperbarui pada perubahan yang sama (lihat [aturan](#aturan-wajib)).

- **Base URL:** `http://localhost:3000/api` (dev) · `API_BASE_URL` di smoke runner
- **Header wajib:** `X-App-Code: <kode aplikasi>` — kecuali `/api/health`
- **Autentikasi:** `Authorization: Bearer <accessToken>`
- **Format respons:** `{ success, message, data, meta? }` — lihat [00-konvensi.md](./00-konvensi.md)

---

## Struktur

```text
docs/api/
├── README.md                  # indeks ini
├── 00-konvensi.md             # format respons, error, header, paginasi, sanitasi
- `CHANGELOG.md`               # riwayat perubahan kontrak API
├── check.ts                   # pemeriksa otomatis: dokumen ⇄ kode (ikut `npm test`)
├── core/                      # aplikasi "seloko" (konsol & identitas)
│   ├── README.md              # ikhtisar modul Core
│   ├── auth.md
│   ├── users.md
│   ├── applications.md
│   ├── permissions.md
│   ├── roles.md
│   ├── menus.md
│   ├── organizations.md
│   └── storage.md
├── bapenda/                   # aplikasi "bapenda-profile"
│   ├── README.md              # ikhtisar modul Bapenda
│   ├── uptds.md
│   ├── banners.md
│   ├── news.md
│   └── pages.md
└── lapak/                     # aplikasi "lapak-jambi-web"
    ├── README.md              # ikhtisar modul Lapak + peta fase
    ├── categories.md
    └── products.md
```

Aplikasi baru mendapat folder sendiri dengan pola yang sama: satu `README.md`
ikhtisar + satu berkas per modul.

---

## Indeks Endpoint

### Core — aplikasi `seloko`

| Modul | Berkas | Endpoint | Akses |
|---|---|:---:|---|
| Auth | [core/auth.md](./core/auth.md) | 6 | publik + bearer |
| Users | [core/users.md](./core/users.md) | 9 | `user:*`, `user-app-role:*` |
| Applications | [core/applications.md](./core/applications.md) | 8 | publik + `application:*` |
| Permissions | [core/permissions.md](./core/permissions.md) | 7 | `permission:*` |
| Roles | [core/roles.md](./core/roles.md) | 8 | `role:*` |
| Menus | [core/menus.md](./core/menus.md) | 8 | `application:*` |
| Organizations | [core/organizations.md](./core/organizations.md) | 8 | publik + `organization:*` |
| Storage | [core/storage.md](./core/storage.md) | 3 | `authenticate` |

**Total Core: 57 endpoint.**

### Bapenda — aplikasi `bapenda-profile`

| Modul | Berkas | Endpoint | Akses |
|---|---|:---:|---|
| UPTD Samsat | [bapenda/uptds.md](./bapenda/uptds.md) | 9 | publik + `uptd:*` |
| Banners | [bapenda/banners.md](./bapenda/banners.md) | 8 | publik + `banner:*` |
| News & Kategori | [bapenda/news.md](./bapenda/news.md) | 14 | publik + `news:*`, `news-category:*` |
| Halaman Profil | [bapenda/pages.md](./bapenda/pages.md) | 8 | publik + `page:*` |

**Total Bapenda: 39 endpoint.**

### Lapak Jambi — aplikasi `lapak-jambi-web`

| Modul | Berkas | Endpoint | Akses |
|---|---|:---:|---|
| Kategori Layanan | [lapak/categories.md](./lapak/categories.md) | 9 | publik + `category:*` |
| Produk / Aset | [lapak/products.md](./lapak/products.md) | 8 | publik + `product:*` |
| Tarif Produk | [lapak/rates.md](./lapak/rates.md) | 8 | `product:*` (lingkup OPD) |
| Katalog Publik OPD | [lapak/catalog.md](./lapak/catalog.md) | 2 | publik |
| Jam Operasional & Tanggal Tutup | [lapak/availability.md](./lapak/availability.md) | 6 | publik + `product:*` |

**Total Lapak: 17 endpoint.**

**Total keseluruhan: 129 endpoint.**

---

## Aturan Wajib

Berlaku untuk developer dan AI Agent. Bagian ini yang membuat dokumentasi tidak basi.

1. **Berkas dokumentasi diperbarui pada perubahan yang SAMA** dengan kodenya — tidak ditunda,
   tidak "nanti sekalian". PR yang mengubah rute/parameter/body/respons tanpa memperbarui
   `docs/api/` dianggap belum selesai.
2. **Endpoint baru** → tambahkan baris di tabel berkas modulnya **dan** perbarui jumlah endpoint
   di `README.md` modul + tabel indeks ini.
3. **Endpoint berubah** (path, query, body, bentuk respons, guard/izin) → perbarui tabel endpoint,
   contoh request/response, dan catat di [`CHANGELOG.md`](./CHANGELOG.md).
4. **Endpoint dihapus** → jangan hapus barisnya begitu saja; pindahkan ke bagian *Deprecated* di
   berkas modul dengan tanggal dan penggantinya, lalu catat di `CHANGELOG.md`.
5. **Modul baru** → buat `docs/api/<app>/<modul>.md` mengikuti format baku, daftarkan di
   `docs/api/<app>/README.md` dan indeks di atas.
6. **Aplikasi baru** → buat folder `docs/api/<app>/` + `README.md` ikhtisar.
7. **Kontrak mengikuti kode.** Bila dokumen dan Zod schema berbeda, yang benar adalah schema —
   perbaiki dokumennya, atau perbaiki keduanya bila schema-nya yang salah.
8. **Jangan menyalin isi respons secara manual dari ingatan.** Ambil dari `*.schema.ts` atau
   panggil endpoint sungguhan, supaya bentuknya nyata.

### Format baku satu berkas modul

```markdown
# <Nama Modul>

- **Aplikasi:** `<kode>` · **Prefix:** `/api/<prefix>` · **Jumlah endpoint:** N
- **Sumber kode:** `src/modules/<...>/<modul>.routes.ts`

## Ringkasan Endpoint
| No | Method | Path | Guard | Deskripsi |

---

## <n>. <METHOD> /api/<path>

**Akses:** `authenticate` + `<permission>` (aplikasi `<kode>`)

### Path Parameter            ← hanya bila ada :param
| Nama | Wajib | Tipe | Aturan |

### Query Parameter           ← hanya bila ada query
| Nama | Wajib | Tipe | Aturan | Default | Keterangan |

### Request Body              ← hanya bila ada body
| Field | Wajib | Tipe | Aturan | Default | Nullable | Keterangan |

### Contoh Request
### Response <kode>
<daftar field + contoh JSON nyata>

**Error:** `<kode>` <alasan>

---
## Catatan Perilaku
```

**Aturan penulisan tabel parameter:**
- Kolom **Wajib** memakai `✓` (wajib) atau `—` (opsional). Jangan pakai kata "yes/no".
- **Aturan** = batas yang benar-benar ditegakkan Zod (panjang, regex, enum), bukan saran.
- **Default** diisi nilai sebenarnya bila schema punya `.default()`; `—` bila tidak ada.
- **Nullable** hanya muncul di tabel body: `✓` bila `null` boleh dikirim eksplisit.
- Setiap endpoint **wajib** punya contoh request dan contoh response yang nyata
  (diambil dari schema atau hasil panggilan sungguhan) — bukan `properties: {}`.
- Daftar **Error** menyebut kode status + pemicunya, bukan hanya "bisa gagal".
```

---

## Pemeriksa Otomatis

`docs/api/check.ts` dijalankan oleh `npm test` dan memastikan **5 hal**:

| # | Yang diperiksa | Menangkap kasus |
|:--:|---|---|
| 1 | Angka **Jumlah endpoint** di berkas modul = jumlah rute nyata di `<modul>.routes.ts` | Rute ditambah/dihapus tapi header tidak diperbarui |
| 2 | Setiap `METHOD` + `path` di kode muncul di tabel ringkasan dokumen | Endpoint benar-benar tidak didokumentasikan |
| 3 | Setiap **field request** (dari `querystring`/`body`/`params` di Zod) muncul sebagai nama ber-backtick di dokumen | Field baru/terhapus tidak tercatat |
| 4 | Total cocok dengan `Total keseluruhan: N endpoint` di indeks | Indeks basi |
| 5 | Tiap berkas modul tertaut dari `docs/api/<app>/README.md` | Berkas yatim |

Pemeriksaan #3 membaca literal `z.object({...})` di `*.schema.ts`, mengikuti pewarisan
`.partial()` / `.omit()` / `.extend()` / `.pick()`, lalu mencocokkan tiap nama field ke dokumen.
Saat ini **331 field request** diperiksa.

Contoh keluaran saat gagal:

```text
AssertionError: core/users.md: field "accountType" (dari ListUsersQuerySchema) tidak ada di dokumen
AssertionError: core/users.md: klaim 10 endpoint, kode punya 9
```

**Yang TIDAK diperiksa otomatis** (butuh review manusia): nilai batas di dalam kolom *Aturan*
(mis. `limit` maks 100 vs 50), tipe data, dan bentuk respons. Pemeriksa hanya menjaga
**keberadaan** field, bukan isi selnya.

Kalau Anda menambah rute lalu lupa memperbarui dokumen, `npm test` **gagal** dengan pesan yang
menyebut modul dan rute mana. Jalankan manual kapan saja:

```bash
npx tsx docs/api/check.ts
```

## Perbedaan dengan Apidog

Dokumentasi Apidog (`seloko.apidog.io`) adalah **salinan untuk dibaca manusia & dicoba langsung**.
Berkas di folder ini yang menjadi **acuan utama di repo** karena ikut di-review bersama kodenya.

Setelah memperbarui `docs/api/`, sinkronkan ke Apidog dengan menyalin bagian yang berubah.
Perbedaan yang diketahui saat ini: Apidog belum memuat modul **Organizations**, **Pages**, dan
`GET /users/:id/roles`, serta belum mencantumkan `organizationIds` pada Assign Role.
