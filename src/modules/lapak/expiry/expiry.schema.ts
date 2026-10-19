import { z } from "zod";

/**
 * Worker kedaluwarsa (LJ-2.8, PRD 04 §5).
 *
 * Menjalankan tiga pembersihan yang sudah ada di modulnya masing-masing:
 * 1. Lepas HOLD reservasi yang kedaluwarsa (LJ-2.2).
 * 2. Pesanan & SKRD kedaluwarsa karena tidak dibayar (LJ-2.6).
 * 3. Tiket lewat masa berlaku (LJ-2.7).
 *
 * Worker ini MENGUBAH STATUS DATA — karena itu setiap run dicatat, dan hanya
 * satu run boleh berjalan pada satu waktu.
 */

export const RunExpiryBodySchema = z.object({
  /**
   * Jalankan meski ada run lain yang masih RUNNING (mis. run yang menggantung
   * karena proses mati). Run lama ditandai TERPUTUS lebih dulu.
   * Default false: lebih aman menolak daripada dua worker berjalan bersamaan.
   */
  force: z.boolean().default(false),
});
export type RunExpiryBody = z.infer<typeof RunExpiryBodySchema>;

export const RunParamsSchema = z.object({
  id: z.string().uuid({ message: "ID run harus berupa UUID yang valid" }),
});

export const PurgeRunsQuerySchema = z.object({
  olderThanDays: z.coerce.number().int().min(1).max(3650).optional()
    .describe("Simpan run N hari terakhir (default 30)"),
});

export const PurgeRunsResponseSchema = z.object({
  statusCode: z.number(),
  code: z.string(),
  message: z.string(),
  data: z.object({ deleted: z.number().int() }),
});

export const ListRunsQuerySchema = z.object({
  status: z.enum(["RUNNING", "SUKSES", "GAGAL", "TERPUTUS"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
export type ListRunsQuery = z.infer<typeof ListRunsQuerySchema>;

export const ExpiryRunShape = z.object({
  id: z.string().uuid(),
  job: z.string(),
  status: z.enum(["RUNNING", "SUKSES", "GAGAL", "TERPUTUS"]),
  releasedHolds: z.number().int(),
  expiredPayments: z.number().int(),
  expiredTickets: z.number().int(),
  triggeredBy: z.string().nullable(),
  error: z.string().nullable(),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable(),
  durationMs: z.number().int().nullable(),
});

export const ExpiryRunResponseSchema = z.object({
  statusCode: z.number(),
  code: z.string(),
  message: z.string(),
  data: ExpiryRunShape,
});

export const ExpiryRunListResponseSchema = z.object({
  statusCode: z.number(),
  code: z.string(),
  message: z.string(),
  data: z.array(ExpiryRunShape),
  meta: z.object({
    page: z.number(), limit: z.number(), totalItems: z.number(),
    totalPages: z.number(), hasNextPage: z.boolean(), hasPreviousPage: z.boolean(),
  }),
});

export const ExpiryStatusShape = z.object({
  /** Ada run yang masih RUNNING? Frontend bisa menonaktifkan tombol. */
  running: z.boolean(),
  currentRunId: z.string().nullable(),
  /** Jumlah baris yang SAAT INI sudah lewat batas (belum diproses). */
  pending: z.object({
    holds: z.number().int(),
    payments: z.number().int(),
    tickets: z.number().int(),
  }),
  lastRun: ExpiryRunShape.nullable(),
});

export const ExpiryStatusResponseSchema = z.object({
  statusCode: z.number(),
  code: z.string(),
  message: z.string(),
  data: ExpiryStatusShape,
});

export type ExpiryRunDto = z.infer<typeof ExpiryRunShape>;
