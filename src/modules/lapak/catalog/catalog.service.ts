import { prisma } from "~/config/database.js";
import { NotFoundError } from "~/common/errors/index.js";
import { getPublicProducts } from "../products/products.service.js";
import type { CatalogOrgProductsQuery } from "./catalog.schema.js";

/**
 * Profil OPD katalog publik (LJ-1.6, PRD 04 §176).
 *
 * `productCount` sengaja dihitung dari produk ber-status PUBLISHED milik
 * aplikasi lapak — bukan seluruh produk OPD. OPD bisa saja punya produk di
 * aplikasi lain; angka di katalog harus mencerminkan isi katalog itu sendiri.
 */
export async function getPublicOrganizationProfile(code: string) {
  const org = await prisma.organization.findFirst({
    where: { code, isActive: true, deletedAt: null },
    select: {
      id: true,
      code: true,
      name: true,
      shortName: true,
      description: true,
      address: true,
      phone: true,
      email: true,
      website: true,
      logoUrl: true,
    },
  });
  if (!org) throw new NotFoundError("Organisasi", code);

  const applicationId = await getLapakAppIdOrNull();
  const productCount = applicationId
    ? await prisma.lapakProduct.count({
        where: { organizationId: org.id, applicationId, status: "PUBLISHED", deletedAt: null },
      })
    : 0;

  const { id: _id, ...profile } = org;
  return { ...profile, productCount };
}

/** Produk terbit milik satu OPD — memakai ulang filter katalog yang sudah ada. */
export async function getPublicOrganizationProducts(
  code: string,
  query: CatalogOrgProductsQuery,
) {
  // Pastikan OPD memang ada & aktif: katalog kosong untuk kode salah akan
  // menyamarkan salah ketik URL di halaman SEO publik.
  await getPublicOrganizationProfile(code);
  return getPublicProducts({ ...query, organization: code });
}

/** Id aplikasi lapak; `null` bila belum di-seed (katalog kosong, bukan error). */
async function getLapakAppIdOrNull(): Promise<string | null> {
  const app = await prisma.application.findUnique({
    where: { code: "lapak-jambi-web" },
    select: { id: true },
  });
  return app?.id ?? null;
}
