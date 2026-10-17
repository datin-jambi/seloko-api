/**
 * docs.check.ts — Pastikan dokumentasi API tidak melenceng dari kode.
 *
 * Yang diperiksa (murah, tanpa DB):
 *   1. Jumlah endpoint tiap berkas modul di `docs/api/<app>/<modul>.md`
 *      sama dengan jumlah `app.<method>("/…")` di `<modul>.routes.ts`.
 *   2. Setiap method+path yang ada di kode muncul di tabel ringkasan dokumen.
 *   3. Total endpoint di `docs/api/README.md` sama dengan jumlah nyata.
 *
 * Jalankan: tsx docs/api/check.ts   (ikut `npm test`)
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "../..");
const DOCS = join(ROOT, "docs/api");

/** Aplikasi → modul → berkas rute. Modul = nama berkas di docs. */
const APP_MODULES: Record<string, Record<string, string>> = {
  core: {
    auth: "src/modules/core/auth/auth.routes.ts",
    users: "src/modules/core/users/users.routes.ts",
    applications: "src/modules/core/applications/applications.routes.ts",
    permissions: "src/modules/core/permissions/permissions.routes.ts",
    roles: "src/modules/core/roles/roles.routes.ts",
    menus: "src/modules/core/menus/menus.routes.ts",
    organizations: "src/modules/core/organizations/organizations.routes.ts",
    storage: "src/modules/core/storage/storage.routes.ts",
  },
  bapenda: {
    uptds: "src/modules/bapenda/uptds/uptds.routes.ts",
    banners: "src/modules/bapenda/banners/banners.routes.ts",
    news: "src/modules/bapenda/news/news.routes.ts",
    pages: "src/modules/bapenda/pages/pages.routes.ts",
  },
};

const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/** Ambil pasangan METHOD + path dari kode rute. */
function routesOf(file: string): string[] {
  const src = read(file);
  return [...src.matchAll(/app\.(get|post|put|patch|delete)\(\s*"([^"]*)"/g)].map(
    (m) => `${m[1]!.toUpperCase()} ${m[2]!}`,
  );
}

let checked = 0;
let totalDocs = 0;
let totalCode = 0;

for (const [app, modules] of Object.entries(APP_MODULES)) {
  for (const [mod, file] of Object.entries(modules)) {
    const doc = read(join("docs/api", app, `${mod}.md`));
    const routes = routesOf(file);

    // 1. Klaim jumlah endpoint di header dokumen.
    const claimed = /Jumlah endpoint:\*\*\s*(\d+)/.exec(doc)?.[1];
    assert.ok(claimed, `${app}/${mod}.md: header "Jumlah endpoint" tidak ditemukan`);
    assert.equal(
      Number(claimed),
      routes.length,
      `${app}/${mod}.md: klaim ${claimed} endpoint, kode punya ${routes.length}`,
    );

    // 2. Tiap rute di kode harus muncul di tabel ringkasan (path tanpa prefix).
    for (const route of routes) {
      const path = route.split(" ")[1]!;
      const bare = path === "/" ? "/" : path;
      assert.ok(
        doc.includes(`\`${bare}\``),
        `${app}/${mod}.md: rute "${route}" ada di kode tapi tidak di dokumen`,
      );
    }

    checked++;
    totalDocs += Number(claimed);
    totalCode += routes.length;
  }
}

// 3. Tidak ada berkas modul yatim di folder docs.
for (const app of Object.keys(APP_MODULES)) {
  const documented = read(join("docs/api", app, "README.md"));
  for (const f of readdirSync(join(DOCS, app)).filter((n) => n.endsWith(".md") && n !== "README.md")) {
    assert.ok(documented.includes(f), `docs/api/${app}/README.md belum menautkan ${f}`);
  }
}

// 4. Total di indeks utama.
const index = read("docs/api/README.md");
assert.equal(totalDocs, totalCode, `total dokumen ${totalDocs} ≠ total kode ${totalCode}`);
assert.ok(
  index.includes(`Total keseluruhan: ${totalCode} endpoint`),
  `docs/api/README.md harus menyebut "Total keseluruhan: ${totalCode} endpoint"`,
);

console.log(`✓ docs.check: ${checked} modul, ${totalCode} endpoint terdokumentasi & cocok dengan kode`);
