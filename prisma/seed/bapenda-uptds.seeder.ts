/**
 * bapenda-uptds.seeder.ts — Data master UPTD Samsat Bapenda Jambi.
 *
 * Idempoten: melakukan upsert berdasarkan `code`.
 */
import { prisma } from "./utils.js";
import type { BapendaUptdDef } from "./types.js";

export async function seedBapendaUptds(uptds: BapendaUptdDef[]): Promise<void> {
  console.log(`🏛️  Seed ${uptds.length} data UPTD Samsat Bapenda…`);

  for (const def of uptds) {
    await prisma.bapendaUptd.upsert({
      where: { code: def.code },
      update: {
        name: def.name,
        description: def.description ?? null,
        address: def.address ?? null,
        phone: def.phone ?? null,
        email: def.email ?? null,
        headName: def.headName ?? null,
        province: def.province ?? "Jambi",
        city: def.city ?? null,
        district: def.district ?? null,
        subDistrict: def.subDistrict ?? null,
        postalCode: def.postalCode ?? null,
        latitude: def.latitude ?? null,
        longitude: def.longitude ?? null,
        googleMapsUrl: def.googleMapsUrl ?? null,
        isActive: def.isActive ?? true,
        showOnPublicMap: def.showOnPublicMap ?? true,
        deletedAt: null,
      },
      create: {
        code: def.code,
        name: def.name,
        description: def.description ?? null,
        address: def.address ?? null,
        phone: def.phone ?? null,
        email: def.email ?? null,
        headName: def.headName ?? null,
        province: def.province ?? "Jambi",
        city: def.city ?? null,
        district: def.district ?? null,
        subDistrict: def.subDistrict ?? null,
        postalCode: def.postalCode ?? null,
        latitude: def.latitude ?? null,
        longitude: def.longitude ?? null,
        googleMapsUrl: def.googleMapsUrl ?? null,
        isActive: def.isActive ?? true,
        showOnPublicMap: def.showOnPublicMap ?? true,
      },
    });
  }

  console.log(`   ✓ ${uptds.length} UPTD Samsat tersimpan/terbarui.`);
}
