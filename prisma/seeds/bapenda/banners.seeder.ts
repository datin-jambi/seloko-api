/**
 * banners.seeder.ts — Data awal banner portal Bapenda Jambi.
 *
 * Idempoten: melakukan upsert / update data berdasarkan judul & applicationId.
 */
import { prisma } from "../shared/utils.js";
import { APP_CODES } from "../../../src/common/constants/index.js";
import type { BannerDef } from "../shared/types.js";

export async function seedBanners(banners: BannerDef[]): Promise<void> {
  console.log(`🖼️  Seed ${banners.length} data Banner Bapenda Profile…`);

  const app = await prisma.application.findUniqueOrThrow({
    where: { code: APP_CODES.BAPENDA_PROFILE },
    select: { id: true },
  });

  for (const def of banners) {
    const existing = await prisma.banner.findFirst({
      where: {
        applicationId: app.id,
        title: def.title,
      },
    });

    if (existing) {
      await prisma.banner.update({
        where: { id: existing.id },
        data: {
          description: def.description ?? null,
          imageUrl: def.imageUrl,
          imageFileId: def.imageFileId ?? null,
          buttonText: def.buttonText ?? null,
          buttonUrl: def.buttonUrl ?? null,
          sortOrder: def.sortOrder ?? 0,
          isActive: def.isActive ?? true,
          deletedAt: null,
        },
      });
    } else {
      await prisma.banner.create({
        data: {
          applicationId: app.id,
          title: def.title,
          description: def.description ?? null,
          imageUrl: def.imageUrl,
          imageFileId: def.imageFileId ?? null,
          buttonText: def.buttonText ?? null,
          buttonUrl: def.buttonUrl ?? null,
          sortOrder: def.sortOrder ?? 0,
          isActive: def.isActive ?? true,
        },
      });
    }
  }

  console.log(`   ✓ ${banners.length} Banner tersimpan/terbarui.`);
}
