/**
 * access.check.ts — self-check aturan akses lintas aplikasi.
 * Jalankan: npx tsx src/common/guards/access.check.ts
 */
import assert from "node:assert/strict";
import { canAccountUseApp, resolveTargetApp } from "./access.js";

// Login: jenis akun harus sama dengan audience aplikasi.
assert.equal(canAccountUseApp("INTERNAL", "INTERNAL"), true);
assert.equal(canAccountUseApp("PUBLIC", "PUBLIC"), true);
assert.equal(canAccountUseApp("INTERNAL", "PUBLIC"), false, "pegawai tidak login ke app publik");
assert.equal(canAccountUseApp("PUBLIC", "INTERNAL"), false, "warga tidak pernah masuk seloko");

// Pemilik = pintu masuk → izin dibaca di sana, untuk kedua jenis akun.
assert.equal(resolveTargetApp("INTERNAL", "seloko", "seloko"), "seloko");
assert.equal(resolveTargetApp("PUBLIC", "lapak-jambi-web", "lapak-jambi-web"), "lapak-jambi-web");

// Pegawai dari seloko mengelola modul milik aplikasi lain.
assert.equal(resolveTargetApp("INTERNAL", "seloko", "bapenda-profile"), "bapenda-profile");

// Warga tidak boleh menyeberang — termasuk ke modul inti seloko, meski ia
// memegang permission bernama sama di aplikasinya sendiri.
assert.equal(resolveTargetApp("PUBLIC", "lapak-jambi-web", "seloko"), null);
assert.equal(resolveTargetApp("PUBLIC", "lapak-jambi-web", "bapenda-profile"), null);

console.log("access.check: OK");
