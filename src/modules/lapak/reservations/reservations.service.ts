import { Prisma } from "@prisma/client";
import { prisma } from "~/config/database.js";
import { NotFoundError, BadRequestError, ConflictError } from "~/common/errors/index.js";
import { APP_CODES } from "~/common/constants/index.js";
import type { CreateReservationBody, ListReservationsQuery, ReservationDto } from "./reservations.schema.js";

/**
 * Reservasi rentang waktu (LJ-2.2, PRD 04 §H).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PRINSIP: anti double-booking adalah tanggung jawab DATABASE, bukan kode ini.
 *
 * Exclusion constraint `ex_lapak_reservations_no_overlap` membuat dua reservasi
 * beririsan untuk produk yang sama mustahil tersimpan. Kode di sini hanya:
 *   1. memvalidasi masukan (zona waktu, akhir > awal, jam operasional),
 *   2. menyisipkan baris,
 *   3. menerjemahkan pelanggaran `23P01` menjadi 409 yang ramah.
 *
 * Pengecekan "apakah slot kosong?" sebelum INSERT **sengaja tidak dilakukan**:
 * antara SELECT dan INSERT selalu ada jendela race yang bisa dieksploitasi dua
 * request paralel. Constraint yang menutup jendela itu, bukan SELECT.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Kode SQLSTATE PostgreSQL untuk exclusion violation. */
const EXCLUSION_VIOLATION = "23P01";

async function getLapakAppId(): Promise<string> {
  const app = await prisma.application.findUniqueOrThrow({
    where: { code: APP_CODES.LAPAK_JAMBI_WEB },
    select: { id: true },
  });
  return app.id;
}

/** Produk harus milik aplikasi lapak, belum dihapus, dan terbit. */
async function getPublishedProductOr404(productId: string) {
  const applicationId = await getLapakAppId();
  const product = await prisma.lapakProduct.findFirst({
    where: { id: productId, applicationId, deletedAt: null, status: "PUBLISHED" },
    select: { id: true, capacity: true, operatingHours: { select: { weekday: true, openTime: true, closeTime: true } }, blackoutDates: { select: { startDate: true, endDate: true } } },
  });
  if (!product) throw new NotFoundError("Produk", productId);
  return product;
}

/** "HH:MM" pada tanggal tertentu, dalam zona waktu lokal server. */
function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

function hhmmToMinutes(hhmm: string): number {
  const [h = "0", m = "0"] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
}

/**
 * Validasi terhadap jadwal (LJ-2.1): blok harus di dalam jam operasional hari
 * itu dan tidak boleh menyentuh tanggal tutup.
 *
 * Catatan zona waktu: jam operasional disimpan sebagai "HH:MM" tanpa zona,
 * jadi perbandingan memakai jam LOKAL server. Untuk deployment satu zona
 * (WIB) ini benar dan sederhana; multi-zona butuh kolom zona per produk.
 */
function assertWithinSchedule(
  start: Date,
  end: Date,
  hours: Array<{ weekday: number; openTime: string; closeTime: string }>,
  blackouts: Array<{ startDate: Date; endDate: Date }>,
) {
  // Satu blok harus berada dalam SATU hari kalender — booking lintas hari
  // (menginap) ditangani sebagai beberapa baris atau aturan terpisah nanti.
  const startIso = start.toISOString().slice(0, 10);
  if (startIso !== end.toISOString().slice(0, 10)) {
    throw new BadRequestError("Blok reservasi harus berada dalam satu hari; pecah menjadi beberapa blok");
  }

  const blackout = blackouts.find(
    (b) => startIso >= b.startDate.toISOString().slice(0, 10) &&
           startIso <= b.endDate.toISOString().slice(0, 10),
  );
  if (blackout) throw new BadRequestError("Tanggal tersebut ditutup (maintenance)");

  if (hours.length === 0) return; // jadwal belum diatur = bebas

  const wd = start.getDay();
  const hour = hours.find((h) => h.weekday === wd);
  if (!hour) throw new BadRequestError("Produk tutup pada hari tersebut");

  const open = hhmmToMinutes(hour.openTime);
  const close = hhmmToMinutes(hour.closeTime);
  const s = minutesOfDay(start);
  const e = minutesOfDay(end);

  // close < open = lintas tengah malam; reservasi satu-hari tidak bisa
  // melewati tengah malam, jadi cukup tangani kasus normal di sini.
  const spansMidnight = close <= open;
  if (spansMidnight) {
    if (s < open || (e > close && e > open)) {
      throw new BadRequestError(`Blok di luar jam operasional (${hour.openTime}–${hour.closeTime})`);
    }
    return;
  }
  if (s < open || e > close) {
    throw new BadRequestError(`Blok di luar jam operasional (${hour.openTime}–${hour.closeTime})`);
  }
}

// ─── Create ───────────────────────────────────────────────────────────────────
export async function createReservation(productId: string, body: CreateReservationBody) {
  const product = await getPublishedProductOr404(productId);

  const start = new Date(body.startAt);
  const end = new Date(body.endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new BadRequestError("Tanggal tidak valid");
  }
  if (end <= start) throw new BadRequestError("Akhir blok harus setelah awal blok");
  if (start.getTime() < Date.now() - 60_000) {
    throw new BadRequestError("Tidak bisa memesan waktu yang sudah lewat");
  }

  assertWithinSchedule(start, end, product.operatingHours, product.blackoutDates);

  const expiresAt = new Date(Date.now() + body.holdSeconds * 1000);
  const id = crypto.randomUUID();

  try {
    // INSERT lewat SQL mentah karena `period` bertipe tstzrange (Prisma belum
    // punya tipe range). CHECK constraint memastikan period = [start_at, end_at).
    await prisma.$executeRaw`
      INSERT INTO lapak_reservations
        (id, product_id, period, start_at, end_at, qty, status, expires_at, user_id, created_at, updated_at)
      VALUES
        (${id}, ${productId},
         tstzrange(${start}::timestamptz, ${end}::timestamptz, '[)'),
         ${start}::timestamptz, ${end}::timestamptz, ${body.qty}, 'HOLD',
         ${expiresAt}::timestamptz, ${body.userId ?? null}, now(), now())
    `;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2010") {
      const meta = err.meta as { code?: string } | undefined;
      if (meta?.code === EXCLUSION_VIOLATION) {
        // Pesan sengaja tidak menyebut detail reservasi lain (bisa milik orang
        // lain) — cukup "sudah dipesan" agar tidak membocorkan data pemesan.
        throw new ConflictError("Slot waktu tersebut sudah dipesan. Pilih waktu lain.");
      }
    }
    throw err;
  }

  const created = await getReservationByIdOr404(id);
  return created;
}

async function getReservationByIdOr404(id: string): Promise<ReservationDto> {
  const rows = await prisma.$queryRaw<Array<{
    id: string; product_id: string; start_at: Date; end_at: Date;
    qty: number; status: "HOLD" | "CONFIRMED" | "RELEASED";
    expires_at: Date | null; user_id: string | null; created_at: Date;
  }>>`
    SELECT id, product_id, start_at, end_at, qty, status, expires_at, user_id, created_at
    FROM lapak_reservations WHERE id = ${id}
  `;
  const r = rows[0];
  if (!r) throw new NotFoundError("Reservasi", id);
  return toDto(r);
}

interface RawReservation {
  id: string; product_id: string; start_at: Date; end_at: Date;
  qty: number; status: "HOLD" | "CONFIRMED" | "RELEASED";
  expires_at: Date | null; user_id: string | null; created_at: Date;
}

function toDto(r: RawReservation): ReservationDto {
  return {
    id: r.id,
    productId: r.product_id,
    startAt: r.start_at.toISOString(),
    endAt: r.end_at.toISOString(),
    qty: r.qty,
    status: r.status,
    expiresAt: r.expires_at?.toISOString() ?? null,
    userId: r.user_id,
    createdAt: r.created_at.toISOString(),
  };
}

// ─── Release ──────────────────────────────────────────────────────────────────
/**
 * Lepas reservasi (HOLD → RELEASED).
 *
 * Baris TIDAK dihapus: riwayat tetap ada, dan partial index
 * (`WHERE status <> 'RELEASED'`) membuat slotnya langsung bisa dipesan ulang.
 */
export async function releaseReservation(id: string) {
  const rows = await prisma.$queryRaw<RawReservation[]>`
    UPDATE lapak_reservations
    SET status = 'RELEASED', updated_at = now()
    WHERE id = ${id} AND status = 'HOLD'
    RETURNING id, product_id, start_at, end_at, qty, status, expires_at, user_id, created_at
  `;
  if (rows[0]) return toDto(rows[0]);

  // Tidak ada yang ter-update: entah tidak ada, atau statusnya bukan HOLD.
  const existing = await getReservationByIdOr404(id);
  if (existing.status !== "HOLD") {
    throw new BadRequestError(`Hanya reservasi HOLD yang bisa dilepas (status saat ini ${existing.status})`);
  }
  return existing;
}

// ─── List (CMS) ───────────────────────────────────────────────────────────────
export async function listReservations(productId: string, query: ListReservationsQuery) {
  await getPublishedProductOr404(productId).catch(() => {
    throw new NotFoundError("Produk", productId);
  });

  const offset = (query.page - 1) * query.limit;
  const rows = await prisma.$queryRaw<RawReservation[]>`
    SELECT id, product_id, start_at, end_at, qty, status, expires_at, user_id, created_at
    FROM lapak_reservations
    WHERE product_id = ${productId}
      AND (${query.status ?? null}::text IS NULL OR status::text = ${query.status ?? null})
      AND (${query.from ?? null}::timestamptz IS NULL OR end_at > ${query.from ?? null}::timestamptz)
      AND (${query.to ?? null}::timestamptz IS NULL OR start_at < ${query.to ?? null}::timestamptz)
    ORDER BY start_at ASC
    LIMIT ${query.limit} OFFSET ${offset}
  `;

  const countRows = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT count(*) AS n FROM lapak_reservations
    WHERE product_id = ${productId}
      AND (${query.status ?? null}::text IS NULL OR status::text = ${query.status ?? null})
      AND (${query.from ?? null}::timestamptz IS NULL OR end_at > ${query.from ?? null}::timestamptz)
      AND (${query.to ?? null}::timestamptz IS NULL OR start_at < ${query.to ?? null}::timestamptz)
  `;
  const totalItems = Number(countRows[0]?.n ?? 0);
  const totalPages = Math.ceil(totalItems / query.limit) || 1;

  return {
    data: rows.map(toDto),
    meta: {
      page: query.page, limit: query.limit, totalItems, totalPages,
      hasNextPage: query.page < totalPages, hasPreviousPage: query.page > 1,
    },
  };
}

// ─── Slot availability (publik) ───────────────────────────────────────────────
/**
 * Blok yang sudah terpakai pada rentang — melengkapi cek per-tanggal LJ-2.1.
 *
 * HOLD yang sudah kedaluwarsa (`expiresAt` lewat) TIDAK dihitung: secara
 * efektif sudah bebas walau worker belum sempat membersihkannya.
 */
export async function getSlotAvailability(productId: string, from: string, to: string) {
  const product = await getPublishedProductOr404(productId);

  const rows = await prisma.$queryRaw<Array<{
    start_at: Date; end_at: Date; qty: number; status: "HOLD" | "CONFIRMED";
  }>>`
    SELECT start_at, end_at, qty, status
    FROM lapak_reservations
    WHERE product_id = ${productId}
      AND status IN ('HOLD', 'CONFIRMED')
      AND (status = 'CONFIRMED' OR expires_at IS NULL OR expires_at > now())
      AND start_at < ${to}::timestamptz
      AND end_at > ${from}::timestamptz
    ORDER BY start_at ASC
  `;

  const busy = rows.map((r) => ({
    startAt: r.start_at.toISOString(),
    endAt: r.end_at.toISOString(),
    qty: r.qty,
    status: r.status,
  }));

  return {
    productId,
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    capacity: product.capacity,
    busy,
    // Sisa kuota = kapasitas dikurangi blok terpakai terbanyak pada satu waktu.
    remaining: product.capacity === null
      ? null
      : Math.max(0, product.capacity - busy.reduce((m, b) => Math.max(m, b.qty), 0)),
  };
}

/** Worker: lepas HOLD yang kedaluwarsa. Aman dipanggil berulang. */
export async function releaseExpiredHolds(): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    UPDATE lapak_reservations
    SET status = 'RELEASED', updated_at = now()
    WHERE status = 'HOLD' AND expires_at IS NOT NULL AND expires_at <= now()
    RETURNING id
  `;
  return rows.length;
}
