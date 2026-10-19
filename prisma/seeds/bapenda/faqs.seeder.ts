/**
 * faqs.seeder.ts — Kategori & FAQ portal Bapenda, dimigrasi dari aplikasi lama
 * Bapenda-Jambi-Profile (faq_categories.json + faqs.json).
 *
 * Idempoten: upsert berdasarkan [applicationId, slug]. Penulis dicari lewat
 * username SELOKO, jadi users.seeder harus jalan lebih dulu.
 */
import { prisma } from "../shared/utils.js";
import type { FaqsFile } from "../shared/types.js";

const BAPENDA_PROFILE_CODE = "bapenda-profile";
const date = (v: string | null | undefined) => (v ? new Date(v) : null);

export async function seedFaqs(file: FaqsFile): Promise<void> {
  console.log(`❓ Seed ${file.categories.length} kategori & ${file.faqs.length} FAQ Bapenda Profile…`);

  const { id: applicationId } = await prisma.application.findUniqueOrThrow({
    where: { code: BAPENDA_PROFILE_CODE },
    select: { id: true },
  });

  const categoryIds = new Map<string, string>();
  for (const def of file.categories) {
    const data = {
      name: def.name,
      description: def.description ?? null,
      sortOrder: def.sortOrder,
      isActive: def.isActive,
      deletedAt: date(def.deletedAt),
      ...(def.updatedAt && { updatedAt: new Date(def.updatedAt) }),
    };
    const category = await prisma.faqCategory.upsert({
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
    categoryIds.set(def.slug, category.id);
  }

  const usernames = file.faqs.flatMap((f) => [f.authorUsername, f.updatedByUsername ?? []].flat());
  const users = await prisma.user.findMany({
    where: { username: { in: [...new Set(usernames)] } },
    select: { id: true, username: true },
  });
  const userIds = new Map(users.map((u) => [u.username, u.id]));

  for (const def of file.faqs) {
    const categoryId = categoryIds.get(def.categorySlug);
    const authorId = userIds.get(def.authorUsername);
    if (!categoryId) throw new Error(`FAQ "${def.slug}": kategori "${def.categorySlug}" tidak ada`);
    if (!authorId) throw new Error(`FAQ "${def.slug}": user "${def.authorUsername}" tidak ada`);

    const data = {
      categoryId,
      authorId,
      updatedById: def.updatedByUsername ? (userIds.get(def.updatedByUsername) ?? null) : null,
      question: def.question,
      answer: def.answer,
      sortOrder: def.sortOrder,
      isPublished: def.isPublished,
      // Hitungan pembaca hanya ditulis saat baris dibuat — seed ulang tidak
      // boleh menimpa hitungan yang sudah bertambah di produksi.
      publishedAt: date(def.publishedAt),
      deletedAt: date(def.deletedAt),
      ...(def.updatedAt && { updatedAt: new Date(def.updatedAt) }),
    };
    await prisma.faq.upsert({
      where: { applicationId_slug: { applicationId, slug: def.slug } },
      update: data,
      create: {
        applicationId,
        slug: def.slug,
        viewCount: def.viewCount ?? 0,
        ...data,
        ...(def.createdAt && { createdAt: new Date(def.createdAt) }),
      },
    });
  }

  console.log(`   ✓ ${file.categories.length} kategori, ${file.faqs.length} FAQ tersimpan/terbarui.`);
}
