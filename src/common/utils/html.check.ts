/**
 * html.check.ts — Uji sanitasi HTML.
 * Jalankan: tsx src/common/utils/html.check.ts
 */
import assert from "node:assert/strict";
import { sanitizeContent } from "./html.js";

// Tag format tetap, skrip & handler event & skema berbahaya dibuang
const clean = sanitizeContent(
  '<h2>Judul</h2><p onclick="x()">Isi <strong>tebal</strong></p>' +
  '<script>alert(1)</script><img src="https://ik.imagekit.io/a.jpg" onerror="x()">' +
  '<a href="javascript:alert(1)">klik</a>',
);
assert.ok(clean.includes("<h2>Judul</h2>"));
assert.ok(clean.includes("<strong>tebal</strong>"));
assert.ok(clean.includes('<img src="https://ik.imagekit.io/a.jpg" />'));
for (const bad of ["<script", "onclick", "onerror", "javascript:"]) assert.ok(!clean.includes(bad), clean);

// Tabel dari editor (halaman Pejabat): colspan/rowspan & warna teks tetap
const table = sanitizeContent(
  '<table style="min-width: 50px;"><tbody><tr><th colspan="1" rowspan="1">' +
  '<span style="color: rgb(255, 255, 255);">Jabatan</span></th></tr></tbody></table>',
);
assert.ok(table.includes('<table style="min-width:50px">'), table);
assert.ok(table.includes('colspan="1" rowspan="1"'), table);
assert.ok(table.includes('style="color:rgb(255, 255, 255)"'), table);

// CSS berbahaya dibuang
const css = sanitizeContent(
  '<p style="background-image:url(javascript:x);color:red;position:fixed">a</p>',
);
assert.equal(css, '<p style="color:red">a</p>');

console.log("✓ html.check: sanitasi HTML lolos");
