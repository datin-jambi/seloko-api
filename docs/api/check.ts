/**
 * docs.check.ts — Pastikan dokumentasi API tidak melenceng dari kode.
 *
 * Tiga lapis pemeriksaan (murah, tanpa DB):
 *   1. Jumlah endpoint tiap berkas modul = jumlah `app.<method>("/…")` di rutenya.
 *   2. Setiap method+path di kode muncul di tabel ringkasan dokumen.
 *   3. Setiap field request (params/query/body) yang dideklarasikan Zod muncul
 *      sebagai nama ber-backtick di dokumen — menangkap field baru/hilang.
 *   4. Total endpoint di `docs/api/README.md` = jumlah nyata.
 *
 * Jalankan: npx tsx docs/api/check.ts   (ikut `npm test`)
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "../..");
const DOCS = join(ROOT, "docs/api");

/** Aplikasi → modul → berkas rute. Nama modul = nama berkas di docs. */
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
  lapak: {
    categories: "src/modules/lapak/categories/categories.routes.ts",
    products: "src/modules/lapak/products/products.routes.ts",
    rates: "src/modules/lapak/rates/rates.routes.ts",
    catalog: "src/modules/lapak/catalog/catalog.routes.ts",
    availability: "src/modules/lapak/availability/availability.routes.ts",
    reservations: "src/modules/lapak/reservations/reservations.routes.ts",
    carts: "src/modules/lapak/carts/carts.routes.ts",
    orders: "src/modules/lapak/orders/orders.routes.ts",
    skrd: "src/modules/lapak/skrd/skrd.routes.ts",
    payments: "src/modules/lapak/payments/payments.routes.ts",
    tickets: "src/modules/lapak/tickets/tickets.routes.ts",
    expiry: "src/modules/lapak/expiry/expiry.routes.ts",
  },
};

const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─── 1. Peta field tiap Zod schema request ────────────────────────────────────
/** Semua berkas schema di src/modules — sumber nama field. */
function allSchemaFiles(dir = join(ROOT, "src/modules")): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...allSchemaFiles(p));
    else if (e.name.endsWith(".schema.ts")) out.push(p);
  }
  return out;
}

/**
 * Ambil kunci tingkat atas dari literal `z.object({ ... })` mulai indeks `from`.
 * Kedalaman kurung kurawal dilacak agar objek bersarang tidak ikut terbaca.
 */
function topLevelKeys(src: string, from: number): string[] {
  const keys: string[] = [];
  let depth = 0;
  let i = from;

  for (; i < src.length; i++) {
    const ch = src[i]!;

    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) break;
    }

    if (depth !== 1) continue;

    // Calon kunci harus dimulai setelah `{` atau `,` pada kedalaman 1 —
    // bukan di tengah ekspresi seperti `z.enum(["a","b"])`.
    const prev = src.slice(0, i).trimEnd().slice(-1);
    if (prev !== "{" && prev !== ",") continue;

    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/.exec(src.slice(i, i + 80));
    if (m && !keys.includes(m[1]!)) keys.push(m[1]!);
  }
  return keys;
}

const schemaKeys = new Map<string, string[]>();
const schemaBody = new Map<string, string>();

/**
 * Netralkan komentar TANPA mengubah panjang teks, sehingga offset tetap valid.
 * Tanpa ini, kunci yang didahului komentar JSDoc tidak terdeteksi: pemeriksa
 * melihat karakter terakhir sebelum kunci sebagai `/` (dari `*\/`), bukan `{`
 * atau `,`, lalu melewatinya.
 */
function stripCommentsKeepingOffsets(src: string): string {
  const blank = (s: string) => s.replace(/[^\n]/g, " ");
  return src
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:])\/\/[^\n]*/g, (m0, p1: string) => p1 + blank(m0.slice(p1.length)));
}

for (const file of allSchemaFiles()) {
  const src = stripCommentsKeepingOffsets(readFileSync(file, "utf8"));
  for (const m of src.matchAll(/export const (\w+)\s*=\s*/g)) {
    const name = m[1]!;
    const after = m.index! + m[0].length;
    const rest = src.slice(after);
    schemaBody.set(name, rest);
    const obj = /^z\s*\.\s*object\(\s*\{/.exec(rest);
    if (obj) {
      schemaKeys.set(name, topLevelKeys(rest, rest.indexOf("{", obj[0].length - 1)));
    }
  }
}

/** Schema turunan (`Base.partial()` dll.) mewarisi kunci basis-nya. */
function keysOf(name: string, seen = new Set<string>()): string[] {
  if (schemaKeys.has(name)) return schemaKeys.get(name)!;
  if (seen.has(name)) return [];
  seen.add(name);
  const body = schemaBody.get(name);
  if (!body) return [];
  const base = /^(\w+)\s*\.\s*(partial|omit|extend|refine|required|pick)\(/.exec(body);
  if (!base) return [];
  const inherited = keysOf(base[1]!, seen);
  // `.extend({...})` menambah kunci — ambil juga literalnya.
  if (base[2] === "extend") {
    const add = /\.extend\(\s*\{/.exec(body);
    if (add) return [...new Set([...inherited, ...topLevelKeys(body, body.indexOf("{", add.index! + add[0].length - 1))])];
  }
  return inherited;
}

/** Schema request yang dirujuk satu berkas rute: querystring / body / params. */
function requestSchemasOf(routeFile: string): string[] {
  const src = read(routeFile);
  const names = new Set<string>();
  for (const m of src.matchAll(/\b(querystring|body|params)\s*:\s*(\w+)/g)) names.add(m[2]!);
  return [...names];
}

// ─── 2. Pemeriksaan ───────────────────────────────────────────────────────────
const routesOf = (file: string): string[] =>
  [...read(file).matchAll(/app\.(get|post|put|patch|delete)\(\s*"([^"]*)"/g)].map(
    (m) => `${m[1]!.toUpperCase()} ${m[2]!}`,
  );

let moduleCount = 0;
let fieldCount = 0;
let totalDocs = 0;
let totalCode = 0;

for (const [app, modules] of Object.entries(APP_MODULES)) {
  for (const [mod, file] of Object.entries(modules)) {
    const doc = read(join("docs/api", app, `${mod}.md`));
    const routes = routesOf(file);

    // (1) Klaim jumlah endpoint.
    const claimed = /Jumlah endpoint:\*\*\s*(\d+)/.exec(doc)?.[1];
    assert.ok(claimed, `${app}/${mod}.md: header "Jumlah endpoint" tidak ditemukan`);
    assert.equal(Number(claimed), routes.length, `${app}/${mod}.md: klaim ${claimed} endpoint, kode punya ${routes.length}`);

    // (2) Tiap rute di kode muncul di tabel ringkasan.
    for (const route of routes) {
      const path = route.split(" ")[1]!;
      assert.ok(doc.includes(`\`${path}\``), `${app}/${mod}.md: rute "${route}" ada di kode tapi tidak di dokumen`);
    }

    // (3) Tiap field request terdokumentasi (nama ber-backtick).
    for (const schema of requestSchemasOf(file)) {
      const keys = keysOf(schema);
      assert.ok(keys.length > 0, `${app}/${mod}.md: schema "${schema}" tidak ditemukan / tidak punya field`);
      for (const key of keys) {
        assert.ok(
          doc.includes(`\`${key}\``),
          `${app}/${mod}.md: field "${key}" (dari ${schema}) tidak ada di dokumen`,
        );
        fieldCount++;
      }
    }

    moduleCount++;
    totalDocs += Number(claimed);
    totalCode += routes.length;
  }
}

// (4) Berkas modul harus tertaut dari README aplikasinya.
for (const app of Object.keys(APP_MODULES)) {
  const documented = read(join("docs/api", app, "README.md"));
  for (const f of readdirSync(join(DOCS, app)).filter((n) => n.endsWith(".md") && n !== "README.md")) {
    assert.ok(documented.includes(f), `docs/api/${app}/README.md belum menautkan ${f}`);
  }
}

// (5) Total di indeks utama.
assert.equal(totalDocs, totalCode, `total dokumen ${totalDocs} ≠ total kode ${totalCode}`);
assert.ok(
  read("docs/api/README.md").includes(`Total keseluruhan: ${totalCode} endpoint`),
  `docs/api/README.md harus menyebut "Total keseluruhan: ${totalCode} endpoint"`,
);

console.log(
  `✓ docs.check: ${moduleCount} modul, ${totalCode} endpoint, ${fieldCount} field request — cocok dengan kode`,
);
