/**
 * utils.ts — Prisma client bersama, pembaca JSON, dan pembantu kecil
 * yang dipakai lintas modul seeder.
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";

/**
 * Satu client untuk seluruh modul seeder.
 *
 * Sengaja dibagikan, bukan satu per modul: tiap PrismaClient membuka connection
 * pool sendiri, dan lima pool untuk satu skrip sekali jalan hanya menghabiskan
 * slot koneksi PostgreSQL.
 */
export const prisma = new PrismaClient();

const SEEDS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Baca berkas JSON dari prisma/seeds/ (misal: "core/applications.json", "bapenda/uptds.json"). */
export async function loadJson<T>(relativePath: string): Promise<T> {
  // readFile + JSON.parse, bukan `import ... with { type: "json" }`: import
  // attributes masih experimental di Node dan mencetak warning tiap run.
  const raw = await readFile(join(SEEDS_DIR, relativePath), "utf-8");
  return JSON.parse(raw) as T;
}

/** Ratakan campuran nama grup dan aksi tunggal menjadi daftar aksi unik. */
export function expandActions(
  actions: string[],
  groups: Record<string, string[]>,
): string[] {
  const out = new Set<string>();
  for (const item of actions) {
    for (const action of groups[item] ?? [item]) out.add(action);
  }
  return [...out];
}

/**
 * "expired" → 1 hari lalu, "+30d"/"+12h" → relatif dari sekarang,
 * sisanya diperlakukan sebagai ISO date. null bila permanen.
 */
export function resolveExpiry(value: string | null | undefined): Date | null {
  if (!value) return null;
  if (value === "expired") return new Date(Date.now() - 86_400_000);

  const relative = /^\+(\d+)([dhm])$/.exec(value);
  if (relative) {
    const amount = Number(relative[1]);
    const unitMs = { d: 86_400_000, h: 3_600_000, m: 60_000 }[relative[2] as "d" | "h" | "m"];
    return new Date(Date.now() + amount * unitMs);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`expiresAt tidak dikenali: "${value}"`);
  }
  return parsed;
}

/**
 * Hash argon2 dengan cache per-password.
 *
 * Parameter sama dengan users.service.ts (memoryCost 64MB) — sekitar 100ms
 * per hash, jadi 60 akun dengan password yang sama akan memakan menit-menit
 * kalau di-hash satu per satu.
 */
const hashCache = new Map<string, string>();

export async function hashPassword(plain: string): Promise<string> {
  const cached = hashCache.get(plain);
  if (cached) return cached;

  const hash = await argon2.hash(plain, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
  hashCache.set(plain, hash);
  return hash;
}
