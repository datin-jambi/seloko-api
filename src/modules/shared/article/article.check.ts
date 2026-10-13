/**
 * article.check.ts — Uji murni alur status (tanpa DB).
 * Jalankan: tsx src/modules/shared/article/article.check.ts
 */
import assert from "node:assert/strict";
import { AUTHOR_EDITABLE, nextStatus } from "./article.service.js";

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

console.log("✓ article.check: alur status lolos");
