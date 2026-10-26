/**
 * lapak-products.seeder.ts — produk & tarif contoh (LJ-1.7).
 *
 * SUMBER DATA: `products.json`, disusun dari scan resmi
 * **Perda Provinsi Jambi No. 5 Tahun 2024 tentang Pajak Daerah dan Retribusi
 * Daerah**, Lampiran II — Struktur dan Besarnya Tarif Retribusi Jasa Usaha
 * (tabel "Penyediaan Tempat Peninggalan" dan "Sewa", halaman 263–264).
 * Dokumen: https://jdih.jambiprov.go.id/index.php?page=detilperaturan&id=1116
 *
 * Entri `"opd": null` DILEWATI karena OPD pengelolanya belum ada di seed
 * organisasi. Barisnya sengaja dipertahankan agar mudah diaktifkan nanti —
 * menghapusnya berarti membuang hasil riset.
 *
 * IDEMPOTEN: kunci = slug produk. Bila sudah ada, tarif diganti utuh
 * (hapus lalu buat) sehingga perubahan harga di JSON benar-benar tercermin
 * dan baris lama tidak menumpuk.
 */
import { prisma } from "../shared/utils.js";
import type { LapakProductsFile } from "../shared/types.js";

/** Duplikasi sengaja: prisma/ tidak boleh mengimpor src/ (rootDir berbeda). */
const LAPAK_WEB_CODE = "lapak-jambi-web";

/** Atribut bawaan untuk produk hasil seed (kategori bisa menimpanya). */
const DEFAULT_AVAILABILITY = "DATE_RANGE";
/**
 * WAJIB salah satu nilai FulfillmentTypeSchema di src/modules/lapak/products/
 * products.schema.ts. Dulu berisi "MANUAL_CONFIRM" yang tidak ada di enum —
 * akibatnya seluruh GET /api/lapak/products (CMS) membalas 500 "Response doesn't
 * match the schema" karena produk seed tidak bisa diserialisasi.
 * BOOKING = aset dipesan lalu dikonfirmasi manual oleh petugas, yang memang
 * perilaku aset sewa di Lapak.
 */
const DEFAULT_FULFILLMENT = "BOOKING";

/** Slug deterministik dari nama: hasil sama di setiap run, tanpa faker. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 90);
}

export async function seedLapakProducts(data: LapakProductsFile): Promise<void> {
  console.log(`🛒 Seed ${data.produk.length} produk Lapak dari Perda Jambi 5/2024…`);

  const app = await prisma.application.findUniqueOrThrow({
    where: { code: LAPAK_WEB_CODE },
    select: { id: true },
  });

  const [orgs, categories] = await Promise.all([
    prisma.organization.findMany({ where: { deletedAt: null }, select: { id: true, code: true } }),
    prisma.lapakCategory.findMany({ where: { deletedAt: null }, select: { id: true, slug: true } }),
  ]);
  const orgByCode = new Map(orgs.map((o) => [o.code, o.id]));
  const catBySlug = new Map(categories.map((c) => [c.slug, c.id]));

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const item of data.produk) {
    const organizationId = item.opd ? orgByCode.get(item.opd) : undefined;
    const categoryId = catBySlug.get(item.kategori);
    if (!organizationId || !categoryId) {
      skipped++;
      continue;
    }

    const slug = slugify(item.nama);
    const existing = await prisma.lapakProduct.findFirst({
      where: { slug, applicationId: app.id },
      select: { id: true },
    });

    const rates = item.rates.map((r) => ({
      name: r.name,
      unit: r.unit,
      price: r.price,
      minQty: r.minQty ?? 1,
      effectiveFrom: new Date(),
      // Tarif seed langsung APPROVED: ini harga resmi dari Perda, bukan usulan
      // OPD yang perlu persetujuan berjenjang.
      status: "APPROVED" as const,
    }));

    if (existing) {
      await prisma.lapakProductRate.deleteMany({ where: { productId: existing.id } });
      await prisma.lapakProduct.update({
        where: { id: existing.id },
        data: {
          name: item.nama,
          description: item.deskripsi,
          organizationId,
          categoryId,
          pricingUnit: item.pricingUnit,
          rates: { create: rates },
        },
      });
      updated++;
    } else {
      await prisma.lapakProduct.create({
        data: {
          applicationId: app.id,
          organizationId,
          categoryId,
          name: item.nama,
          slug,
          description: item.deskripsi,
          pricingUnit: item.pricingUnit,
          availabilityType: DEFAULT_AVAILABILITY,
          fulfillmentType: DEFAULT_FULFILLMENT,
          // DRAFT: data hasil riset harus ditinjau Bapenda sebelum terbit.
          status: "DRAFT",
          rates: { create: rates },
        },
      });
      created++;
    }
  }

  console.log(
    `   ✓ ${created} dibuat, ${updated} diperbarui, ${skipped} dilewati (OPD/kategori belum ada).`,
  );
}
