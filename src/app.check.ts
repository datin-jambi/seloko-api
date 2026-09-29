/**
 * app.check.ts — self-check route & penjagaan lapisan HTTP.
 *
 * Membangun aplikasi Fastify sungguhan lalu menembaknya dengan app.inject().
 * Tidak butuh PostgreSQL: seluruh assertion berhenti di lapisan header/JWT,
 * atau menerima 503 sebagai hasil sah saat database tidak tersedia.
 *
 * Jalankan: npx tsx src/app.check.ts
 */
import assert from "node:assert/strict";

process.env["DATABASE_URL"] ??= "postgresql://u:p@localhost:5432/db";
process.env["REDIS_HOST"] ??= "localhost";
process.env["RABBITMQ_URL"] ??= "amqp://u:p@localhost:5672";
process.env["JWT_SECRET"] ??= "x".repeat(32);
process.env["COOKIE_SECRET"] ??= "y".repeat(32);
process.env["NODE_ENV"] = "test";

const { buildApp } = await import("./app.js");
const app = await buildApp();
await app.ready();

const APP_CODE = "lapak-jambi-web";

// ── Semua route auth terdaftar (bukan 404) ─────────────────────────────────
const endpoints: Array<{ method: "GET" | "POST"; url: string }> = [
  { method: "POST", url: "/api/auth/login" },
  { method: "POST", url: "/api/auth/refresh" },
  { method: "POST", url: "/api/auth/logout" },
  { method: "POST", url: "/api/auth/logout-all" },
  { method: "GET", url: "/api/auth/me" },
];

for (const ep of endpoints) {
  const res = await app.inject({
    method: ep.method,
    url: ep.url,
    headers: { "x-app-code": APP_CODE },
  });
  assert.notEqual(res.statusCode, 404, `${ep.method} ${ep.url} harus terdaftar`);
}

// ── Health check bebas dari X-App-Code ─────────────────────────────────────
const health = await app.inject({ method: "GET", url: "/health" });
assert.equal(health.statusCode, 200, "/health harus terbuka tanpa header");
assert.equal(health.json<{ status: string }>().status, "ok");

// Query string tidak boleh mengunci endpoint publik: request.url memuat "?…",
// jadi pencocokan harus memakai path saja.
const healthQuery = await app.inject({ method: "GET", url: "/health?probe=1" });
assert.equal(healthQuery.statusCode, 200, "/health dengan query string harus tetap 200");

// Readiness juga bebas header. Tanpa PostgreSQL hasilnya 503 — yang penting
// bukan 400: artinya request lolos middleware, bukan tertahan validasi header.
const ready = await app.inject({ method: "GET", url: "/health/ready" });
assert.ok(
  ready.statusCode === 200 || ready.statusCode === 503,
  `/health/ready harus 200 atau 503, dapat ${ready.statusCode}`,
);
const deps = ready.json<{ dependencies: Record<string, boolean> }>().dependencies;
for (const key of ["database", "redis", "rabbitmq"]) {
  assert.equal(typeof deps[key], "boolean", `dependencies.${key} harus boolean`);
}

// ── X-App-Code wajib pada route ber-prefix /api ────────────────────────────
const noHeader = await app.inject({ method: "GET", url: "/api/auth/me" });
assert.equal(noHeader.statusCode, 400, "tanpa X-App-Code harus 400");

// ── App code bertanda hubung harus lolos validasi header ───────────────────
// 401 (bukan 400) membuktikan header diterima lalu tertahan di lapisan JWT.
const dashed = await app.inject({
  method: "GET",
  url: "/api/auth/me",
  headers: { "x-app-code": APP_CODE },
});
assert.equal(dashed.statusCode, 401, "app code bertanda hubung harus lolos validasi header");

// ── App code dengan karakter terlarang tetap ditolak ───────────────────────
const bad = await app.inject({
  method: "GET",
  url: "/api/auth/me",
  headers: { "x-app-code": "Lapak Jambi!" },
});
assert.equal(bad.statusCode, 400, "app code tidak valid harus 400");

// ── Route terjaga menolak request tanpa token ──────────────────────────────
for (const url of ["/api/auth/logout", "/api/auth/logout-all", "/api/auth/me"]) {
  const res = await app.inject({
    method: url === "/api/auth/me" ? "GET" : "POST",
    url,
    headers: { "x-app-code": APP_CODE },
  });
  assert.equal(res.statusCode, 401, `${url} harus menolak request tanpa token`);
}

// ── Rate limit terpasang ───────────────────────────────────────────────────
assert.ok(app.hasPlugin("@fastify/rate-limit"), "plugin rate limit harus terdaftar");

console.log("app.check: OK");

// Redis/RabbitMQ terus mencoba menyambung ulang di latar belakang dan menahan
// event loop; keluar tegas setelah seluruh assertion lolos.
process.exit(0);
