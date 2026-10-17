/**
 * organizations.seeder.ts — Master OPD / unit kerja (core).
 *
 * Idempoten: upsert per `code`. Induk ditautkan pada putaran kedua supaya
 * urutan baris di JSON tidak penting.
 */
import { prisma } from "../shared/utils.js";
import type { OrganizationDef } from "../shared/types.js";

export async function seedOrganizations(defs: OrganizationDef[]): Promise<void> {
  const ids = new Map<string, string>();

  for (const def of defs) {
    const data = {
      name: def.name,
      shortName: def.shortName ?? null,
      type: def.type ?? "OPD",
      isActive: def.isActive ?? true,
    };
    const org = await prisma.organization.upsert({
      where: { code: def.code },
      update: data,
      create: { code: def.code, ...data },
      select: { id: true },
    });
    ids.set(def.code, org.id);
  }

  for (const def of defs) {
    const parentId = def.parent ? ids.get(def.parent) : null;
    if (def.parent && !parentId) {
      throw new Error(`Organisasi "${def.code}": induk "${def.parent}" tidak ada di organizations.json`);
    }
    await prisma.organization.update({
      where: { code: def.code },
      data: { parentId: parentId ?? null },
    });
  }

  console.log(`✅ ${defs.length} organisasi (OPD/UPTD)`);
}
