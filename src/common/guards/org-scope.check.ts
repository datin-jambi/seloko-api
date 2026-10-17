/**
 * org-scope.check.ts — Uji murni aturan lingkup OPD (tanpa DB).
 * Jalankan: npx tsx src/common/guards/org-scope.check.ts
 */
import assert from "node:assert/strict";
import { buildOrgScope, isOrgInScope, orgScopeFilter, type ScopedAssignment } from "./org-scope.js";

const a = (grants: boolean, organizationIds: string[] = []): ScopedAssignment => ({ grants, organizationIds });

// Penugasan tanpa baris OPD = seluruh OPD.
assert.deepEqual(buildOrgScope([a(true)]), { all: true });

// Dibatasi ke OPD tertentu.
assert.deepEqual(buildOrgScope([a(true, ["opd-a", "opd-b"])]), {
  all: false,
  organizationIds: ["opd-a", "opd-b"],
});

// Beberapa penugasan digabung (union), duplikat dibuang.
assert.deepEqual(buildOrgScope([a(true, ["opd-a"]), a(true, ["opd-a", "opd-c"])]), {
  all: false,
  organizationIds: ["opd-a", "opd-c"],
});

// Penugasan tanpa izin tidak boleh menambah maupun menyempitkan lingkup.
assert.deepEqual(buildOrgScope([a(true, ["opd-a"]), a(false)]), {
  all: false,
  organizationIds: ["opd-a"],
});
assert.deepEqual(buildOrgScope([a(false), a(false, ["opd-z"])]), { all: false, organizationIds: [] });

// Satu role memberi seluruh OPD → lingkup lain yang terbatas TIDAK menyempitkan.
assert.deepEqual(buildOrgScope([a(true, ["opd-a"]), a(true)]), { all: true });

// Tanpa penugasan sama sekali = lingkup kosong (gagal tertutup).
assert.deepEqual(buildOrgScope([]), { all: false, organizationIds: [] });

// isOrgInScope
assert.equal(isOrgInScope({ all: true }, "opd-x"), true);
assert.equal(isOrgInScope({ all: false, organizationIds: ["opd-a"] }, "opd-a"), true);
assert.equal(isOrgInScope({ all: false, organizationIds: ["opd-a"] }, "opd-b"), false);
assert.equal(isOrgInScope({ all: false, organizationIds: [] }, "opd-a"), false, "lingkup kosong menolak semua");

// Filter Prisma: all → tanpa filter; terbatas/kosong → { in: [...] }.
assert.equal(orgScopeFilter({ all: true }), undefined);
assert.deepEqual(orgScopeFilter({ all: false, organizationIds: ["opd-a"] }), { in: ["opd-a"] });
assert.deepEqual(orgScopeFilter({ all: false, organizationIds: [] }), { in: [] });

console.log("✓ org-scope.check: lingkup OPD lolos");
