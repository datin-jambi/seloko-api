# SELOKO API — Centralized Core Backend

**Bapenda Jambi** | Modular Monolith | Node.js 20+ | Fastify v5 | PostgreSQL 16 | Redis | RabbitMQ

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js v20+ with TypeScript (Strict Mode) |
| Web Framework | Fastify v5 |
| ORM | Prisma v6 + PostgreSQL 16 |
| Caching | Redis 7 via `ioredis` |
| Message Broker | RabbitMQ 3 via `amqplib` |
| Validation | Zod + `fastify-type-provider-zod` |
| Auth | `@fastify/jwt` + Argon2id |
| Security | `@fastify/cors`, `@fastify/cookie`, `@fastify/rate-limit` |

---

## Project Structure

```
src/
├── config/               # Validated env, DB, Redis, RabbitMQ singletons
│   ├── env.ts            # Zod env validation — fails fast on bad config
│   ├── database.ts       # Prisma singleton
│   ├── redis.ts          # ioredis singleton + permission cache helpers
│   └── rabbitmq.ts       # amqplib connection + publishToExchange()
├── common/
│   ├── constants/        # App codes, cache TTLs, headers, actions
│   ├── errors/           # AppError base + typed subclasses
│   ├── guards/           # permission.guard.ts — dynamic RBAC
│   ├── middlewares/      # appCode.middleware.ts — X-App-Code header
│   └── types/            # JwtPayload, PaginatedResult, ApiResponse
├── modules/
│   ├── core/
│   │   ├── auth/         # Login, Refresh, Logout, Me (4-layer)
│   │   ├── rbac/         # Roles, Permissions, UserAppRoles CRUD
│   │   └── users/        # User CRUD
│   ├── bapenda/
│   │   ├── articles/     # Article management
│   │   └── banners/      # Banner management
│   └── lapak/
│       ├── merchants/    # Merchant management
│       └── products/     # Product management
├── workers/
│   ├── queue-names/      # Queue & routing key constants
│   ├── producers/        # publish helpers (audit.producer.ts, etc.)
│   └── consumers/        # Worker scripts (audit.consumer.ts, etc.)
├── app.ts                # Fastify app factory — plugins & routes
└── server.ts             # Bootstrap: infra → app → listen → shutdown
```

---

## Core Architectural Principles

### 1. Multi-Tenant via `X-App-Code` Header

Every API request **must** carry the `X-App-Code` header. The `appCodeMiddleware` validates this on every request and populates `request.appCode`.

Only routes under `/api/` require the header. Everything else — `/health`,
future metrics or docs endpoints — is public by default.

```bash
curl -H "X-App-Code: bapenda-profile" http://localhost:3000/api/auth/me
```

Registered codes: `seloko`, `bapenda-profile`, `lapak-jambi-web`, `lapak-jambi-app`.

### 2. Dynamic Granular RBAC (No Enum Roles)

Permissions live in the `permissions` table, scoped to one application. The `code`
column is the authoritative key checked by the guard; `module` is only a grouping
label for the CMS UI:

```
article:publish      # Menerbitkan Artikel
product:approve      # Menyetujui Produk
user:delete          # Menghapus Pengguna
```

Permissions are resolved per user+app context:
1. Check Redis cache: `perms:user:{userId}:app:{appCode}` (TTL: 5 min)
2. On miss: query DB (UserAppRole → Role → RolePermission → Permission)
3. Write back to cache

A user may hold **several roles within the same application** — the resulting
permissions are unioned, never overridden. Assignments can carry an `expiresAt`
for temporary access.

**Super Admin** (`isSuperAdmin: true`) bypass ALL permission checks automatically.

### 3. Guard Usage in Routes

```typescript
// In *.routes.ts
app.delete("/articles/:id", {
  preHandler: [
    fastify.authenticate,
    fastify.requirePermission("article:delete")
  ],
}, handleDeleteArticle);
```

### 4. Background Jobs via RabbitMQ

HTTP handlers **never** run heavy tasks synchronously. They publish events and return immediately:

```typescript
// In controller — fire and forget
void publishAuditUserLogin({ userId, appCode, ipAddress });
return reply.status(202).send(accepted("Processing"));
```

Workers in `src/workers/consumers/` consume and process these events.

---

## Getting Started

### Prerequisites
- Docker & Docker Compose
- Node.js v20+
- npm

### 1. Start Infrastructure

```bash
docker compose up -d
```

This starts: PostgreSQL 16 (:5432), Redis 7 (:6379), RabbitMQ 3 (:5672, Management UI :15672)

### 2. Environment Setup

```bash
cp .env.example .env
# Edit .env with your secrets
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Database Setup

```bash
npm run db:generate     # Generate Prisma client
npm run db:migrate:dev  # Run migrations
npm run db:seed         # Seed initial data
```

### 5. Start Development Server

```bash
npm run dev
```

API will be available at `http://localhost:3000`

### 6. Start Workers (Separate Terminals)

```bash
npm run dev:worker:audit    # Audit log consumer
```

---

## API Endpoints

### Auth (`/api/auth`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/login` | ❌ | Login with email/username + password (rate limited: 5 / 15 min) |
| POST | `/refresh` | Cookie | Refresh access token (rotates, re-checks app access) |
| POST | `/logout` | ✅ | Revoke refresh token |
| POST | `/logout-all` | ✅ | Revoke every active session across all apps |
| GET | `/me` | ✅ | Get profile + active roles + permissions |

Login and refresh both verify the user holds a live (non-expired) role assignment
in the app named by `X-App-Code`. Without that check any account in the ecosystem
could sign into any app just by swapping the header.

### Applications (`/api/applications`)

Manajemen aplikasi yang terdaftar di ekosistem — super app registry.

| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/` | `application:list` | Daftar aplikasi + jumlah permission/role/menu/penugasan |
| GET | `/me` | ✅ auth saja | Aplikasi yang boleh diakses pemanggil — mengisi launcher super app |
| GET | `/:id` | `application:read` | Detail + role (dengan `permissionCount`) + permission dikelompokkan per `module` |
| POST | `/` | `application:create` | Daftarkan aplikasi baru |
| PATCH | `/:id` | `application:update` | Ubah `name`, `description`, `baseUrl`, `icon` |
| PATCH | `/:id/activate` | `application:update` | Aktifkan / nonaktifkan |
| DELETE | `/:id` | `application:delete` | Hapus permanen (cascade ke permission, role, menu) |

`code` tidak dapat diubah setelah dibuat: nilainya tertanam di header
`X-App-Code` milik klien yang sudah terpasang, di `refresh_tokens.app_code`, dan
di `audit_logs` yang bersifat tak-termutasi.

Menonaktifkan aplikasi langsung menutup pintu — `assertUserCanAccessApp` menolak
login dan refresh, seluruh refresh token aplikasi itu dicabut, dan cache
permission se-aplikasi dibuang agar access token yang masih hidup tidak menikmati
izin dari cache selama TTL.

Dua pengaman: aplikasi `seloko` tidak dapat dinonaktifkan atau dihapus (konsol
manajemen akan mengunci dirinya sendiri), dan penghapusan ditolak `409` selama
masih ada penugasan role pengguna — cascade akan menghapusnya diam-diam.

#### `GET /applications/me`

Tanpa permission — isinya milik si pemanggil sendiri. Hanya metadata navigasi
yang dikembalikan (`code`, `name`, `description`, `baseUrl`, `icon`) plus nama
role dan `expiresAt`; tidak ada `counts`, `isActive`, atau timestamp, sehingga
isolasi antar aplikasi tetap utuh meski token hanya terbit untuk satu `appCode`.

Penyaringnya sama dengan `assertUserCanAccessApp` — aplikasi aktif, role aktif,
penugasan belum kedaluwarsa — supaya daftar ini tidak pernah menampilkan
aplikasi yang justru menolak saat diklik. Beberapa role di satu aplikasi
digabung menjadi satu entri (`roles: ["editor", "verifikator"]`), dan super
admin menerima seluruh aplikasi aktif dengan `roles: []`.

### Roles (`/api/roles`)

Manajemen role per aplikasi. Cakupannya lintas aplikasi — `seloko` adalah konsol
terpusat, jadi operator di sana mengelola role milik `lapak-jambi-web`,
`bapenda-profile`, dan seterusnya. Permission `role:*` memang hanya ada di
`seloko`, sehingga pintunya sudah sempit secara alami.

| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/` | `role:list` | Daftar role + `permissionCount` + `userCount`; filter `applicationId`, `isActive`, `isSystemRole`, `search` |
| GET | `/:id` | `role:read` | Detail + SELURUH permission aplikasi, ditandai `granted` |
| POST | `/` | `role:create` | Buat role sekaligus set permission awalnya |
| PATCH | `/:id` | `role:update` | Ubah `name` atau `description` |
| PUT | `/:id/permissions` | `role:update` | Setel ulang seluruh permission role |
| DELETE | `/:id/permissions/:permissionId` | `role:update` | Cabut satu permission dari role |
| PATCH | `/:id/activate` | `role:update` | Aktifkan / nonaktifkan |
| DELETE | `/:id` | `role:delete` | Hapus permanen |

`GET /roles/:id` mengembalikan seluruh permission aplikasi dengan penanda
`granted`, dikelompokkan per `module` — bentuk yang langsung cocok untuk layar
daftar centang di CMS, tanpa perlu memanggil dua endpoint lalu mencocokkan
sendiri.

`PUT /:id/permissions` memakai PUT, bukan PATCH: body memuat **seluruh**
permission role, bukan tambahan. Satu simpan = satu kiriman, sehingga dua
operator yang menyimpan bersamaan tidak saling menimpa separuh perubahan.
Respons melaporkan `granted`, `revoked`, dan `total`.

`DELETE /:id/permissions/:permissionId` adalah pelengkapnya: mencabut **satu**
izin tanpa perlu mengirim daftar lengkap. Berguna saat operator mengklik cabut
di satu baris layar detail, atau saat pemanggil non-UI (job, skrip) hanya tahu
permission mana yang harus dilepas. Mengirim `permissionId` yang tidak sedang
dipegang role dijawab `404` — bukan `200` yang membuat pemanggil menyangka ada
yang berubah padahal tidak.

Setiap perubahan yang menggeser izin — set permission, aktif/nonaktif, hapus —
membuang cache permission se-aplikasi. Tanpa itu izin yang baru dicabut masih
meloloskan request sampai TTL 5 menit habis; `npm run db:smoke:roles-cache`
membuktikan 403 muncul seketika.

Pengaman:
- `applicationId` tidak dapat diubah — permission yang terpasang milik aplikasi
  lama, dan memindahkan role membuat izinnya lintas aplikasi. Buat role baru di
  aplikasi tujuan.
- Permission dari aplikasi lain ditolak `400`. Guard hanya mencocokkan string
  `code`, jadi tanpa pemeriksaan ini isolasi RBAC bocor dari dalam.
- Role sistem (`isSystemRole`, dibuat seeder) tidak dapat diganti nama,
  dinonaktifkan, atau dihapus — seeder mencarinya lewat nama, jadi perubahan
  membuat seed berikutnya membuat baris baru dan penugasan lama hilang tanpa
  jejak. Deskripsi dan permission-nya tetap boleh diubah.
- Penghapusan ditolak `409` selama role masih dipegang pengguna.

### Permissions (`/api/permissions`)

Manajemen permission per aplikasi. Sama seperti role, cakupannya lintas
aplikasi — `applicationId` eksplisit di body create dan sebagai filter di list.

| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/` | `permission:list` | Daftar permission + `roleCount` + `menuCount`; filter `applicationId`, `module`, `search` |
| GET | `/modules` | `permission:list` | Modul distingtif + jumlahnya — isi dropdown filter di CMS |
| GET | `/:applicationId/me` | ✅ auth saja | Permission efektif milik pemanggil pada aplikasi itu |
| GET | `/:id` | `permission:read` | Detail + role yang memegang & menu yang memakainya |
| POST | `/` | `permission:create` | Daftarkan permission baru |
| PATCH | `/:id` | `permission:update` | Ubah `name` atau `module` saja |
| DELETE | `/:id` | `permission:delete` | Hapus permanen, laporkan dampaknya |

**`code` tidak dapat diubah, di mana pun.** Ia literal di dalam kode program —
`requirePermission("user:list")` di setiap route — di-cache Redis sebagai string,
dan dipakai `menus.json`. Mengubahnya lewat API akan membuat guard menolak semua
orang tanpa satu pun baris kode berubah. `applicationId` juga terkunci.
`PATCH` hanya menerima `name` (label) dan `module` (pengelompokan tampilan); zod
men-strip field lain, jadi `{"code": "..."}` diabaikan tanpa efek.

Karena `code` tetap, `PATCH` **tidak** membuang cache: yang di-cache dan
diperiksa guard hanyalah kode permission, jadi menyunting label tidak memaksa
seluruh pengguna aplikasi resolve ulang.

`GET /:id` mengembalikan `roles` dan `menus` yang memakai permission itu — layar
konfirmasi hapus di CMS bisa menampilkan akibatnya sebelum operator menekan
tombol, tanpa perlu query tambahan.

Hapus permission melakukan dua hal lewat cascade: mencabut izin dari semua role
(`role_permissions`) dan men-NULL-kan `menu_items.permission_id` — menu yang
tadinya terbatas menjadi terbuka bagi siapa pun yang bisa mengakses aplikasinya.
Tidak ada penghalang `409` di sini seperti pada role: mencabut izin tidak
menghilangkan data pengguna, dan menahan operator justru membuat izin usang
menumpuk. Sebagai gantinya respons melaporkan dampaknya secara eksplisit:

```json
{ "revokedFromRoles": 5, "unguardedMenus": 1 }
```

Hapus permission **wajib** membuang cache se-aplikasi: `resolveUserPermissions`
meng-cache daftar kode, bukan id, jadi kode yang barisnya sudah dihapus tetap
tersimpan sampai TTL 5 menit habis. `npm run db:smoke:permissions` membuktikan
403 muncul seketika setelah penghapusan.

> **Catatan uji:** `db:smoke:permissions` menghapus permission sungguhan di
> `lapak-jambi-web` dan `seloko`. Skrip itu memulihkan dirinya sendiri dengan
> menjalankan `db:seed` di akhir — tanpa itu, smoke test lain yang berjalan
> sesudahnya gagal karena fixture-nya bolong.

#### `GET /permissions/:applicationId/me`

Permission efektif milik pemanggil pada satu aplikasi. **Tanpa `requirePermission`**
— cukup `authenticate`. Alasannya: pengguna aplikasi lain (`editor.profil` di
`bapenda-profile`, `verifikator.lapak` di `lapak-jambi-web`) tidak akan pernah
punya `permission:read` pada `appCode` mereka sendiri, sehingga menuntut izin di
sini justru mengunci orang yang paling butuh memeriksa haknya. Berbeda dari
`GET /permissions/:id` yang memang untuk operator konsol.

`applicationId` bisa aplikasi mana pun, tidak harus sama dengan `X-App-Code`:
CMS di aplikasi A boleh menanyakan izin pengguna di aplikasi B — dan jawabannya
memang bisa kosong, karena `resolveUserPermissions` menyaring lewat penugasan
role yang berlaku di aplikasi itu.

Daftar `permissions` diambil dari **`resolveUserPermissions` yang sama** dengan
yang dipakai `requirePermission`, bukan dirakit ulang. Ini bagian terpenting:
bila dirakit sendiri, endpoint ini akan perlahan melenceng dari jawaban guard,
dan CMS yang menyembunyikan menu berdasarkan hasilnya akan menyembunyikan tombol
yang justru dijawab `200`. Smoke test-nya membandingkan hasil endpoint ini dengan
`permissions` dari `/auth/me` (sumber yang sama) untuk empat pengguna berbeda
dan menuntut keduanya identik.

Super admin: `requirePermission` melewati seluruh pemeriksaan, jadi di sini
bypass itu diterjemahkan menjadi **seluruh permission aplikasi**. `roles` tetap
dilaporkan apa adanya dan bisa kosong meski `permissions` penuh — super admin
punya akses tanpa perlu penugasan role di aplikasi tersebut. `isSuperAdmin`
dikirim agar front-end tidak menyimpulkan "tidak punya role berarti tidak punya
akses".

Respons mengikuti bentuk "daftar centang": `permissions` (kode datar, yang dicek
guard) plus `permissionsByModule` (kode + label, siap dirender). `roles`
melaporkan penugasan yang berlaku beserta `expiresAt` — role nonaktif dan
penugasan kedaluwarsa tidak ikut, cermin dari penyaring resolver.

```json
{
  "application": { "id": "…", "code": "lapak-jambi-web", "name": "…", "icon": "store" },
  "isSuperAdmin": false,
  "roles": [{ "id": "…", "name": "verifikator", "expiresAt": null }],
  "permissions": ["product:list", "product:read", "product:approve", "…"],
  "permissionsByModule": [
    { "module": "Produk", "permissions": [{ "code": "product:list", "name": "Melihat Daftar Produk" }] }
  ],
  "total": 12
}
```

> **Utang seed yang ketahuan dari sini:** katalog `seloko` hanya memuat
> `permission:read` dan `permission:list`, sehingga `POST`/`PATCH`/`DELETE
> /permissions` (yang menuntut `permission:create`/`update`/`delete`) tidak
> dapat diberikan ke role mana pun — praktis hanya super admin yang bisa
> memakainya. Perluas entitas `permission` di `applications.json` (mis.
> `"actions": ["content"]`) agar operator konsol bisa mengelola katalog izin.

### Health Check

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness — process is up. No dependency checks, no `X-App-Code`. |
| GET | `/health/ready` | Readiness — pings PostgreSQL, Redis, RabbitMQ. |

`/health/ready` returns `503` only when PostgreSQL is unreachable. Redis and
RabbitMQ being down are reported in `dependencies` but do not fail the probe:
permission lookups fall back to the database and audit events are dropped by
design, so the API still serves traffic.

```json
{
  "status": "ok",
  "timestamp": "2026-09-28T17:33:45.779Z",
  "uptime": 7.76,
  "environment": "development",
  "dependencies": { "database": true, "redis": false, "rabbitmq": false }
}
```

Startup follows the same rule: a RabbitMQ outage is logged and the API boots
anyway, reconnecting in the background.

---

## Database Schema

Key tables:
- `applications` — Registered apps (seloko, bapenda-profile, lapak-jambi-web, lapak-jambi-app)
- `permissions` — Atomic permission per app (`code` + Indonesian `name` + `module` grouping)
- `roles` — Named permission bundles scoped to an app (`is_system_role` protects built-ins)
- `role_permissions` — Role ↔ Permission junction
- `users` — Single identity across the ecosystem (`nip` for ASN, soft delete)
- `user_app_roles` — User ↔ Role ↔ Application junction (multi-role, supports expiry)
- `refresh_tokens` — Hashed refresh token store
- `audit_logs` — Immutable audit trail (written by worker, never synchronously)

---

## Environment Variables Reference

See `.env.example` for all required variables with descriptions.

---

## RabbitMQ Management

UI available at `http://localhost:15672` (user: `seloko_user`, pass: `seloko_pass`)

Exchange: `seloko.exchange` (topic)

| Routing Key Pattern | Queue | Consumer |
|---|---|---|
| `audit.*.*` | `seloko.audit_log` | `audit.consumer.ts` |
| `notification.email.*` | `seloko.notification.email` | *(planned)* |
| `image.process.*` | `seloko.image.process` | *(planned)* |

---

## Development Conventions

- **No `any` types** — use Zod inference or explicit generics
- **4-layer module pattern**: `schema → controller → service → routes`
- **Error handling**: throw typed `AppError` subclasses; global handler formats them
- **Async tasks**: always `void` fire-and-forget or return a `Promise` — never unhandled
- **Immutability**: `env` object is `Object.freeze()`d
