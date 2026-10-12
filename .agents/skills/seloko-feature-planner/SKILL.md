---
name: seloko-feature-planner
description: >-
  Panduan perencanaan fitur baru, penyusunan spesifikasi (PRD), perancangan ERD, dan kontrak endpoint sebelum mulai implementasi kode pada SELOKO API.
  Gunakan skill ini sebelum memulai pembuatan modul baru seperti Articles, FAQs, Regulations, atau modul perpajakan daerah.
---

# 📐 SELOKO Feature & PRD Planning Blueprint

Gunakan dokumen panduan ini sebelum memulai penulisan kode pada modul baru. Perencanaan yang matang memastikan kode modular, sesuai standar multi-tenant, dan minim refactoring di kemudian hari.

---

## 📌 Checklist Perencanaan Fitur (PRD Step-by-Step)

### Langkah 0: Sinkronisasi Living PRD (`.agents/prd/`)
Setiap fitur harus berakar dari dan dicatat ke dalam dokumen PRD domain terkait:
- [ ] Buka [`.agents/prd/README.md`](../../prd/README.md) untuk melihat daftar domain.
- [ ] Buka PRD domain terkait (misal: [`01-seloko-identity.prd.md`](../../prd/01-seloko-identity.prd.md) atau [`02-bapenda-profile.prd.md`](../../prd/02-bapenda-profile.prd.md)).
- [ ] **Wajib Perbarui PRD:** Catat kesepakatan fitur hasil diskusi pengguna ke dalam berkas PRD sebelum coding (tambahkan spesifikasi modul, field database, dan alur bisnis).

---

### Langkah 1: Identifikasi Domain & Audiens Target
- [ ] **Aplikasi Pemilik:** Apakah modul ini milik `bapenda-profile`, `seloko`, atau aplikasi publik lain?
- [ ] **Tipe Pengguna:**
  - Siapa yang mengonsumsi endpoint publik? (Masyarakat / Wajib Pajak).
  - Siapa yang mengelola di CMS? (Operator, Admin Bapenda, Verifikator).

---

### Langkah 2: Pemodelan Skema Database (ERD)
Buat rancangan model Prisma dengan mematuhi:
- [ ] Primary Key: `@id @default(uuid(7)) @db.VarChar(36)`
- [ ] Relasi Multi-Tenant: `applicationId String @map("app_id")`
- [ ] Slug Unik per Tenant: `@@unique([applicationId, slug])`
- [ ] Pasangan Kolom Media: Setiap gambar/dokumen wajib memiliki pasangan:
  - `imageUrl` & `imageFileId`
  - Jika dokumen: `fileUrl` & `fileId`, `fileSize`, `mimeType`
- [ ] Status & Soft-Delete: `isActive Boolean @default(true)`, `deletedAt DateTime? @db.Timestamptz()`
- [ ] Pemetaan Tabel & Kolom: `@@map("<plural_table_name>")` & `@map("<snake_case>")`

---

### Langkah 3: Matriks Hak Akses (RBAC & Permissions)
Tentukan permission apa saja yang dibutuhkan sebelum mendaftarkannya ke `prisma/seeds/core/applications.json`:

| Entitas | Aksi | Kode Permission | Deskripsi |
|---|---|---|---|
| `<entity>` | list | `<entity>:list` | Melihat tabel daftar data di CMS |
| `<entity>` | read | `<entity>:read` | Melihat detail satu data |
| `<entity>` | create | `<entity>:create` | Menambah data baru |
| `<entity>` | update | `<entity>:update` | Memperbarui data & toggle status |
| `<entity>` | delete | `<entity>:delete` | Menghapus (soft-delete) data |

---

### Langkah 4: Kontrak Endpoint API (API Specification)
Rancang struktur rute Fastify:

#### 1. Jalur Publik (Frontend Website / Portal):
- `GET /api/<domain>/<feature>/public` — Daftar data aktif publik (mis. artikel terbit, FAQs aktif).
- `GET /api/<domain>/<feature>/public/:slug` — Detail konten berdasarkan slug.

#### 2. Jalur CMS Internal (Konsol Pengelola):
- `GET /api/<domain>/<feature>` — List data dengan pagination, search, dan filter.
- `GET /api/<domain>/<feature>/:id` — Detail lengkap untuk form edit.
- `POST /api/<domain>/<feature>` — Tambah data baru.
- `PUT /api/<domain>/<feature>/:id` — Update lengkap.
- `PATCH /api/<domain>/<feature>/:id/active` — Toggle status aktif/publikasi.
- `DELETE /api/<domain>/<feature>/:id` — Soft-delete.

---

### Langkah 5: Desain Skenario Uji Coba (Smoke Test Plan)
Tentukan minimal 4 skenario uji coba yang wajib dimasukkan ke `prisma/smoke/runner.ts`:
1. **Public Read Test:** Endpoint publik merespons 200 tanpa login dan mengembalikan data terbitan.
2. **CMS Authorization Guard:** Pengguna tanpa permission ditolak (403 Forbidden).
3. **Data Creation & Media Validation:** Membuat data baru dengan status aktif dan validasi ImageKit.
4. **Lifecycle Modification:** Update, toggle active, dan soft-delete data berhasil.

---

### Langkah 6: Pembaruan Status Selesai pada Living PRD
Setelah modul selesai diimplementasikan, seeder dibuat, dan `npm run db:smoke` lolos 100%:
- [ ] Buka PRD domain di `.agents/prd/XX-<domain>.prd.md`.
- [ ] Ubah status modul dari `🟡 In Progress` atau `⏳ Planned` menjadi `✅ Completed`.
- [ ] Perbarui tabel status modul di [`.agents/prd/README.md`](../../prd/README.md) dan [`AGENTS.md`](../../../AGENTS.md).
