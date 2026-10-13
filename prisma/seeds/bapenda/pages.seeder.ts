/**
 * pages.seeder.ts — Halaman profil portal Bapenda (sejarah, visi-misi, …),
 * dimigrasi dari aplikasi lama Bapenda-Jambi-Profile.
 *
 * Idempoten: upsert berdasarkan [applicationId, slug].
 */
import { prisma } from "../shared/utils.js";
import type { PageDef } from "../shared/types.js";

const BAPENDA_PROFILE_CODE = "bapenda-profile";
const date = (v: string | null | undefined) => (v ? new Date(v) : null);
/** Data lama menyimpan "" untuk kolom kosong — simpan sebagai NULL. */
const text = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);

export async function seedPages(pages: PageDef[]): Promise<void> {
  console.log(`📄 Seed ${pages.length} halaman profil Bapenda Profile…`);

  const { id: applicationId } = await prisma.application.findUniqueOrThrow({
    where: { code: BAPENDA_PROFILE_CODE },
    select: { id: true },
  });

  for (const def of pages) {
    const data = {
      title: def.title.trim(),
      // Sumber data dari aplikasi lama yang sudah tersaring editor; sanitasi
      // tetap berlaku untuk tiap input lewat API.
      content: def.content,
      seoTitle: text(def.seoTitle),
      seoDescription: text(def.seoDescription),
      isPublished: def.isPublished ?? false,
      publishedAt: date(def.publishedAt),
      deletedAt: date(def.deletedAt),
      // Nilai eksplisit menimpa @updatedAt — riwayat app lama tetap utuh.
      ...(def.updatedAt && { updatedAt: new Date(def.updatedAt) }),
    };
    await prisma.page.upsert({
      where: { applicationId_slug: { applicationId, slug: def.slug } },
      update: data,
      create: {
        applicationId,
        slug: def.slug,
        ...data,
        ...(def.createdAt && { createdAt: new Date(def.createdAt) }),
      },
    });
  }

  console.log(`   ✓ ${pages.length} halaman tersimpan/terbarui.`);
}
