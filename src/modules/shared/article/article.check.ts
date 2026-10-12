/**
 * article.check.ts — Uji murni alur status & sanitasi HTML (tanpa DB).
 * Jalankan: tsx src/modules/shared/article/article.check.ts
 */
import assert from "node:assert/strict";
import { AUTHOR_EDITABLE, nextStatus, sanitizeContent } from "./article.service.js";

// Alur sah
assert.equal(nextStatus("DRAFT", "submit"), "PENDING_REVIEW");
assert.equal(nextStatus("REJECTED", "submit"), "PENDING_REVIEW");
assert.equal(nextStatus("PENDING_REVIEW", "approve"), "APPROVED");
assert.equal(nextStatus("PENDING_REVIEW", "reject"), "REJECTED");
assert.equal(nextStatus("APPROVED", "publish"), "PUBLISHED");
assert.equal(nextStatus("DRAFT", "publish"), "PUBLISHED");
assert.equal(nextStatus("PUBLISHED", "unpublish"), "DRAFT");

// Alur tidak sah
assert.equal(nextStatus("DRAFT", "approve"), null);
assert.equal(nextStatus("PENDING_REVIEW", "publish"), null);
assert.equal(nextStatus("REJECTED", "publish"), null);
assert.equal(nextStatus("PUBLISHED", "submit"), null);
assert.equal(nextStatus("APPROVED", "unpublish"), null);

// Penulis hanya boleh mengedit draft/ditolak
assert.deepEqual([...AUTHOR_EDITABLE], ["DRAFT", "REJECTED"]);

// Sanitasi: tag format tetap, skrip & handler event dibuang
const dirty =
  '<h2>Judul</h2><p onclick="x()">Isi <strong>tebal</strong></p>' +
  '<script>alert(1)</script><img src="https://ik.imagekit.io/a.jpg" onerror="x()">' +
  '<a href="javascript:alert(1)">klik</a>';
const clean = sanitizeContent(dirty);
assert.ok(clean.includes("<h2>Judul</h2>"));
assert.ok(clean.includes("<strong>tebal</strong>"));
assert.ok(clean.includes('<img src="https://ik.imagekit.io/a.jpg" />'));
assert.ok(!clean.includes("<script"), clean);
assert.ok(!clean.includes("onclick"), clean);
assert.ok(!clean.includes("onerror"), clean);
assert.ok(!clean.includes("javascript:"), clean);

console.log("✓ article.check: alur status & sanitasi HTML lolos");
