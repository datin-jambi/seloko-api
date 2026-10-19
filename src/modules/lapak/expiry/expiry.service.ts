import { Prisma } from "@prisma/client";
import { prisma } from "~/config/database.js";
import { BadRequestError, ConflictError, NotFoundError } from "~/common/errors/index.js";
import { releaseExpiredHolds } from "../reservations/reservations.service.js";
import { expireOverduePayments } from "../payments/payments.service.js";
import { expireOverdueTickets } from "../tickets/tickets.service.js";
import type { ExpiryRunDto, ListRunsQuery } from "./expiry.schema.js";

/**
 * Worker kedaluwarsa (LJ-2.8, PRD 04 §5).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TIGA JAMINAN:
 *
 * 1. HANYA SATU RUN BERJALAN. Ditegakkan unique index parsial
 *    `uq_lapak_expiry_runs_running` pada baris ber-status RUNNING. INSERT run
 *    baru gagal (P2002) bila sudah ada yang berjalan — bukan hanya dicek di
 *    kode, karena dua proses/instance bisa lolos pengecekan bersamaan.
 *
 * 2. SETIAP RUN TERCATAT. Worker mengubah status pesanan, SKRD, dan slot —
 *    perubahan yang tidak tercatat tidak bisa ditelusuri.
 *
 * 3. IDEMPOTEN LINTAS-RUN. Ketiga fungsi pembersih memakai `WHERE` berbasis
 *    waktu/status, jadi run kedua pada data yang sama mengubah 0 baris.
 *
 * Ketiga langkah berjalan BERURUTAN, bukan paralel: pelepasan HOLD lebih dulu
 * agar slot yang dilepas sudah bebas ketika pesanan ditandai kedaluwarsa.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const JOB_NAME = "lapak-expiry";
const LOCK_KEY = "lapak-expiry";

/** Run yang RUNNING lebih lama dari ini dianggap menggantung (proses mati). */
const STALE_AFTER_MS = 10 * 60 * 1000;

function toDto(row: {
  id: string; job: string; status: string;
  releasedHolds: number; expiredPayments: number; expiredTickets: number;
  triggeredBy: string | null; error: string | null;
  startedAt: Date; finishedAt: Date | null; durationMs: number | null;
}): ExpiryRunDto {
  return {
    id: row.id,
    job: row.job,
    status: row.status as ExpiryRunDto["status"],
    releasedHolds: row.releasedHolds,
    expiredPayments: row.expiredPayments,
    expiredTickets: row.expiredTickets,
    triggeredBy: row.triggeredBy,
    error: row.error,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    durationMs: row.durationMs,
  };
}

/** Tandai run yang menggantung sebagai TERPUTUS agar tidak menghalangi run baru. */
async function reapStaleRuns(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);
  const result = await prisma.lapakExpiryRun.updateMany({
    where: { job: JOB_NAME, status: "RUNNING", startedAt: { lt: cutoff } },
    data: {
      status: "TERPUTUS",
      finishedAt: new Date(),
      error: "Run tidak selesai dalam batas waktu — proses kemungkinan berhenti",
    },
  });
  return result.count;
}

/**
 * Jalankan pembersihan kedaluwarsa.
 *
 * @param triggeredBy id user (manual) atau null (scheduler)
 * @param force       hentikan run yang menggantung lebih dulu
 */
export async function runExpiry(
  triggeredBy: string | null,
  force: boolean,
): Promise<ExpiryRunDto> {
  const reaped = await reapStaleRuns();
  if (reaped > 0 && !force) {
    // Sudah dibersihkan; tetap lanjut — run lama yang menggantung bukan alasan
    // menolak run baru.
  }

  // ── Klaim kunci: satu-satunya penjaga lintas-proses ────────────────────────
  let runId: string;
  try {
    const created = await prisma.lapakExpiryRun.create({
      data: { job: JOB_NAME, lockKey: LOCK_KEY, status: "RUNNING", triggeredBy },
      select: { id: true },
    });
    runId = created.id;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      if (!force) {
        throw new ConflictError(
          "Worker kedaluwarsa sedang berjalan. Tunggu hingga selesai, atau kirim force=true untuk memaksa.",
        );
      }
      // force: hentikan run yang menghalangi, lalu coba lagi SEKALI.
      await prisma.lapakExpiryRun.updateMany({
        where: { job: JOB_NAME, status: "RUNNING" },
        data: {
          status: "TERPUTUS",
          finishedAt: new Date(),
          error: "Dihentikan paksa oleh run baru (force=true)",
        },
      });
      const retried = await prisma.lapakExpiryRun.create({
        data: { job: JOB_NAME, lockKey: LOCK_KEY, status: "RUNNING", triggeredBy },
        select: { id: true },
      });
      runId = retried.id;
    } else {
      throw err;
    }
  }

  const startedAt = Date.now();
  try {
    const holds = await releaseExpiredHolds();
    const payments = await expireOverduePayments();
    const tickets = await expireOverdueTickets();

    const finished = await prisma.lapakExpiryRun.update({
      where: { id: runId },
      data: {
        status: "SUKSES",
        releasedHolds: holds,
        expiredPayments: payments.expired,
        expiredTickets: tickets.expired,
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt,
      },
    });
    return toDto(finished);
  } catch (err) {
    // Kegagalan dicatat, lalu diteruskan — pemanggil harus tahu.
    await prisma.lapakExpiryRun.update({
      where: { id: runId },
      data: {
        status: "GAGAL",
        error: String(err instanceof Error ? err.message : err).slice(0, 500),
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt,
      },
    });
    throw err;
  }
}

// ─── Baca status ──────────────────────────────────────────────────────────────
/**
 * Ringkasan kondisi kedaluwarsa saat ini — tanpa mengubah apa pun.
 *
 * `pending` menghitung baris yang SUDAH lewat batas tetapi belum diproses worker,
 * sehingga operator tahu apakah perlu menjalankan worker sekarang.
 */
export async function getExpiryStatus() {
  const now = new Date();

  const [runningRows, lastRun, holds, payments, tickets] = await Promise.all([
    prisma.lapakExpiryRun.findMany({
      where: { job: JOB_NAME, status: "RUNNING" },
      select: { id: true },
      take: 1,
    }),
    prisma.lapakExpiryRun.findFirst({
      where: { job: JOB_NAME },
      orderBy: { startedAt: "desc" },
    }),
    prisma.lapakReservation.count({
      where: { status: "HOLD", expiresAt: { not: null, lte: now } },
    }),
    prisma.lapakPayment.count({
      where: { status: { in: ["MENUNGGU_BUKTI", "MENUNGGU_KONFIRMASI"] }, expiresAt: { not: null, lt: now } },
    }),
    prisma.lapakTicket.count({
      where: { status: "AKTIF", validUntil: { not: null, lt: now } },
    }),
  ]);

  return {
    running: runningRows.length > 0,
    currentRunId: runningRows[0]?.id ?? null,
    pending: { holds, payments, tickets },
    lastRun: lastRun ? toDto(lastRun) : null,
  };
}

export async function listRuns(query: ListRunsQuery) {
  const where = {
    job: JOB_NAME,
    ...(query.status && { status: query.status }),
  } satisfies Prisma.LapakExpiryRunWhereInput;

  const [rows, totalItems] = await Promise.all([
    prisma.lapakExpiryRun.findMany({
      where,
      orderBy: { startedAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.lapakExpiryRun.count({ where }),
  ]);

  const totalPages = Math.ceil(totalItems / query.limit) || 1;
  return {
    data: rows.map(toDto),
    meta: {
      page: query.page, limit: query.limit, totalItems, totalPages,
      hasNextPage: query.page < totalPages, hasPreviousPage: query.page > 1,
    },
  };
}

export async function getRun(id: string) {
  const row = await prisma.lapakExpiryRun.findFirst({ where: { id, job: JOB_NAME } });
  if (!row) throw new NotFoundError("Run worker", id);
  return toDto(row);
}

/**
 * Bersihkan riwayat run lama (housekeeping).
 *
 * Default menyimpan 30 hari terakhir: cukup untuk audit, tidak menumpuk selamanya.
 */
export async function purgeOldRuns(olderThanDays: number) {
  if (olderThanDays < 1) {
    throw new BadRequestError("olderThanDays minimal 1 hari");
  }
  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000);
  const result = await prisma.lapakExpiryRun.deleteMany({
    // Run RUNNING tidak pernah dihapus — ia penanda worker sedang bekerja.
    where: { job: JOB_NAME, status: { not: "RUNNING" }, startedAt: { lt: cutoff } },
  });
  return { deleted: result.count };
}
