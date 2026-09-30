/**
 * utils.check.ts — self-check untuk helper format & parse.
 *
 * Tanpa framework: assert biasa. Jalankan:
 *   npx tsx src/common/utils/utils.check.ts
 */
import assert from "node:assert/strict";
import {
  formatDate,
  formatDateTime,
  formatDateOnly,
  formatRelativeTime,
  jakartaDayRange,
  toISO,
  formatRupiah,
  parseRupiah,
  formatNumber,
  formatPercent,
  formatBytes,
  normalizeText,
  toTitleCase,
  slugify,
  truncate,
  maskEmail,
  normalizePhone,
  formatPhone,
  parseBoolean,
} from "./index.js";

// ─── Tanggal ──────────────────────────────────────────────────────────────────
// 2026-09-28T20:00:00Z = 29 September 03.00 WIB — membuktikan formatter memakai
// Asia/Jakarta, bukan zona server.
const malam = "2026-09-28T20:00:00.000Z";
assert.equal(formatDateOnly(malam), "2026-09-29");
assert.equal(formatDate(malam), "29 September 2026");
assert.match(formatDateTime(malam) ?? "", /^29 September 2026,? 03[.:]00$/);
assert.equal(toISO(malam), "2026-09-28T20:00:00.000Z");

assert.equal(formatDate(null), null);
assert.equal(formatDate("bukan tanggal"), null);
assert.equal(formatDate(""), null);

const range = jakartaDayRange(malam);
assert.equal(range?.start.toISOString(), "2026-09-28T17:00:00.000Z");
assert.equal(range?.end.toISOString(), "2026-09-29T16:59:59.999Z");

const now = new Date("2026-09-28T12:00:00.000Z");
// Wording RelativeTimeFormat ikut versi ICU ("3 hari lalu" / "3 hari yang
// lalu") — cocokkan bagian yang stabil saja.
assert.match(formatRelativeTime("2026-09-25T12:00:00.000Z", now) ?? "", /^3 hari .*lalu$/);
assert.equal(formatRelativeTime("2026-09-28T11:59:59.500Z", now), "sekarang");
assert.match(formatRelativeTime("2026-09-28T14:00:00.000Z", now) ?? "", /2 jam/);

// ─── Uang ─────────────────────────────────────────────────────────────────────
// Intl memakai NBSP/narrow-NBSP setelah "Rp" tergantung versi ICU — bandingkan
// setelah spasi apa pun dibuang, bukan string mentah.
const noSpace = (s: string | null) => s?.replace(/\s|\u00a0|\u202f/g, "") ?? null;
assert.equal(noSpace(formatRupiah(1250000)), "Rp1.250.000");
assert.equal(noSpace(formatRupiah("1250000")), "Rp1.250.000");
assert.equal(noSpace(formatRupiah(1250000.7)), "Rp1.250.001", "dibulatkan, tanpa sen");
assert.equal(formatRupiah(null), null);
assert.equal(formatRupiah("abc"), null);

// Titik = ribuan, koma = desimal. Number() salah pada dua kasus pertama.
assert.equal(parseRupiah("Rp 1.250.000"), 1250000);
assert.equal(parseRupiah("1.250"), 1250);
assert.equal(parseRupiah("1.250.000,50"), 1250000.5);
assert.equal(parseRupiah("1250000"), 1250000);
assert.equal(parseRupiah("-2.500"), -2500);
assert.equal(parseRupiah("dua juta"), null);
assert.equal(parseRupiah(""), null);

assert.equal(formatNumber(1250000), "1.250.000");
assert.equal(formatNumber(1.5, 2), "1,50");
assert.equal(formatPercent(0.1234), "12,34%");
assert.equal(formatPercent(12.34, false), "12,34%");
assert.equal(formatBytes(0), "0 B");
assert.equal(formatBytes(900), "900 B");
assert.equal(formatBytes(1536), "1,5 KB");
assert.equal(formatBytes(5 * 1024 ** 3), "5,0 GB");

// ─── Teks ─────────────────────────────────────────────────────────────────────
assert.equal(normalizeText("  budi   santoso  "), "budi santoso");
assert.equal(normalizeText("   "), null);
assert.equal(toTitleCase("  budi   SANTOSO "), "Budi Santoso");
assert.equal(toTitleCase("siti nur-aini"), "Siti Nur-Aini");
assert.equal(slugify("Profil Bapenda Jambi!"), "profil-bapenda-jambi");
assert.equal(slugify("Café  Lapak"), "cafe-lapak");
assert.equal(slugify("!!!"), null);
assert.equal(truncate("satu dua tiga empat lima", 12), "satu dua…");
assert.equal(truncate("pendek", 12), "pendek");
assert.equal(maskEmail("Budi@jambiprov.go.id"), "bu**@jambiprov.go.id");

// ─── Telepon ──────────────────────────────────────────────────────────────────
for (const input of ["0812-3456-789", "+62 812 3456 789", "628123456789", "812 3456789"]) {
  assert.equal(normalizePhone(input), "+628123456789", `gagal pada "${input}"`);
}
assert.equal(normalizePhone("123"), null, "terlalu pendek");
assert.equal(normalizePhone("kosong"), null);
assert.equal(formatPhone("081234567890"), "+62 812-3456-7890");

// ─── Boolean ──────────────────────────────────────────────────────────────────
assert.equal(parseBoolean("true"), true);
assert.equal(parseBoolean("ya"), true);
assert.equal(parseBoolean("0"), false);
assert.equal(parseBoolean("tidak"), false);
assert.equal(parseBoolean("mungkin"), undefined, "tidak dikenali ≠ false");
assert.equal(parseBoolean(undefined), undefined);

console.log("utils.check: OK");
