/**
 * operating-hours.seeder.ts — Jam operasional per produk Lapak (LJ-2.1).
 *
 * SUMBER: `operating-hours.json`. Jam kantor OPD pengelola, dengan penginapan
 * dijaga 24 jam karena resepsionis menerima tamu di luar jam kerja.
 *
 * Semantik skema: hari TANPA baris berarti TUTUP (tidak ada kolom `isOpen`).
 * Karena itu seeder ini REPLACE-SET per produk — jadwal lama dihapus lebih dulu
 * agar menghapus sebuah hari di JSON benar-benar membuat produk tutup hari itu.
 * Upsert per hari saja tidak cukup: hari yang dihapus dari JSON akan tertinggal.
 *
 * IDEMPOTEN: dijalankan berulang menghasilkan jadwal yang sama persis.
 */
import { prisma } from "../shared/utils.js";
import type { LapakOperatingHoursFile } from "../shared/types.js";

const LAPAK_WEB_CODE = "lapak-jambi-web";
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function seedLapakOperatingHours(data: LapakOperatingHoursFile): Promise<void> {
  console.log(`🕒 Seed jam operasional ${data.hours.length} produk Lapak…`);

  const products = await prisma.lapakProduct.findMany({
    where: { deletedAt: null },
    select: { id: true, slug: true },
  });
  const idBySlug = new Map(products.map((p) => [p.slug, p.id]));

  let rows = 0;
  let skipped = 0;

  for (const def of data.hours) {
    const productId = idBySlug.get(def.productSlug);
    if (!productId) {
      console.warn(`   ⚠️  Produk "${def.productSlug}" tidak ada — jam operasional dilewati.`);
      skipped++;
      continue;
    }

    const entries = Object.entries(def.schedule).map(([day, [openTime, closeTime]]) => {
      const weekday = Number(day);
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
        throw new Error(`Jam operasional "${def.productSlug}": weekday "${day}" tidak valid (0–6)`);
      }
      if (!TIME_RE.test(openTime) || !TIME_RE.test(closeTime)) {
        throw new Error(
          `Jam operasional "${def.productSlug}" hari ${day}: format jam harus HH:MM (didapat "${openTime}"–"${closeTime}")`,
        );
      }
      return { productId, weekday, openTime, closeTime };
    });

    const dupes = entries.map((e) => e.weekday).filter((d, i, arr) => arr.indexOf(d) !== i);
    if (dupes.length > 0) {
      throw new Error(`Jam operasional "${def.productSlug}": weekday ganda (${dupes.join(", ")})`);
    }

    // Replace-set: hapus lalu buat ulang, satu transaksi.
    await prisma.$transaction([
      prisma.lapakOperatingHour.deleteMany({ where: { productId } }),
      ...(entries.length > 0 ? [prisma.lapakOperatingHour.createMany({ data: entries })] : []),
    ]);
    rows += entries.length;
  }

  console.log(`   ✓ ${rows} baris jam untuk ${data.hours.length - skipped} produk${skipped ? `, ${skipped} dilewati` : ""}.`);
}
