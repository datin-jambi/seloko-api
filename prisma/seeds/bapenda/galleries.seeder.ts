/**
 * galleries.seeder.ts — Galeri portal Bapenda, dimigrasi dari aplikasi lama
 * Bapenda-Jambi-Profile (galleries.json + gallery_items.json).
 *
 * Idempoten: galeri di-upsert berdasarkan [applicationId, slug]; item galeri
 * disinkron penuh (hapus lalu buat ulang) karena tidak punya kunci alami.
 * Penulis dicari lewat username SELOKO, jadi users.seeder harus jalan lebih dulu.
 */
import { prisma } from "../shared/utils.js";
import type { GalleriesFile } from "../shared/types.js";

const BAPENDA_PROFILE_CODE = "bapenda-profile";
const date = (v: string | null | undefined) => (v ? new Date(v) : null);

export async function seedGalleries(file: GalleriesFile): Promise<void> {
  console.log(`🖼️  Seed ${file.galleries.length} galeri Bapenda Profile…`);

  const { id: applicationId } = await prisma.application.findUniqueOrThrow({
    where: { code: BAPENDA_PROFILE_CODE },
    select: { id: true },
  });

  const authors = await prisma.user.findMany({
    where: { username: { in: [...new Set(file.galleries.map((g) => g.authorUsername))] } },
    select: { id: true, username: true },
  });
  const authorIds = new Map(authors.map((a) => [a.username, a.id]));

  let itemCount = 0;
  for (const def of file.galleries) {
    const authorId = authorIds.get(def.authorUsername);
    if (!authorId) throw new Error(`Galeri "${def.slug}": user "${def.authorUsername}" tidak ada`);

    const data = {
      authorId,
      title: def.title,
      description: def.description ?? null,
      coverImageUrl: def.coverImageUrl ?? null,
      status: def.status,
      publishedAt: date(def.publishedAt),
      deletedAt: date(def.deletedAt),
      // Nilai eksplisit menimpa @updatedAt — riwayat app lama tetap utuh.
      ...(def.updatedAt && { updatedAt: new Date(def.updatedAt) }),
    };

    const gallery = await prisma.gallery.upsert({
      where: { applicationId_slug: { applicationId, slug: def.slug } },
      update: data,
      create: {
        applicationId,
        slug: def.slug,
        ...data,
        ...(def.createdAt && { createdAt: new Date(def.createdAt) }),
      },
      select: { id: true },
    });

    await prisma.$transaction([
      prisma.galleryItem.deleteMany({ where: { galleryId: gallery.id } }),
      prisma.galleryItem.createMany({
        data: def.items.map((item) => ({
          galleryId: gallery.id,
          mediaType: item.mediaType,
          fileUrl: item.fileUrl,
          title: item.title ?? null,
          description: item.description ?? null,
          sortOrder: item.sortOrder,
          deletedAt: date(item.deletedAt),
          ...(item.createdAt && { createdAt: new Date(item.createdAt) }),
        })),
      }),
    ]);
    itemCount += def.items.length;
  }

  console.log(`   ✓ ${file.galleries.length} galeri, ${itemCount} item tersimpan/terbarui.`);
}
