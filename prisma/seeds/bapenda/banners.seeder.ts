/**
 * banners.seeder.ts — Data awal banner portal Bapenda Jambi.
 *
 * Idempoten: melakukan upsert / update data berdasarkan judul & applicationId.
 */
import { prisma } from "../shared/utils.js";
import type { BannerDef } from "../shared/types.js";

const BAPENDA_PROFILE_CODE = "bapenda-profile";

export async function seedBanners(banners: BannerDef[]): Promise<void> {
  console.log(`🖼️  Seed ${banners.length} data Banner Bapenda Profile…`);

  const app = await prisma.application.findUniqueOrThrow({
    where: { code: BAPENDA_PROFILE_CODE },
    select: { id: true },
  });

  for (const def of banners) {
    const cleanTitle = def.title.trim();
    const cleanDescription = def.description?.trim() ? def.description.trim() : null;
    const cleanButtonText = def.buttonText?.trim() ? def.buttonText.trim() : null;
    const cleanButtonUrl = def.buttonUrl?.trim() ? def.buttonUrl.trim() : null;
    const cleanDeletedAt = def.deletedAt ? new Date(def.deletedAt) : null;

    const existing = await prisma.banner.findFirst({
      where: {
        applicationId: app.id,
        OR: [
          { title: cleanTitle },
          { title: def.title },
        ],
      },
    });

    if (existing) {
      await prisma.banner.update({
        where: { id: existing.id },
        data: {
          title: cleanTitle,
          description: cleanDescription,
          imageUrl: def.imageUrl.trim(),
          imageFileId: def.imageFileId ?? null,
          mobileImageUrl: def.mobileImageUrl?.trim() ?? null,
          mobileImageFileId: def.mobileImageFileId ?? null,
          buttonText: cleanButtonText,
          buttonUrl: cleanButtonUrl,
          sortOrder: def.sortOrder ?? 0,
          isActive: def.isActive ?? true,
          deletedAt: cleanDeletedAt,
          ...(def.updatedAt ? { updatedAt: new Date(def.updatedAt) } : {}),
        },
      });
    } else {
      await prisma.banner.create({
        data: {
          applicationId: app.id,
          title: cleanTitle,
          description: cleanDescription,
          imageUrl: def.imageUrl.trim(),
          imageFileId: def.imageFileId ?? null,
          mobileImageUrl: def.mobileImageUrl?.trim() ?? null,
          mobileImageFileId: def.mobileImageFileId ?? null,
          buttonText: cleanButtonText,
          buttonUrl: cleanButtonUrl,
          sortOrder: def.sortOrder ?? 0,
          isActive: def.isActive ?? true,
          deletedAt: cleanDeletedAt,
          ...(def.createdAt ? { createdAt: new Date(def.createdAt) } : {}),
          ...(def.updatedAt ? { updatedAt: new Date(def.updatedAt) } : {}),
        },
      });
    }
  }

  console.log(`   ✓ ${banners.length} Banner tersimpan/terbarui.`);
}
