import { z } from "zod";

/**
 * Reservasi rentang waktu produk (LJ-2.2, PRD 04 §H).
 *
 * Anti double-booking TIDAK dilakukan di sini — itu tugas exclusion constraint
 * PostgreSQL (`ex_lapak_reservations_no_overlap`). Service hanya menerjemahkan
 * pelanggaran `23P01` menjadi 409.
 */

const isoDateTime = z
  .string()
  .datetime({ offset: true, message: "Gunakan format ISO 8601 dengan zona waktu" });

// ─── Params ───────────────────────────────────────────────────────────────────
export const ReservationProductParamsSchema = z.object({
  productId: z.string().uuid({ message: "ID produk harus berupa UUID yang valid" }),
});
export type ReservationProductParams = z.infer<typeof ReservationProductParamsSchema>;

export const ReservationParamsSchema = z.object({
  id: z.string().uuid({ message: "ID reservasi harus berupa UUID yang valid" }),
});
export type ReservationParams = z.infer<typeof ReservationParamsSchema>;

// ─── Body ─────────────────────────────────────────────────────────────────────
export const CreateReservationBodySchema = z
  .object({
    startAt: isoDateTime.describe("Awal blok (ISO 8601, mis. 2026-12-01T08:00:00+07:00)"),
    endAt: isoDateTime.describe("Akhir blok — eksklusif, jadi boleh sama dengan awal booking berikutnya"),
    qty: z.number().int().min(1).max(10_000).default(1)
      .describe("Jumlah unit yang diblok (kuota); unit tunggal = 1"),
    /** Detik masa berlaku HOLD. Default 15 menit — cukup untuk mengisi form checkout. */
    holdSeconds: z.number().int().min(60).max(86_400).default(900),
    userId: z.string().uuid().nullable().optional(),
  })
  .refine((d) => new Date(d.endAt) > new Date(d.startAt), {
    message: "Akhir blok harus setelah awal blok",
    path: ["endAt"],
  });
export type CreateReservationBody = z.infer<typeof CreateReservationBodySchema>;

export const ListReservationsQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  status: z.enum(["HOLD", "CONFIRMED", "RELEASED"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
});
export type ListReservationsQuery = z.infer<typeof ListReservationsQuerySchema>;

/** Cek ketersediaan slot pada rentang (publik) — melengkapi cek per-tanggal LJ-2.1. */
export const SlotAvailabilityQuerySchema = z
  .object({
    from: isoDateTime,
    to: isoDateTime,
  })
  .refine((d) => new Date(d.to) > new Date(d.from), {
    message: "Akhir rentang harus setelah awal rentang",
    path: ["to"],
  });
export type SlotAvailabilityQuery = z.infer<typeof SlotAvailabilityQuerySchema>;

// ─── Shapes ───────────────────────────────────────────────────────────────────
export const ReservationShape = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  qty: z.number().int(),
  status: z.enum(["HOLD", "CONFIRMED", "RELEASED"]),
  expiresAt: z.string().datetime().nullable(),
  userId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
});

export type ReservationDto = z.infer<typeof ReservationShape>;

/** Satu blok terpakai dalam hasil cek slot. */
export const BusyBlockShape = z.object({
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  qty: z.number().int(),
  status: z.enum(["HOLD", "CONFIRMED"]),
});

const envelope = {
  statusCode: z.number(),
  code: z.string(),
  message: z.string(),
} as const;

export const CreateReservationResponseSchema = z.object({
  ...envelope,
  data: ReservationShape,
});

export const ReservationListResponseSchema = z.object({
  ...envelope,
  data: z.array(ReservationShape),
  meta: z.object({
    page: z.number(),
    limit: z.number(),
    totalItems: z.number(),
    totalPages: z.number(),
    hasNextPage: z.boolean(),
    hasPreviousPage: z.boolean(),
  }),
});

export const SlotAvailabilityResponseSchema = z.object({
  ...envelope,
  data: z.object({
    productId: z.string().uuid(),
    from: z.string().datetime(),
    to: z.string().datetime(),
    capacity: z.number().int().nullable().describe("Kapasitas produk; null = tak dibatasi"),
    /** Blok waktu yang sudah terpakai — frontend tinggal mencoret rentang ini. */
    busy: z.array(BusyBlockShape),
    /** Sisa kuota bila produk berkapasitas; null bila tak dibatasi. */
    remaining: z.number().int().nullable(),
  }),
});

export const ReleaseReservationResponseSchema = z.object({
  ...envelope,
  data: ReservationShape,
});
