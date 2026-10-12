/**
 * news.seeder.ts — Kategori & berita portal Bapenda (tabel universal articles,
 * type NEWS), dimigrasi dari aplikasi lama Bapenda-Jambi-Profile.
 *
 * Idempoten: upsert berdasarkan [applicationId, type, slug]. Penulis dicari
 * lewat username SELOKO, jadi users.seeder harus jalan lebih dulu.
 */
import { prisma } from "../shared/utils.js";
import type { NewsFile } from "../shared/types.js";

const BAPENDA_PROFILE_CODE = "bapenda-profile";
const date = (v: string | null | undefined) => (v ? new Date(v) : null);
/** Data lama menyimpan "" untuk kolom kosong — simpan sebagai NULL. */
const text = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);

export async function seedNews(file: NewsFile): Promise<void> {
  console.log(`📰 Seed ${file.categories.length} kategori & ${file.news.length} berita Bapenda Profile…`);

  const { id: applicationId } = await prisma.application.findUniqueOrThrow({
    where: { code: BAPENDA_PROFILE_CODE },
    select: { id: true },
  });

  const categoryIds = new Map<string, string>();
  for (const def of file.categories) {
    const data = {
      name: def.name,
      description: text(def.description),
      isActive: def.isActive ?? true,
      sortOrder: def.sortOrder ?? 0,
      deletedAt: date(def.deletedAt),
      // Nilai eksplisit menimpa @updatedAt — riwayat app lama tetap utuh.
      ...(def.updatedAt && { updatedAt: new Date(def.updatedAt) }),
    };
    const category = await prisma.articleCategory.upsert({
      where: { applicationId_type_slug: { applicationId, type: "NEWS", slug: def.slug } },
      update: data,
      create: {
        applicationId,
        type: "NEWS",
        slug: def.slug,
        ...data,
        ...(def.createdAt && { createdAt: new Date(def.createdAt) }),
      },
      select: { id: true },
    });
    categoryIds.set(def.slug, category.id);
  }

  const authors = await prisma.user.findMany({
    where: { username: { in: [...new Set(file.news.map((n) => n.authorUsername))] } },
    select: { id: true, username: true },
  });
  const authorIds = new Map(authors.map((a) => [a.username, a.id]));

  for (const def of file.news) {
    const categoryId = categoryIds.get(def.categorySlug);
    const authorId = authorIds.get(def.authorUsername);
    if (!categoryId) throw new Error(`Berita "${def.slug}": kategori "${def.categorySlug}" tidak ada`);
    if (!authorId) throw new Error(`Berita "${def.slug}": user "${def.authorUsername}" tidak ada`);

    const data = {
      categoryId,
      authorId,
      title: def.title.trim(),
      excerpt: text(def.excerpt),
      // Sumber data dari aplikasi lama yang sudah tersaring editor; sanitasi
      // tetap berlaku untuk tiap input lewat API.
      content: def.content,
      thumbnailUrl: text(def.thumbnailUrl),
      status: def.status,
      publishedAt: date(def.publishedAt),
      seoTitle: text(def.seoTitle),
      seoDescription: text(def.seoDescription),
      deletedAt: date(def.deletedAt),
      ...(def.updatedAt && { updatedAt: new Date(def.updatedAt) }),
    };
    await prisma.article.upsert({
      where: { applicationId_type_slug: { applicationId, type: "NEWS", slug: def.slug } },
      update: data,
      create: {
        applicationId,
        type: "NEWS",
        slug: def.slug,
        ...data,
        ...(def.createdAt && { createdAt: new Date(def.createdAt) }),
      },
    });
  }

  console.log(`   ✓ ${file.categories.length} kategori, ${file.news.length} berita tersimpan/terbarui.`);
}
