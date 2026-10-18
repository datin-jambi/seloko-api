/**
 * lapak-categories.seeder.ts — 8 kategori layanan aset daerah (PRD 04 §3).
 *
 * Kategori adalah master yang dikelola Bapenda: OPD hanya MEMILIH, tidak
 * pernah membuat. Idempoten: upsert per (applicationId, slug). Slug sengaja
 * tidak diubah dari JSON — slug adalah URL publik, menggantinya memutus tautan.
 */
import { prisma } from "../shared/utils.js";
import type { LapakCategoryDef } from "../shared/types.js";

/** Kode aplikasi Lapak Web — duplikasi sengaja: prisma/ tidak boleh mengimpor src/ (rootDir). */
const LAPAK_WEB_CODE = "lapak-jambi-web";

export async function seedLapakCategories(categories: LapakCategoryDef[]): Promise<void> {
  console.log(`🗂️  Seed ${categories.length} kategori layanan Lapak…`);

  const app = await prisma.application.findUniqueOrThrow({
    where: { code: LAPAK_WEB_CODE },
    select: { id: true },
  });

  let revived = 0;
  for (const def of categories) {
    const data = {
      name: def.name,
      slug: def.slug,
      description: def.description ?? null,
      icon: def.icon ?? null,
      sortOrder: def.sortOrder ?? 0,
      isActive: def.isActive ?? true,
      // Kolom nullable: kosong berarti OPD wajib memilih sendiri saat membuat produk.
      defaultPricingUnit: def.defaultPricingUnit ?? null,
      defaultAvailabilityType: def.defaultAvailabilityType ?? null,
      defaultFulfillmentType: def.defaultFulfillmentType ?? null,
    };

    const existing = await prisma.lapakCategory.findFirst({
      where: { applicationId: app.id, slug: def.slug },
      select: { id: true, deletedAt: true },
    });

    if (existing) {
      // Hidupkan kembali bila pernah dihapus; sinkronkan sisanya.
      await prisma.lapakCategory.update({
        where: { id: existing.id },
        data: { ...data, deletedAt: null },
      });
      if (existing.deletedAt) revived++;
      continue;
    }

    await prisma.lapakCategory.create({
      data: { applicationId: app.id, ...data },
    });
  }

  const total = await prisma.lapakCategory.count({ where: { applicationId: app.id, deletedAt: null } });
  console.log(`✅ ${total} kategori layanan${revived > 0 ? ` (${revived} dihidupkan kembali)` : ""}`);
}
