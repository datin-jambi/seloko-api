/**
 * redis.check.ts — membuktikan helper cache terdegradasi, bukan melempar,
 * saat Redis mati.
 *
 * Caranya: arahkan REDIS_HOST/PORT ke port mati SEBELUM env.ts di-import,
 * sehingga setiap perintah pasti gagal. Tanpa framework. Jalankan:
 *   npx tsx src/config/redis.check.ts
 */
import assert from "node:assert/strict";

// Harus di-set sebelum import env.js — env dibaca sekali saat modul dimuat.
process.env["REDIS_HOST"] = "127.0.0.1";
process.env["REDIS_PORT"] = "1"; // Port mati: ECONNREFUSED
process.env["DATABASE_URL"] ??= "postgresql://u:***@localhost:5432/db";
process.env["RABBITMQ_URL"] ??= "amqp://u:***@localhost:5672";
process.env["JWT_SECRET"] ??= "x".repeat(32);
process.env["COOKIE_SECRET"] ??= "y".repeat(32);

const {
  getCachedPermissions,
  setCachedPermissions,
  invalidatePermissionCache,
  invalidateAllUserPermissionCaches,
  isAccessTokenBlocked,
  blockAccessToken,
  closeRedisClient,
} = await import("./redis.js");

// ─── Jalur baca & tulis cache: fail-open ──────────────────────────────────────
// Baca gagal dilaporkan sebagai cache miss (null) agar pemanggil jatuh ke DB.
assert.equal(await getCachedPermissions("user-1", "SELOKO"), null);

// Tulis gagal ditelan — permission sudah dihitung dari DB, cache cuma bonus.
await setCachedPermissions("user-1", "SELOKO", ["users:read"]);

// ─── Invalidasi: lapor false, jangan melempar ─────────────────────────────────
// Aksi di DB sudah permanen; entry cache yang tertinggal kedaluwarsa via TTL.
assert.equal(await invalidatePermissionCache("user-1", "SELOKO"), false);
assert.equal(await invalidateAllUserPermissionCaches("user-1"), false);

// ─── Blocklist token ──────────────────────────────────────────────────────────
// Pengecekan fail-open: autentikasi tidak mati total saat Redis down.
assert.equal(await isAccessTokenBlocked("hash-abc"), false);

// Penulisan SENGAJA melempar: tidak ada cadangan, gagal tulis = token tetap
// sah sampai expire. Logout harus error, bukan balas 200 bohong.
await assert.rejects(() => blockAccessToken("hash-abc", 60));

await closeRedisClient();
console.info("redis.check: OK");
