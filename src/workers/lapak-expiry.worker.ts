/**
 * lapak-expiry.worker.ts
 *
 * Menjalankan pembersihan kedaluwarsa Lapak secara berkala:
 * - lepas HOLD reservasi yang kedaluwarsa,
 * - kedaluwarsakan pesanan/SKRD yang tidak dibayar,
 * - kedaluwarsakan tiket lewat masa berlaku.
 *
 * Run: npx tsx src/workers/lapak-expiry.worker.ts
 *
 * ── Kenapa proses terpisah, bukan setInterval di server ──────────────────────
 * Bila dijalankan di dalam proses API, setiap instance yang di-scale akan
 * menjalankan worker sendiri. Meski lock DB mencegah tumpang tindih, lebih
 * bersih memisahkan beban latar dari jalur permintaan pengguna.
 *
 * ── Kenapa aman dijalankan berkali-kali ──────────────────────────────────────
 * Tiga lapis:
 * 1. `uq_lapak_expiry_runs_running` (unique parsial) → hanya satu run aktif.
 * 2. Ketiga fungsi pembersih memakai `WHERE` berbasis waktu/status → idempoten.
 * 3. SIGTERM/SIGINT menunggu run yang sedang berjalan selesai sebelum keluar,
 *    agar tidak meninggalkan status RUNNING menggantung.
 */
import { connectDatabase, prisma } from "~/config/database.js";
import { runExpiry } from "~/modules/lapak/expiry/expiry.service.js";

/** Interval default 5 menit; bisa diatur lewat env. */
const INTERVAL_MS = Number(process.env["LAPAK_EXPIRY_INTERVAL_MS"] ?? 5 * 60 * 1000);

let running = true;
let inFlight: Promise<unknown> | null = null;

async function tick(): Promise<void> {
  if (!running) return;
  inFlight = (async () => {
    try {
      const result = await runExpiry(null, false);
      const changed =
        result.releasedHolds + result.expiredPayments + result.expiredTickets;
      // Hanya cetak bila ada yang berubah — hindari log spam tiap 5 menit.
      if (changed > 0) {
        console.log(
          `[lapak-expiry] ${new Date().toISOString()} ` +
          `hold=${result.releasedHolds} pesanan=${result.expiredPayments} tiket=${result.expiredTickets} ` +
          `(${result.durationMs ?? 0}ms)`,
        );
      }
    } catch (err) {
      // Lock sedang dipegang run lain bukan kegagalan — cukup lewati putaran.
      const msg = String(err instanceof Error ? err.message : err);
      if (msg.toLowerCase().includes("sedang berjalan")) {
        console.log("[lapak-expiry] lewati: run lain sedang berjalan");
      } else {
        console.error("[lapak-expiry] GAGAL:", msg);
      }
    } finally {
      inFlight = null;
    }
  })();
  await inFlight;
}

async function main(): Promise<void> {
  await connectDatabase();
  console.log(`[lapak-expiry] mulai, interval ${INTERVAL_MS}ms`);

  // Jalankan sekali saat start, lalu berkala.
  await tick();
  const timer = setInterval(() => { void tick(); }, INTERVAL_MS);

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[lapak-expiry] ${signal} diterima — berhenti setelah run aktif selesai`);
    running = false;
    clearInterval(timer);
    // Tunggu run yang sedang berjalan agar tidak meninggalkan status RUNNING.
    if (inFlight) await inFlight.catch(() => undefined);
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGTERM", () => { void shutdown("SIGTERM"); });
  process.on("SIGINT", () => { void shutdown("SIGINT"); });
}

main().catch(async (err) => {
  console.error("[lapak-expiry] fatal:", err);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
