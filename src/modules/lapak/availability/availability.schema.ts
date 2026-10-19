import { z } from "zod";

/**
 * Jam operasional & tanggal tutup produk (LJ-2.1, PRD 04 §H).
 *
 * Model jadwal:
 * - Satu baris per hari BUKA. Hari tanpa baris = tutup, jadi tidak ada kolom
 *   `isOpen` yang bisa bertentangan dengan keberadaan barisnya.
 * - `closeTime` < `openTime` = lintas tengah malam (mis. 20:00–02:00).
 * - `blackoutDates` menutup rentang tanggal penuh (maintenance), inklusif.
 */

const timeField = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Format jam harus HH:MM (24 jam)");

const dateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD");

// ─── Params ───────────────────────────────────────────────────────────────────
export const AvailabilityProductParamsSchema = z.object({
  productId: z.string().uuid({ message: "ID produk harus berupa UUID yang valid" }),
});
export type AvailabilityProductParams = z.infer<typeof AvailabilityProductParamsSchema>;

export const BlackoutParamsSchema = z.object({
  productId: z.string().uuid(),
  id: z.string().uuid({ message: "ID tanggal tutup harus berupa UUID yang valid" }),
});
export type BlackoutParams = z.infer<typeof BlackoutParamsSchema>;

// ─── Body ─────────────────────────────────────────────────────────────────────
export const OperatingHourInputSchema = z.object({
  weekday: z.number().int().min(0).max(6).describe("0 = Minggu … 6 = Sabtu"),
  openTime: timeField,
  closeTime: timeField,
});
export type OperatingHourInput = z.infer<typeof OperatingHourInputSchema>;

/**
 * Jadwal dikirim sebagai SATU set utuh (replace-set), bukan tambah-satu-per-satu:
 * mengubah jam buka adalah keputusan atas seluruh minggu, dan replace-set
 * mencegah keadaan setengah jadi saat satu hari gagal disimpan.
 */
export const ReplaceOperatingHoursBodySchema = z.object({
  hours: z.array(OperatingHourInputSchema).max(7, "Maksimal 7 baris (satu per hari)"),
});
export type ReplaceOperatingHoursBody = z.infer<typeof ReplaceOperatingHoursBodySchema>;

export const CreateBlackoutBodySchema = z
  .object({
    startDate: dateField,
    endDate: dateField,
    reason: z.string().trim().max(255).optional(),
  })
  .refine((d) => d.endDate >= d.startDate, {
    message: "Tanggal selesai tidak boleh sebelum tanggal mulai",
    path: ["endDate"],
  });
export type CreateBlackoutBody = z.infer<typeof CreateBlackoutBodySchema>;

export const CheckAvailabilityQuerySchema = z
  .object({
    from: dateField.describe("Tanggal mulai (YYYY-MM-DD)"),
    to: dateField.describe("Tanggal selesai (YYYY-MM-DD)"),
  })
  .refine((d) => d.to >= d.from, {
    message: "Tanggal selesai tidak boleh sebelum tanggal mulai",
    path: ["to"],
  });
export type CheckAvailabilityQuery = z.infer<typeof CheckAvailabilityQuerySchema>;

// ─── Shapes ───────────────────────────────────────────────────────────────────
export const OperatingHourShape = z.object({
  id: z.string().uuid(),
  weekday: z.number().int(),
  openTime: z.string(),
  closeTime: z.string(),
});

export const BlackoutShape = z.object({
  id: z.string().uuid(),
  startDate: z.string(),
  endDate: z.string(),
  reason: z.string().nullable(),
});

/** Satu hari dalam hasil cek ketersediaan publik. */
export const AvailabilityDayShape = z.object({
  date: z.string().describe("Tanggal (YYYY-MM-DD)"),
  weekday: z.number().int(),
  isOpen: z.boolean().describe("Buka menurut jam operasional & bukan tanggal tutup"),
  openTime: z.string().nullable(),
  closeTime: z.string().nullable(),
  reason: z.string().nullable().describe("Alasan bila tutup (mis. maintenance)"),
});

const envelope = {
  statusCode: z.number(),
  code: z.string(),
  message: z.string(),
} as const;

export const OperatingHoursResponseSchema = z.object({
  ...envelope,
  data: z.array(OperatingHourShape),
});

export const BlackoutListResponseSchema = z.object({
  ...envelope,
  data: z.array(BlackoutShape),
});

export const BlackoutResponseSchema = z.object({
  ...envelope,
  data: BlackoutShape,
});

export const AvailabilityResponseSchema = z.object({
  ...envelope,
  data: z.object({
    productId: z.string().uuid(),
    from: z.string(),
    to: z.string(),
    days: z.array(AvailabilityDayShape),
  }),
});

export const DeleteBlackoutResponseSchema = z.object({
  ...envelope,
  data: z.object({ id: z.string().uuid(), deleted: z.literal(true) }),
});
