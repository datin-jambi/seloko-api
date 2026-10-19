/**
 * regulations.seeder.ts — Regulasi & dokumen PDF portal Bapenda, dimigrasi dari
 * aplikasi lama Bapenda-Jambi-Profile (regulations.json).
 *
 * Idempoten: upsert berdasarkan [applicationId, slug].
 */
import { prisma } from "../shared/utils.js";
import type { RegulationsFile } from "../shared/types.js";

const BAPENDA_PROFILE_CODE = "bapenda-profile";
const date = (v: string | null | undefined) => (v ? new Date(v) : null);

export async function seedRegulations(file: RegulationsFile): Promise<void> {
  console.log(`📜 Seed ${file.regulations.length} regulasi Bapenda Profile…`);

  const { id: applicationId } = await prisma.application.findUniqueOrThrow({
    where: { code: BAPENDA_PROFILE_CODE },
    select: { id: true },
  });

  for (const def of file.regulations) {
    const data = {
      title: def.title,
      description: def.description ?? null,
      fileUrl: def.fileUrl,
      fileId: def.fileId ?? null,
      fileName: def.fileName ?? null,
      fileSize: def.fileSize ?? null,
      status: def.status,
      publishedAt: date(def.publishedAt),
      deletedAt: date(def.deletedAt),
      // Nilai eksplisit menimpa @updatedAt — riwayat app lama tetap utuh.
      ...(def.updatedAt && { updatedAt: new Date(def.updatedAt) }),
    };
    await prisma.regulation.upsert({
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

  console.log(`   ✓ ${file.regulations.length} regulasi tersimpan/terbarui.`);
}
