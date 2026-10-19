/**
 * reset.ts — Pengosongan tabel untuk `--reset`.
 *
 * Daftar tabel dibaca dari DATABASE ITU SENDIRI (`information_schema`), bukan
 * ditulis manual. Versi sebelumnya memakai daftar manual dan terus tertinggal
 * setiap ada modul baru — akibatnya `--reset` gagal di FK `lapak_products`
 * (tabel Lapak belum terdaftar) padahal galeri/FAQ sudah.
 *
 * `TRUNCATE ... CASCADE` dipakai karena:
 * - satu perintah untuk seluruh tabel, jadi urutan FK tidak perlu dipikirkan;
 * - `RESTART IDENTITY` mengembalikan sequence;
 * - tidak perlu `DELETE` per baris yang lambat pada tabel besar.
 *
 * `_prisma_migrations` DIKECUALIKAN — mengosongkannya membuat Prisma mengira
 * skema belum termigrasi dan `migrate deploy` akan gagal (P3005).
 */
import { prisma } from "./utils.js";

const KEEP = new Set(["_prisma_migrations"]);

export async function resetTables(): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = current_schema()
    ORDER BY tablename
  `;

  const tables = rows.map((r) => r.tablename).filter((t) => !KEEP.has(t));
  if (tables.length === 0) {
    console.log("🧹 --reset: tidak ada tabel untuk dikosongkan.");
    return;
  }

  console.log(`🧹 --reset: mengosongkan ${tables.length} tabel…`);

  // Nama tabel berasal dari katalog Postgres, bukan input pengguna. Tetap
  // dikutip ganda agar aman terhadap nama berhuruf besar/karakter khusus.
  const list = tables.map((t) => `"${t.replace(/"/g, '""')}"`).join(", ");
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`,
  );

  console.log(`   ✓ ${tables.length} tabel dikosongkan (kecuali ${[...KEEP].join(", ")}).`);
}

/** Dipakai uji: pastikan tabel yang wajib ada memang ikut terdaftar. */
export async function listResettableTables(): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = current_schema() ORDER BY tablename
  `;
  return rows.map((r) => r.tablename).filter((t) => !KEEP.has(t));
}