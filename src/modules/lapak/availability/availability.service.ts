import { prisma } from "~/config/database.js";
import { NotFoundError, BadRequestError } from "~/common/errors/index.js";
import { APP_CODES } from "~/common/constants/index.js";
import type {
  OperatingHourInput,
  CreateBlackoutBody,
} from "./availability.schema.js";

/** Satu hari dalam hasil cek ketersediaan (bentuk sama dengan shape respons). */
interface AvailabilityDay {
  date: string;
  weekday: number;
  isOpen: boolean;
  openTime: string | null;
  closeTime: string | null;
  reason: string | null;
}

/**
 * Jam operasional & tanggal tutup produk (LJ-2.1).
 *
 * Modul ini murni JADWAL — belum menyentuh reservasi/kuota (LJ-2.2). Hasil
 * `getAvailability` dipakai halaman publik untuk menampilkan hari mana yang
 * buka, dan nanti oleh validasi booking.
 */

async function getLapakAppId(): Promise<string> {
  const app = await prisma.application.findUniqueOrThrow({
    where: { code: APP_CODES.LAPAK_JAMBI_WEB },
    select: { id: true },
  });
  return app.id;
}

/** Lingkup OPD user; null = Bapenda/superadmin (semua OPD). */
export async function accessibleOrganizationIds(
  userId: string,
  isSuperAdmin: boolean,
): Promise<string[] | null> {
  if (isSuperAdmin) return null;
  const scopes = await prisma.userAppRoleOrganization.findMany({
    where: {
      userAppRole: {
        userId,
        application: { code: APP_CODES.LAPAK_JAMBI_WEB },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    },
    select: { organizationId: true },
  });
  return scopes.length === 0 ? null : [...new Set(scopes.map((s) => s.organizationId))];
}

/**
 * Ambil produk sekaligus tegakkan lingkup. `applicationId` ikut disaring agar
 * produk aplikasi lain tidak bisa diakses lewat ID yang ditebak.
 */
async function getProductOr404(productId: string, scope: string[] | null) {
  const applicationId = await getLapakAppId();
  const product = await prisma.lapakProduct.findFirst({
    where: { id: productId, applicationId, deletedAt: null },
    select: { id: true, organizationId: true, status: true },
  });
  if (!product) throw new NotFoundError("Produk", productId);
  if (scope !== null && !scope.includes(product.organizationId)) {
    // 404, bukan 403: jangan bocorkan keberadaan produk OPD lain.
    throw new NotFoundError("Produk", productId);
  }
  return product;
}

// ─── Jam operasional ──────────────────────────────────────────────────────────
export async function listOperatingHours(productId: string, scope: string[] | null) {
  await getProductOr404(productId, scope);
  return prisma.lapakOperatingHour.findMany({
    where: { productId },
    orderBy: { weekday: "asc" },
    select: { id: true, weekday: true, openTime: true, closeTime: true },
  });
}

/**
 * Ganti SELURUH jadwal mingguan (replace-set).
 *
 * Bukan tambah-satu-per-satu: jam buka adalah keputusan atas satu minggu, dan
 * replace-set mencegah keadaan setengah jadi. Transaksi memastikan tidak ada
 * momen jadwal kosong di tengah proses.
 */
export async function replaceOperatingHours(
  productId: string,
  hours: OperatingHourInput[],
  scope: string[] | null,
) {
  await getProductOr404(productId, scope);

  // Dua baris untuk hari yang sama akan ditolak unique index — tangkap lebih
  // awal agar pesannya jelas, bukan error database mentah.
  const weekdays = hours.map((h) => h.weekday);
  if (new Set(weekdays).size !== weekdays.length) {
    throw new BadRequestError("Setiap hari hanya boleh muncul sekali dalam jadwal");
  }

  return prisma.$transaction(async (tx) => {
    await tx.lapakOperatingHour.deleteMany({ where: { productId } });
    if (hours.length > 0) {
      await tx.lapakOperatingHour.createMany({
        data: hours.map((h) => ({
          productId,
          weekday: h.weekday,
          openTime: h.openTime,
          closeTime: h.closeTime,
        })),
      });
    }
    return tx.lapakOperatingHour.findMany({
      where: { productId },
      orderBy: { weekday: "asc" },
      select: { id: true, weekday: true, openTime: true, closeTime: true },
    });
  });
}

// ─── Tanggal tutup ────────────────────────────────────────────────────────────
export async function listBlackoutDates(productId: string, scope: string[] | null) {
  await getProductOr404(productId, scope);
  const rows = await prisma.lapakBlackoutDate.findMany({
    where: { productId },
    orderBy: { startDate: "asc" },
    select: { id: true, startDate: true, endDate: true, reason: true },
  });
  return rows.map(toBlackoutDto);
}

export async function createBlackoutDate(
  productId: string,
  body: CreateBlackoutBody,
  scope: string[] | null,
) {
  await getProductOr404(productId, scope);
  const row = await prisma.lapakBlackoutDate.create({
    data: {
      productId,
      startDate: new Date(`${body.startDate}T00:00:00.000Z`),
      endDate: new Date(`${body.endDate}T00:00:00.000Z`),
      reason: body.reason ?? null,
    },
    select: { id: true, startDate: true, endDate: true, reason: true },
  });
  return toBlackoutDto(row);
}

export async function deleteBlackoutDate(
  productId: string,
  id: string,
  scope: string[] | null,
) {
  await getProductOr404(productId, scope);
  const existing = await prisma.lapakBlackoutDate.findFirst({
    where: { id, productId },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError("Tanggal tutup", id);
  await prisma.lapakBlackoutDate.delete({ where: { id } });
  return { id, deleted: true as const };
}

// ─── Cek ketersediaan (publik) ────────────────────────────────────────────────
/** Batas rentang cek: 92 hari ≈ satu kuartal; cukup untuk kalender publik. */
const MAX_RANGE_DAYS = 92;

/**
 * Ketersediaan harian untuk rentang tanggal.
 *
 * Publik (tanpa login): hanya produk PUBLISHED yang boleh dicek, karena
 * jadwal produk DRAFT belum tentu final. Mengembalikan SATU baris per tanggal
 * — termasuk yang tutup — supaya frontend bisa merender kalender penuh tanpa
 * menebak hari yang hilang.
 */
export async function getAvailability(productId: string, from: string, to: string) {
  const applicationId = await getLapakAppId();
  const product = await prisma.lapakProduct.findFirst({
    where: { id: productId, applicationId, deletedAt: null, status: "PUBLISHED" },
    select: { id: true },
  });
  if (!product) throw new NotFoundError("Produk", productId);

  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  const spanDays = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (spanDays > MAX_RANGE_DAYS) {
    throw new BadRequestError(`Rentang maksimal ${MAX_RANGE_DAYS} hari`);
  }

  const [hours, blackouts] = await Promise.all([
    prisma.lapakOperatingHour.findMany({
      where: { productId },
      select: { weekday: true, openTime: true, closeTime: true },
    }),
    prisma.lapakBlackoutDate.findMany({
      // Irisan rentang: blackout beririsan bila start <= to DAN end >= from.
      where: { productId, startDate: { lte: end }, endDate: { gte: start } },
      select: { startDate: true, endDate: true, reason: true },
    }),
  ]);

  const hourByWeekday = new Map(hours.map((h) => [h.weekday, h]));
  const days: AvailabilityDay[] = [];

  for (let i = 0; i < spanDays; i++) {
    const d = new Date(start.getTime() + i * 86_400_000);
    const iso = d.toISOString().slice(0, 10);
    const weekday = d.getUTCDay();

    // Blackout menang atas jam operasional: maintenance membatalkan jadwal.
    const blackout = blackouts.find(
      (b) => iso >= b.startDate.toISOString().slice(0, 10) &&
             iso <= b.endDate.toISOString().slice(0, 10),
    );
    if (blackout) {
      days.push({
        date: iso, weekday, isOpen: false, openTime: null, closeTime: null,
        reason: blackout.reason ?? "Tutup (maintenance)",
      });
      continue;
    }

    const hour = hourByWeekday.get(weekday);
    days.push({
      date: iso,
      weekday,
      isOpen: Boolean(hour),
      openTime: hour?.openTime ?? null,
      closeTime: hour?.closeTime ?? null,
      reason: hour ? null : "Tutup pada hari ini",
    });
  }

  return { productId, from, to, days };
}

// ─── Mapper ───────────────────────────────────────────────────────────────────
function toBlackoutDto(row: {
  id: string;
  startDate: Date;
  endDate: Date;
  reason: string | null;
}) {
  return {
    id: row.id,
    startDate: row.startDate.toISOString().slice(0, 10),
    endDate: row.endDate.toISOString().slice(0, 10),
    reason: row.reason,
  };
}
