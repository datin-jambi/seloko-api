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
| Security | `@fastify/cors`, `@fastify/cookie` |

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

```bash
curl -H "X-App-Code: bapenda-profile" http://localhost:3000/api/v1/auth/me
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

### Auth (`/api/v1/auth`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/login` | ❌ | Login with email/username + password |
| POST | `/refresh` | Cookie | Refresh access token |
| POST | `/logout` | ✅ | Revoke refresh token |
| GET | `/me` | ✅ | Get profile + active permissions |

### Health Check

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Server health (no X-App-Code required) |

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
