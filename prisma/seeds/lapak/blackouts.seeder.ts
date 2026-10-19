/**
 * blackouts.seeder.ts — Tanggal tutup per produk Lapak (LJ-2.1).
 *
 * SUMBER: `blackouts.json`. Tanggal ditulis "MM-DD" + `yearOffset` supaya contoh
 * tetap relevan di tahun berjalan, bukan tahun yang sudah lewat.
 *
 * Rentang INKLUSIF di kedua ujung (skema: startDate=endDate = tutup sehari).
 * Tanggal disimpan sebagai DATE murni tanpa jam — memakai UTC tengah malam agar
 * tidak bergeser satu hari saat dibaca di zona waktu mana pun.
 *
 * IDEMPOTEN: kunci = (productId, startDate, endDate, reason). Baris yang sama
 * tidak dibuat dua kali; baris yang tidak ada di JSON tidak dihapus (mungkin
 * ditambahkan manual oleh OPD lewat CMS).
 */
import { prisma } from "../shared/utils.js";
import type { LapakBlackoutsFile } from "../shared/types.js";

const LAPAK_WEB_CODE = "lapak-jambi-web";
const MD_RE = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** "MM-DD" + tahun → Date UTC tengah malam (tanggal murni, tanpa jam). */
function toDate(year: number, md: string): Date {
  const [mm, dd] = md.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(year, mm - 1, dd));
  // Tolak tanggal mustahil seperti 02-30 (Date akan "memutar" ke Maret).
  if (d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) {
    throw new Error(`Tanggal "${md}" tidak valid pada tahun ${year}`);
  }
  return d;
}

export async function seedLapakBlackouts(data: LapakBlackoutsFile): Promise<void> {
  console.log(`📅 Seed ${data.blackouts.length} tanggal tutup produk Lapak…`);

  const products = await prisma.lapakProduct.findMany({
    where: { deletedAt: null },
    select: { id: true, slug: true },
  });
  const idBySlug = new Map(products.map((p) => [p.slug, p.id]));

  const nowYear = new Date().getFullYear();
  let created = 0;
  let existing = 0;
  let skipped = 0;

  for (const def of data.blackouts) {
    const productId = idBySlug.get(def.productSlug);
    if (!productId) {
      console.warn(`   ⚠️  Produk "${def.productSlug}" tidak ada — tanggal tutup dilewati.`);
      skipped++;
      continue;
    }
    if (!MD_RE.test(def.startDate) || !MD_RE.test(def.endDate)) {
      throw new Error(`Tanggal tutup "${def.productSlug}": format harus MM-DD`);
    }

    const startYear = nowYear + def.yearOffset;
    const endYear = nowYear + (def.endYearOffset ?? def.yearOffset);
    const startDate = toDate(startYear, def.startDate);
    const endDate = toDate(endYear, def.endDate);
    if (endDate < startDate) {
      throw new Error(`Tanggal tutup "${def.productSlug}": endDate mendahului startDate`);
    }

    const reason = def.reason ?? null;
    const found = await prisma.lapakBlackoutDate.findFirst({
      where: { productId, startDate, endDate, reason },
      select: { id: true },
    });
    if (found) {
      existing++;
      continue;
    }
    await prisma.lapakBlackoutDate.create({ data: { productId, startDate, endDate, reason } });
    created++;
  }

  console.log(
    `   ✓ ${created} dibuat, ${existing} sudah ada${skipped ? `, ${skipped} dilewati` : ""}.`,
  );
}
