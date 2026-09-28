/**
 * auth.check.ts — runnable self-check for the token/duration helpers.
 *
 * No test framework: plain asserts. Run: npx tsx src/modules/core/auth/auth.check.ts
 * Fills in dummy env vars first because config/env.ts exits on invalid config.
 */
import assert from "node:assert/strict";

process.env["DATABASE_URL"] ??= "postgresql://u:p@localhost:5432/db";
process.env["REDIS_HOST"] ??= "localhost";
process.env["RABBITMQ_URL"] ??= "amqp://u:p@localhost:5672";
process.env["JWT_SECRET"] ??= "x".repeat(32);
process.env["COOKIE_SECRET"] ??= "y".repeat(32);

const { parseExpiresIn } = await import("./auth.service.js");

assert.equal(parseExpiresIn("30s"), 30);
assert.equal(parseExpiresIn("15m"), 900);
assert.equal(parseExpiresIn("2h"), 7200);
assert.equal(parseExpiresIn("7d"), 604800);
assert.equal(parseExpiresIn("garbage"), 900, "unparseable value falls back to 15m");

// REDIS_TLS must not treat the string "false" as true (z.coerce.boolean() did).
process.env["REDIS_TLS"] = "false";
const { env } = await import("../../../config/env.js");
assert.equal(env.REDIS_TLS, false, 'REDIS_TLS="false" must parse to false');

console.log("auth.check: OK");
