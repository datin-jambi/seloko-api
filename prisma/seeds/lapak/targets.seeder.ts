/**
 * targets.seeder.ts — Target penerimaan retribusi per OPD per tahun (LJ-3.1).
 *
 * SUMBER: `targets.json` (angka ILUSTRASI — ganti dengan pagu resmi APBD).
 *
 * Keputusan skema yang dijaga di sini: `achieve` TIDAK disimpan. Realisasi
 * dihitung dashboard dari pesanan `LUNAS`, sehingga target tidak bisa memuat
 * capaian yang menyimpang dari data transaksi.
 *
 * IDEMPOTEN: upsert per [applicationId, organizationId, year].
 */
import { prisma } from "../shared/utils.js";
import type { LapakTargetsFile } from "../shared/types.js";

const LAPAK_WEB_CODE = "lapak-jambi-web";

export async function seedLapakTargets(data: LapakTargetsFile): Promise<void> {
  console.log(`🎯 Seed ${data.targets.length} target penerimaan Lapak…`);

  const app = await prisma.application.findUniqueOrThrow({
    where: { code: LAPAK_WEB_CODE },
    select: { id: true },
  });
  const orgs = await prisma.organization.findMany({
    where: { deletedAt: null },
    select: { id: true, code: true },
  });
  const idByCode = new Map(orgs.map((o) => [o.code, o.id]));

  const nowYear = new Date().getFullYear();
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const def of data.targets) {
    const organizationId = idByCode.get(def.organizationCode);
    if (!organizationId) {
      console.warn(`   ⚠️  OPD "${def.organizationCode}" tidak ada — target dilewati.`);
      skipped++;
      continue;
    }
    if (!Number.isInteger(def.amount) || def.amount < 0) {
      throw new Error(`Target "${def.organizationCode}": amount harus bilangan bulat ≥ 0`);
    }

    const year = nowYear + def.yearOffset;
    const existing = await prisma.lapakTarget.findFirst({
      where: { applicationId: app.id, organizationId, year },
      select: { id: true },
    });

    if (existing) {
      await prisma.lapakTarget.update({
        where: { id: existing.id },
        data: { amount: def.amount, note: def.note ?? null },
      });
      updated++;
    } else {
      await prisma.lapakTarget.create({
        data: {
          applicationId: app.id,
          organizationId,
          year,
          amount: def.amount,
          note: def.note ?? null,
        },
      });
      created++;
    }
  }

  console.log(
    `   ✓ ${created} dibuat, ${updated} diperbarui${skipped ? `, ${skipped} dilewati` : ""} (tahun ${nowYear}–${nowYear + 1}).`,
  );
}
