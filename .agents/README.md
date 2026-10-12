# 🤖 Panduan Direktori `.agents/` — SELOKO API

Direktori `.agents/` adalah pusat konfigurasi **Antigravity Customization System** untuk proyek **SELOKO API (BPKPD Provinsi Jambi)**. 

Direktori ini dirancang untuk mengubah AI Agent (maupun developer baru) menjadi *expert pair programmer* yang memahami arsitektur, standar keamanan, konvensi basis data, dan alur operasional proyek secara konsisten dan terstandarisasi.

---

## 📁 Struktur Direktori & Penjelasan Berkas

```text
.agents/
├── README.md                       # Dokumentasi arsitektur direktori .agents/ & panduan upscaling
│
├── rules/                          # Guidelines & pembatas teknis (selalu aktif / terikat konteks)
│   ├── seloko-api-general.md       # Arsitektur modular monolith, multi-tenancy X-App-Code, ImageKit lifecycle
│   ├── coding-standards.md         # Format Zod DTO, exactOptionalPropertyTypes, respon standar, error handling
│   ├── security-guidelines.md      # Proteksi data PII (NIP/NIK), RBAC, Redis cache TTL, siklus token JWT
│   └── database-conventions.md     # UUID v7, compound unique index per tenant, soft-delete, timestamps
│
└── skills/                         # Prosedur operasional (On-Demand / Progressive Disclosure)
    ├── seloko-module-workflow/     # SOP implementasi modul 4-layer (schema -> service -> controller -> routes)
    ├── seloko-feature-planner/     # Blueprint PRD & perancangan fitur baru sebelum coding
    ├── seloko-debug-fix/           # Runbook troubleshooting & penanganan error cepat (P2002, P2025, typing, Redis)
    └── seloko-db-ops/              # Prosedur migrasi database aman, seeder idempoten, & smoke testing
```

---

## 🔍 Detail Setiap Modul

### A. Folder `rules/` (Aturan & Konvensi Wajib)
Rules dimuat secara kontekstual untuk memastikan setiap baris kode yang ditulis mematuhi standar repositori:

1. **[`rules/seloko-api-general.md`](./rules/seloko-api-general.md)**:
   - Fondasi 4-layer modular monolith (`schema` $\rightarrow$ `service` $\rightarrow$ `controller` $\rightarrow$ `routes`).
   - Wajib header `X-App-Code` untuk multi-tenancy.
   - Standar media ImageKit: dua tahap (*two-step upload*), dukungan dual-device (desktop & mobile), validasi bersyarat `isActive: true`, dan auto-cleanup asinkron.
2. **[`rules/coding-standards.md`](./rules/coding-standards.md)**:
   - Kepatuhan `exactOptionalPropertyTypes: true` pada TypeScript.
   - Format baku respon API: `{ statusCode, code, message, data, meta }`.
   - Standar penanganan error resmi (`BadRequestError`, `NotFoundError`, `ConflictError`, `ForbiddenError`).
   - Praktik logging aman Fastify (larangan `console.log` data sensitif).
3. **[`rules/security-guidelines.md`](./rules/security-guidelines.md)**:
   - Perlindungan data sensitif / PII (NIP ASN, NIK wajib pajak, nomor kontak).
   - Larangan kebocoran `passwordHash` atau token hash pada query select atau response JSON.
   - Keamanan JWT: Access Token pendek (15m), HttpOnly Refresh Token cookie, rotasi token, dan deteksi pencurian token (*token reuse*).
   - Redis blocklist instan saat logout dan pembatasan laju (*rate limiting*).
4. **[`rules/database-conventions.md`](./rules/database-conventions.md)**:
   - Primary Key wajib UUID v7 (`@default(uuid(7))`).
   - Keunikan lokal per tenant (`@@unique([applicationId, slug])`).
   - Standar soft-delete (`deletedAt: null`) dan timestamps `timestamptz`.

---

### B. Folder `skills/` (Prosedur Kerja On-Demand)
Skills bekerja dengan prinsip **Progressive Disclosure**: agen hanya memuat deskripsi ringkasnya ke memori, dan baru membaca dokumen lengkap saat tugas yang relevan dijalankan:

1. **[`skills/seloko-module-workflow/SKILL.md`](./skills/seloko-module-workflow/SKILL.md)**:
   - Panduan langkah demi langkah saat membangun modul baru dari Tahap 1 (Skema Prisma) hingga Tahap 5 (Smoke testing).
2. **[`skills/seloko-feature-planner/SKILL.md`](./skills/seloko-feature-planner/SKILL.md)**:
   - Template blueprint PRD (Product Requirement Document) sebelum menulis kode: pemodelan ERD, matriks permission, dan kontrak endpoint publik vs CMS.
3. **[`skills/seloko-debug-fix/SKILL.md`](./skills/seloko-debug-fix/SKILL.md)**:
   - Panduan diagnosis dan perbaikan cepat untuk error Prisma P2002/P2025, Typecheck mismatch, dan sinkronisasi cache Redis.
4. **[`skills/seloko-db-ops/SKILL.md`](./skills/seloko-db-ops/SKILL.md)**:
   - Prosedur migrasi database dev/deploy, pembuatan database seeder yang idempoten (*upsert*), dan eksekusi smoke runner.

---

## 🚀 Tata Cara Upscaling ke Depannya (How to Scale)

Ketika sistem berkembang (misalnya penambahan modul perpajakan daerah, integrasi *Payment Gateway*, antrean RabbitMQ, atau analitik PAD), ikuti tata cara berikut untuk memperluas direktori `.agents/`:

### 1. Menambahkan Aturan Baru (`rules/<nama-aturan>.md`)
Gunakan Rules jika Anda ingin agen **selalu mematuhi batasan tertentu tanpa perlu diminta**:
- **Kapan membuat rule baru?**
  - Ada integrasi pihak ketiga baru (misal: `rules/payment-gateway-conventions.md`).
  - Ada standar pelaporan log audit baru (misal: `rules/audit-logging-standards.md`).
- **Format Penulisan:**
  Sertakan frontmatter di bagian paling atas:
  ```markdown
  ---
  trigger: always_on
  project: seloko-api
  description: Deskripsi singkat fungsi aturan ini
  ---
  ```

### 2. Menambahkan Skill Baru (`skills/<nama-skill>/SKILL.md`)
Gunakan Skills jika Anda ingin mengajarkan **prosedur kerja multi-langkah atau runbook tugas khusus**:
- **Kapan membuat skill baru?**
  - Alur integrasi gateway pembayaran perbankan (misal: `skills/seloko-bank-payment-flow/`).
  - Manajemen worker dan consumer antrean RabbitMQ (misal: `skills/seloko-worker-management/`).
  - Prosedur backup dan pemulihan bencana (misal: `skills/seloko-disaster-recovery/`).
- **Format Direktori Skill:**
  ```text
  skills/<nama-skill-kebab-case>/
  ├── SKILL.md             # Wajib: Instruksi utama dengan frontmatter name & description
  ├── scripts/             # Opsional: Skrip helper otomasi
  └── references/          # Opsional: Dokumentasi teknis tambahan
  ```
- **Format Frontmatter `SKILL.md`:**
  ```markdown
  ---
  name: seloko-bank-payment-flow
  description: >-
    Prosedur verifikasi webhook pembayaran perbankan, validasi signature HMAC, dan rekonsiliasi status tagihan.
  ---
  ```

### 3. Sinkronisasi ke `AGENTS.md` (Indeks Induk)
Setiap kali menambahkan berkas baru di dalam `.agents/rules/` atau `.agents/skills/`:
1. Buka file [`AGENTS.md`](file:///c:/Users/ASUS/Documents/BPKPD/Code/seloko-api/AGENTS.md) di root workspace.
2. Tambahkan tautan markdown link ke berkas baru tersebut pada bagian **"Panduan & Aturan Resmi Proyek"**.
3. Pastikan deskripsi singkatnya tercatat agar agen yang baru diinisiasi langsung mengetahui keberadaan modul tersebut.
