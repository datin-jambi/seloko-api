# 🏛️ SELOKO API — Centralized Core Backend & Multi-App Engine

> **Pemerintah Provinsi Jambi — Badan Pengelola Keuangan dan Pendapatan Daerah (BPKPD)**  
> Arsitektur: **Modular Monolith** | Runtime: **Node.js 20+ (TypeScript Strict)** | Framework: **Fastify v5**  
> Database: **PostgreSQL 16 + Prisma v6** | Cache: **Redis 7** | Message Broker: **RabbitMQ 3** | Storage: **ImageKit**

---

## 📑 Daftar Isi

1. [Gambaran Umum & Arsitektur](#-gambaran-umum--arsitektur)
2. [Tech Stack](#-tech-stack)
3. [Struktur Folder & Penjelasan Detail](#-struktur-folder--penjelasan-detail)
4. [Prinsip Arsitektur Inti](#-prinsip-arsitektur-inti)
   - [Multi-Tenancy via `X-App-Code`](#1-multi-tenancy-via-x-app-code)
   - [Dua Dunia Akun: INTERNAL vs PUBLIC](#2-dua-dunia-akun-internal-vs-public)
   - [Dynamic Granular RBAC (Redis Cached)](#3-dynamic-granular-rbac-redis-cached)
   - [Sistem Storage Terpusat (ImageKit CDN)](#4-sistem-storage-terpusat-imagekit-cdn)
   - [Event-Driven Asynchronous Worker (RabbitMQ)](#5-event-driven-asynchronous-worker-rabbitmq)
5. [Panduan Pengembangan (Development Guide)](#-panduan-pengembangan-development-guide)
   - [Pola 4-Layer Module](#pola-4-layer-module)
   - [Langkah Demi Langkah Menambah Modul Baru](#langkah-demi-langkah-menambah-modul-baru)
6. [Panduan Scaling Aplikasi](#-panduan-scaling-aplikasi)
7. [Manajemen Database & Seeder (`prisma/seeds/`)](#-manajemen-database--seeder-prismaseeds)
8. [Unified Smoke Testing (`prisma/smoke/`)](#-unified-smoke-testing-prismasmoke)
9. [Instalasi & Menjalankan Proyek](#-instalasi--menjalankan-proyek)
10. [Daftar Endpoint API Utama](#-daftar-endpoint-api-utama)

---

## 🌟 Gambaran Umum & Arsitektur

**SELOKO API** adalah backend terpusat (*Centralized Core API & Identity Gateway*) yang melayani ekosistem aplikasi Pemerintah Provinsi Jambi. Sistem ini didesain menggunakan pendekatan **Modular Monolith**:
* Seluruh domain berada dalam satu basis kode (mudah dirawat, deploy ringkas, performa tinggi tanpa network overhead mikroservis).
* Pemisahan batas domain (*bounded context*) sangat ketat dan terisolasi, sehingga sewaktu-waktu siap dipecah menjadi *microservice* independen jika beban trafik memerlukan scaling terpisah.

---

## 🛠 Tech Stack

| Layer | Teknologi | Keterangan & Kegunaan |
|---|---|---|
| **Runtime** | Node.js v20+ & TypeScript | Strict Mode (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`) |
| **Framework** | Fastify v5 | Framework HTTP berkinerja tinggi, minim overhead, arsitektur plugin |
| **Database & ORM** | PostgreSQL 16 + Prisma v6 | PostgreSQL relasional, migrasi otomatis, UUID v7 untuk performa indeks |
| **In-Memory Cache** | Redis 7 via `ioredis` | Caching hak akses permission user (TTL 5 min) & rate limiting |
| **Message Broker** | RabbitMQ 3 via `amqplib` | Antrean asinkron untuk tugas berat (audit log, email, background jobs) |
| **Object Storage** | ImageKit | Penyimpanan media terpusat, dynamic image transformation & global CDN |
| **Validation** | Zod + `fastify-type-provider-zod` | Validasi skema runtime & penentuan tipe otomatis (type-safety DTO) |
| **Authentication** | `@fastify/jwt` + Argon2id | JWT access token rotasi & hashing password berspesifikasi OWASP |
| **Security** | CORS, Cookie, Rate Limit | Rate-limiting berlapis (login brute-force protection) |

---

## 📁 Struktur Folder & Penjelasan Detail

```text
seloko-api/
├── prisma/                          # Skema database, migrasi, seeder, dan smoke test
│   ├── schema.prisma                # Definisi entitas database utama
│   ├── seed.ts                      # Orkestrator seeder idempoten
│   ├── seeds/                       # Data & logika seeding (dikelompokkan per domain)
│   │   ├── shared/                  # Tipe data bersama (types.ts), helper (utils.ts), reset (reset.ts)
│   │   ├── core/                    # Data awal aplikasi, role, menu, user
│   │   └── bapenda/                 # Data awal domain Bapenda (11 UPTD Samsat Jambi)
│   └── smoke/                       # Unified Smoke Test Runner & dokumentasi pengujian
│       ├── runner.ts                # Test runner native TypeScript (cross-platform)
│       ├── menus.check.ts           # Pengecekan pohon hirarki sidebar menu
│       └── README.md                # Panduan teknis pengujian smoke test
│
├── src/                             # Sumber kode aplikasi utama
│   ├── config/                      # Inisialisasi infrastruktur & Environment
│   │   ├── env.ts                   # Validasi Zod terhadap file .env (fail-fast jika config cacat)
│   │   ├── database.ts              # Singleton Prisma Client
│   │   ├── redis.ts                 # Singleton koneksi Redis & helper invalidasi cache
│   │   ├── rabbitmq.ts              # Singleton koneksi RabbitMQ & channel publisher
│   │   └── imagekit.ts              # Singleton SDK ImageKit Storage
│   │
│   ├── common/                      # Shared Kernel (digunakan lintas modul)
│   │   ├── constants/               # Nilai konstan (APP_CODES, CACHE_TTL, ROLES)
│   │   ├── errors/                  # Hirarki error kustom (AppError, NotFoundError, UnauthorizedError, dll)
│   │   ├── guards/                  # Middleware keamanan (requirePermission, permission resolver)
│   │   ├── middlewares/             # Validasi header X-App-Code & konteks request
│   │   ├── services/                # Layanan utilitas terpusat (Storage/ImageKit service)
│   │   ├── types/                   # Definisi tipe global (JwtPayload, ApiResponse, PaginatedResult)
│   │   └── utils/                   # Fungsi bantuan murni (format response, pagination builder)
│   │
│   ├── modules/                     # Domain Modul (Modular Monolith)
│   │   ├── core/                    # Domain Inti Platform & RBAC
│   │   │   ├── auth/                # Login, Refresh Token, Logout, /auth/me
│   │   │   ├── users/               # Manajemen pengguna (ASN & publik)
│   │   │   ├── applications/        # Manajemen registrasi aplikasi ekosistem
│   │   │   ├── roles/               # Manajemen role per aplikasi
│   │   │   ├── permissions/         # Katalog hak akses & izin per modul
│   │   │   ├── menus/               # Manajemen & resolusi menu sidebar
│   │   │   └── storage/             # Endpoint upload file multipart terpusat
│   │   │
│   │   ├── bapenda/                 # Domain Konten & Layanan Bapenda Jambi
│   │   │   ├── uptds/               # Direktori kantor Samsat, peta layanan, koordinat GPS
│   │   │   ├── banners/             # (Roadmap) Pengelolaan banner portal
│   │   │   ├── articles/            # (Roadmap) Berita, artikel, kategori
│   │   │   ├── faqs/                # (Roadmap) Tanya jawab layanan pajak
│   │   │   └── regulations/         # (Roadmap) Produk hukum & peraturan daerah
│   │   │
│   │   └── lapak/                   # Domain Ekosistem Lapak Jambi (UMKM)
│   │       ├── merchants/           # Manajemen pedagang / UMKM
│   │       └── products/            # Katalog produk & verifikasi
│   │
│   ├── workers/                     # Background Asynchronous Workers (RabbitMQ Consumers)
│   │   ├── queue-names/             # Daftar nama antrean & routing key RabbitMQ
│   │   ├── producers/               # Helper untuk publish event (misal: audit.producer.ts)
│   │   └── consumers/               # Worker standalone penerima pesan (misal: audit.consumer.ts)
│   │
│   ├── app.ts                       # Fastify App Factory (registrasi plugin, CORS, multipart, routes)
│   └── server.ts                    # Bootstrap: startup infrastruktur -> listen HTTP -> graceful shutdown
│
├── .env.example                     # Contoh variabel lingkungan resmi
├── package.json                     # Daftar dependensi & npm scripts
└── tsconfig.json                    # Konfigurasi TypeScript compiler
```

---

## 🏛️ Prinsip Arsitektur Inti

### 1. Multi-Tenancy via `X-App-Code`
Setiap request ke endpoint `/api/*` **wajib** menyertakan header `X-App-Code`.
```http
X-App-Code: seloko
```
* **Fungsi:** Menentukan konteks aplikasi tempat request dijalankan (misal: `seloko`, `bapenda-profile`, `lapak-jambi-web`).
* Middleware `appCodeMiddleware` memvalidasi header ini dan memastikan aplikasi aktif di database sebelum request masuk ke controller.

---

### 2. Dua Dunia Akun: `INTERNAL` vs `PUBLIC`
Sistem memisahkan akun pengguna ke dalam dua dunia demi keamanan:
* **`INTERNAL` (Pegawai/ASN):**
  * Login **hanya melalui satu pintu**: aplikasi gateway `seloko` (Super App).
  * Dari `seloko`, pegawai dapat mengelola aplikasi publik (misal: mengedit UPTD atau berita di `bapenda-profile`) sesuai role yang dimilikinya.
* **`PUBLIC` (Warga/Masyarakat):**
  * Login langsung pada aplikasi publik yang dituju (misal: portal Lapak Jambi).
  * Akun publik tidak memiliki akses ke aplikasi internal `seloko` (akan langsung ditolak `401`).

---

### 3. Dynamic Granular RBAC (Redis Cached)
Tidak ada *hardcoded role enum* di dalam kode. Hak akses diperiksa secara dinamis berbasis string kode permission:
```typescript
// Contoh di route:
fastify.requirePermission("uptd:update", { app: APP_CODES.BAPENDA_PROFILE })
```
* **Alur Resolusi:**
  1. Cek Redis cache: `perms:user:{userId}:app:{appCode}` (TTL 5 menit).
  2. Jika *cache-miss*: Query database relasi `UserAppRole -> Role -> RolePermission -> Permission`.
  3. Simpan ke Redis.
* **Multi-Role Union:** Jika seorang pegawai memegang beberapa role sekaligus dalam satu aplikasi, seluruh hak aksesnya digabungkan (*union*).
* **Super Admin Bypass:** Akun dengan status `isSuperAdmin = true` otomatis melewati seluruh guard izin.
* **Cache Invalidation:** Setiap kali ada mutasi role/permission, cache Redis terkait langsung dibuang seketika (*instant revocation*).

---

### 4. Sistem Storage Terpusat (ImageKit CDN)
Endpoint `/api/storage/upload` mengelola unggahan media multipart secara aman langsung ke cloud storage ImageKit:
* **Folder Otomatis Terisolasi:** Berdasarkan format `/{appCode}/{module}/{subFolder}`.
* **Standarisasi Nama File:** Otomatis menghasilkan nama unik aman hash: `{prefix}_{YYYYMMDD}_{HHmmss}_{hash8}{ext}`.
* **Thumbnail Otomatis Publik:** Menghasilkan URL thumbnail standar (`tr:w-300,h-300`) yang dapat diakses publik tanpa blokir otorisasi dashboard.
* **Stream Truncation Protection:** Mencegah file setengah terkirim/rusak dengan pembatasan ukuran stream hingga 50MB.

---

### 5. Event-Driven Asynchronous Worker (RabbitMQ)
Endpoint HTTP dilarang menjalankan tugas berat secara sinkron.
* Controller mem-publish event ke RabbitMQ (*fire-and-forget*):
  ```typescript
  void publishAuditUserLogin({ userId, appCode, ipAddress });
  ```
* Consumer di folder `src/workers/consumers/` berjalan secara terpisah untuk memproses tugas tersebut di latar belakang tanpa memperlambat respon ke pengguna.

---

## 🚀 Panduan Pengembangan (Development Guide)

Setiap fitur dalam folder `src/modules/<domain>/<feature>` **wajib** mengikuti pola arsitektur **4-Layer Modular Monolith**:

### Pola 4-Layer Module

```text
[HTTP Request]
      │
      ▼
┌──────────────┐   1. Routes (`*.routes.ts`)
│ Route Layer  │   - Mendaftarkan URL & method HTTP
└──────┬───────┘   - Memasang guard: authenticate & requirePermission
       │
       ▼
┌──────────────┐   2. Schema Layer (`*.schema.ts`)
│ Schema Layer │   - Validasi input Query, Params, dan Body via Zod
└──────┬───────┘   - Validasi struktur output response (Type-Safe DTO)
       │
       ▼
┌──────────────┐   3. Controller Layer (`*.controller.ts`)
│  Controller  │   - Mengekstrak data dari request (body, params, query)
└──────┬───────┘   - Memanggil service & mengembalikan HTTP status code
       │
       ▼
┌──────────────┐   4. Service Layer (`*.service.ts`)
│   Service    │   - Logika bisnis murni (Business Logic)
└──────────────┘   - Operasi Prisma database (Find, Create, Update, Delete)
```

---

### Langkah Demi Langkah Menambah Modul Baru

Misalkan Anda ingin membuat modul baru: **Banners** di domain `bapenda`:

#### 1. Buat Model di `prisma/schema.prisma`
```prisma
model Banner {
  id            String    @id @default(uuid(7)) @db.VarChar(36)
  applicationId String    @map("app_id") @db.VarChar(36)
  title         String    @db.VarChar(150)
  imageUrl      String    @map("image_url") @db.VarChar(500)
  imageFileId   String?   @map("image_file_id") @db.VarChar(100)
  linkUrl       String?   @map("link_url") @db.VarChar(500)
  sortOrder     Int       @default(0) @map("sort_order")
  isActive      Boolean   @default(true) @map("is_active")
  createdAt     DateTime  @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt     DateTime  @updatedAt @map("updated_at") @db.Timestamptz()
  deletedAt     DateTime? @map("deleted_at") @db.Timestamptz()

  application   Application @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  @@map("banners")
}
```
Jalankan migrasi database:
```bash
npm run db:migrate:dev -- --name add_banners_model
```

#### 2. Buat Skema Validasi (`banners.schema.ts`)
Definisikan schema query, params, request body, dan response menggunakan Zod.
```typescript
import { z } from "zod";

export const CreateBannerBodySchema = z.object({
  title: z.string().trim().min(3).max(150),
  imageUrl: z.string().url(),
  imageFileId: z.string().optional(),
  linkUrl: z.string().url().optional().nullable(),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});
```

#### 3. Buat Service Bisnis (`banners.service.ts`)
Tulis query Prisma murni tanpa ketergantungan pada objek Fastify `Request` atau `Reply`.
```typescript
import { prisma } from "~/config/database.js";

export async function listPublicBanners(appCode: string) {
  return prisma.banner.findMany({
    where: {
      application: { code: appCode },
      isActive: true,
      deletedAt: null,
    },
    orderBy: { sortOrder: "asc" },
  });
}
```

#### 4. Buat Handler Controller (`banners.controller.ts`)
Ekstrak payload dari `request` dan kirim respons melalui `reply`.
```typescript
import type { FastifyRequest, FastifyReply } from "fastify";
import { listPublicBanners } from "./banners.service.js";

export async function handleGetPublicBanners(request: FastifyRequest, reply: FastifyReply) {
  const data = await listPublicBanners(request.appCode);
  return reply.send({ statusCode: 200, code: "SUCCESS", message: "Banners retrieved", data });
}
```

#### 5. Daftarkan Rute (`banners.routes.ts`)
Pasang rute dan proteksi izin permission:
```typescript
import type { FastifyInstance } from "fastify";
import { APP_CODES } from "~/common/constants/index.js";
import { handleGetPublicBanners } from "./banners.controller.js";

export async function bannersRoutes(fastify: FastifyInstance): Promise<void> {
  // Public
  fastify.get("/public", handleGetPublicBanners);

  // CMS Protected
  fastify.post("/", {
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("banner:create", { app: APP_CODES.BAPENDA_PROFILE }),
    ],
  }, handleCreateBanner);
}
```

#### 6. Daftarkan di `src/app.ts`
```typescript
import { bannersRoutes } from "./modules/bapenda/banners/banners.routes.js";
// ...
await app.register(bannersRoutes, { prefix: "/api/bapenda/banners" });
```

#### 7. Daftarkan Permission di Seeder (`prisma/seeds/core/applications.json`)
Tambahkan entitas permission ke aplikasi target (`bapenda-profile`):
```json
{
  "entity": "banner",
  "label": "Banner Promo & Pengumuman",
  "actions": ["content"]
}
```
Lalu jalankan `npm run db:seed`.

---

## 📈 Panduan Scaling Aplikasi

Arsitektur SELOKO API dirancang siap berkembang untuk beban kerja skala besar:

### 1. Stateless API & Horizontal Scaling
* Aplikasi API sepenuhnya **stateless** (tidak menyimpan sesi di memori aplikasi).
* Sesi dan token refresh di-hash di database, sementara hak akses di-cache di **Redis**.
* Anda dapat menjalankan 2, 4, atau 10 instance container API di balik Load Balancer (NGINX / HAProxy / AWS ALB) tanpa risiko konflik sesi.

### 2. Caching Berlapis (Redis Layer)
* **RBAC Cache:** Izin per user di-cache selama 5 menit. Menghindari ratusan query JOIN kompleks pada database di setiap request.
* **Distributed Rate Limiting:** Menggunakan Redis store untuk memastikan batasan request (misal: 5x gagal login) ditegakkan serentak di seluruh instance container.

### 3. Asynchronous Worker Scaling
* Antrean RabbitMQ dapat dikonsumsi oleh beberapa worker container sekaligus.
* Jika traffic audit log atau pengiriman notifikasi memuncak, cukup naikkan replika container worker `src/workers/consumers/audit.consumer.ts` secara independen tanpa membebani instance API utama.

### 4. Database Connection Pooling & UUID v7
* Menggunakan **UUID v7** untuk seluruh Primary Key: memiliki sifat terurut berbasis waktu (*time-ordered*), menjaga indeks B-Tree PostgreSQL tetap efisien dan mencegah fragmentasi penyimpanan.
* Gunakan connection pooler (misal: **PgBouncer** atau Supabase connection pool) saat jumlah instance API bertambah.

---

## 💾 Manajemen Database & Seeder (`prisma/seeds/`)

Seluruh data master awal dan data uji dikelola secara rapi di dalam folder [prisma/seeds/](file:///c:/Users/ASUS/Documents/BPKPD/Code/seloko-api/prisma/seeds/):

```text
prisma/seeds/
├── shared/     # Utilitas types.ts, utils.ts (Prisma client & loadJson), reset.ts
├── core/       # applications.json, roles.json, menus.json, users.json (+ logikanya)
└── bapenda/    # uptds.json (+ uptds.seeder.ts untuk 11 Samsat Jambi)
```

### Perintah Database:
```bash
# Sinkronkan skema Prisma dengan TypeScript
npm run db:generate

# Jalankan migrasi baru pada database development
npm run db:migrate:dev

# Jalankan seluruh seeder (Idempoten: aman diulang tanpa duplikasi)
npm run db:seed

# Kosongkan baris data RBAC & seeder lalu seed ulang
npm run db:seed:reset
```

---

## 💨 Unified Smoke Testing (`prisma/smoke/`)

Smoke test adalah pengujian cepat end-to-end yang memverifikasi HTTP response, guard autentikasi, isolasi tenant, dan data database.

### Jalankan Uji Coba:
```bash
# Uji seluruh sistem sekaligus (Satu Pintu Utama)
npm run db:smoke

# Uji modul spesifik saja (Filter)
npm run db:smoke -- auth
npm run db:smoke -- applications
npm run db:smoke -- roles
npm run db:smoke -- menus
npm run db:smoke -- uptds
```

Dokumentasi lengkap skenario pengujian dan tabel kredensial akun uji dapat dibaca di [prisma/smoke/README.md](file:///c:/Users/ASUS/Documents/BPKPD/Code/seloko-api/prisma/smoke/README.md).

---

## ⚡ Instalasi & Menjalankan Proyek

### 1. Kebutuhan Sistem
* Node.js v20+ & npm
* Docker & Docker Compose (untuk PostgreSQL, Redis, RabbitMQ)

### 2. Jalankan Infrastruktur Lokal
```bash
docker compose up -d
```
Container yang aktif:
* **PostgreSQL 16:** Port `5432`
* **Redis 7:** Port `6379`
* **RabbitMQ 3:** Port `5672` (Management Dashboard di `http://localhost:15672`)

### 3. Salin Environment
```bash
cp .env.example .env
# Sesuaikan kredensial database & kunci ImageKit Anda di .env
```

### 4. Install Dependensi & Setup Database
```bash
npm install
npm run db:generate
npm run db:migrate:dev
npm run db:seed
```

### 5. Jalankan Server API
```bash
npm run dev
```
Server berjalan di `http://localhost:3000`.

---

## 📡 Daftar Endpoint API Utama

| Prefix Path | Kategori | Deskripsi Singkat |
| :--- | :--- | :--- |
| `/api/auth` | Autentikasi | Login multi-tenant, refresh token, logout, profil `/auth/me` |
| `/api/users` | Pengguna | Manajemen akun pegawai internal dan publik |
| `/api/applications` | Multi-Tenant | Registrasi & konfigurasi aplikasi di ekosistem Seloko |
| `/api/roles` | RBAC | Pengelolaan peran (*roles*) dan penugasan permission |
| `/api/permissions` | RBAC | Katalog hak akses & resolusi izin `/permissions/:appId/me` |
| `/api/menus` | Navigasi | Hirarki menu sidebar CMS dan resolusi sidebar `/menus/me` |
| `/api/storage` | Storage | Upload multipart terpusat ke ImageKit & penghapusan file |
| `/api/bapenda/uptds` | Bapenda | Direktori publik kantor Samsat Jambi & manajemen CMS UPTD |
| `/health` | Observabilitas | Liveness probe & status kesiapan infrastruktur (`/health/ready`) |

---

## 👥 Tim & Pengembang
Dikelola oleh **Tim Pengembang BPKPD Provinsi Jambi (Datin Jambi)**.  
Dilarang mempublikasikan berkas konfigurasi rahasia (*secrets*) atau kredensial produksi ke repositori publik.
