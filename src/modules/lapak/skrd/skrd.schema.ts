import { z } from "zod";

/**
 * Pengaturan & penerbitan SKRD (LJ-2.5, PRD 04 §D).
 *
 * Token format nomor yang didukung — divalidasi agar salah ketik tertangkap
 * saat menyimpan pengaturan, bukan saat menerbitkan dokumen negara.
 */
export const NUMBER_FORMAT_TOKENS = [
  "{seq}", "{seq6}", "{issuer}", "{romanMonth}", "{month}", "{year}", "{orgCode}",
] as const;

// ─── Params ───────────────────────────────────────────────────────────────────
export const SkrdSettingParamsSchema = z.object({
  id: z.string().uuid({ message: "ID pengaturan harus berupa UUID yang valid" }),
});
export type SkrdSettingParams = z.infer<typeof SkrdSettingParamsSchema>;

export const SkrdParamsSchema = z.object({
  id: z.string().uuid({ message: "ID SKRD harus berupa UUID yang valid" }),
});
export type SkrdParams = z.infer<typeof SkrdParamsSchema>;

export const SkrdOrderParamsSchema = z.object({
  orderId: z.string().uuid({ message: "ID pesanan harus berupa UUID yang valid" }),
});
export type SkrdOrderParams = z.infer<typeof SkrdOrderParamsSchema>;

export const SkrdOrgCodeParamsSchema = z.object({
  organizationCode: z.string().trim().min(1).max(50).describe("Kode OPD, mis. BPSDM"),
});
export type SkrdOrgCodeParams = z.infer<typeof SkrdOrgCodeParamsSchema>;

export const SkrdDeleteResponseSchema = z.object({
  statusCode: z.number(),
  code: z.string(),
  message: z.string(),
  data: z.object({ id: z.string(), deleted: z.literal(true) }),
});

export const SkrdPreviewResponseSchema = z.object({
  statusCode: z.number(),
  code: z.string(),
  message: z.string(),
  data: z.object({
    issuer: z.enum(["BAPENDA", "OPD"]),
    issuerKey: z.string(),
    year: z.number().int(),
    nextSeq: z.number().int(),
    preview: z.string(),
  }),
});

export const SkrdTokenParamsSchema = z.object({
  token: z.string().trim().min(10).max(64).describe("Token verifikasi publik"),
});
export type SkrdTokenParams = z.infer<typeof SkrdTokenParamsSchema>;

// ─── Body ─────────────────────────────────────────────────────────────────────
const formatField = z
  .string()
  .trim()
  .min(5)
  .max(200)
  .refine(
    (v) => /\{seq6?\}/.test(v),
    "Format nomor wajib memuat {seq} atau {seq6} — tanpa itu nomor tidak unik",
  )
  .refine(
    (v) => {
      // Setiap token yang dipakai harus dikenal; mencegah `{seqq}` lolos diam-diam
      // dan menghasilkan nomor dengan kurung kurawal mentah.
      const used = v.match(/\{[a-zA-Z0-9]+\}/g) ?? [];
      return used.every((t) => (NUMBER_FORMAT_TOKENS as readonly string[]).includes(t));
    },
    `Token tidak dikenal. Yang tersedia: ${NUMBER_FORMAT_TOKENS.join(", ")}`,
  );

export const UpsertSkrdSettingBodySchema = z.object({
  /** Kode OPD; kosong = pengaturan DEFAULT (Bapenda). */
  organizationCode: z.string().trim().max(50).nullable().optional(),
  issuer: z.enum(["BAPENDA", "OPD"]),
  numberFormat: formatField.default("{seq6}/SKRD/{issuer}/{romanMonth}/{year}"),
  signerName: z.string().trim().min(3).max(150).describe("Nama penandatangan"),
  signerNip: z.string().trim().max(30).nullable().optional(),
  signerPosition: z.string().trim().max(150).nullable().optional(),
  bankName: z.string().trim().max(100).nullable().optional(),
  bankAccount: z.string().trim().max(50).nullable().optional(),
  bankHolder: z.string().trim().max(150).nullable().optional(),
  dueDays: z.number().int().min(1).max(365).default(7),
  isActive: z.boolean().default(true),
});
export type UpsertSkrdSettingBody = z.infer<typeof UpsertSkrdSettingBodySchema>;

/** Penerbitan ulang untuk pesanan yang belum punya SKRD. */
export const IssueSkrdBodySchema = z.object({
  documentType: z.enum(["SKRD", "DIPERSAMAKAN"]).default("SKRD"),
  /**
   * Tanggal terbit manual (ISO). Kosong = sekarang.
   * Berguna saat migrasi data lama yang SKRD-nya terbit di masa lalu.
   */
  issuedAt: z.string().datetime({ offset: true }).nullable().optional(),
});
export type IssueSkrdBody = z.infer<typeof IssueSkrdBodySchema>;

export const ListSkrdQuerySchema = z.object({
  status: z.enum(["TERBIT", "LUNAS", "CANCELLED"]).optional(),
  organization: z.string().trim().max(50).optional().describe("Kode OPD"),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
export type ListSkrdQuery = z.infer<typeof ListSkrdQuerySchema>;

// ─── Shapes ───────────────────────────────────────────────────────────────────
export const SkrdSettingShape = z.object({
  id: z.string().uuid(),
  organizationCode: z.string().nullable().describe("null = pengaturan default (Bapenda)"),
  organizationName: z.string().nullable(),
  issuer: z.enum(["BAPENDA", "OPD"]),
  numberFormat: z.string(),
  signerName: z.string(),
  signerNip: z.string().nullable(),
  signerPosition: z.string().nullable(),
  bankName: z.string().nullable(),
  bankAccount: z.string().nullable(),
  bankHolder: z.string().nullable(),
  dueDays: z.number().int(),
  isActive: z.boolean(),
});

export const SkrdSettingListResponseSchema = z.object({
  statusCode: z.number(),
  code: z.string(),
  message: z.string(),
  data: z.array(SkrdSettingShape),
});

export const SkrdShape = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  orderCode: z.string(),
  number: z.string(),
  documentType: z.enum(["SKRD", "DIPERSAMAKAN"]),
  issuer: z.enum(["BAPENDA", "OPD"]),
  issuerCode: z.string(),
  issuerName: z.string(),
  signerName: z.string(),
  signerNip: z.string().nullable(),
  signerPosition: z.string().nullable(),
  bankName: z.string().nullable(),
  bankAccount: z.string().nullable(),
  bankHolder: z.string().nullable(),
  amount: z.number().int(),
  issuedAt: z.string().datetime(),
  dueAt: z.string().datetime(),
  status: z.enum(["TERBIT", "LUNAS", "CANCELLED"]),
  createdAt: z.string().datetime(),
});

/** Respons verifikasi publik — TIDAK memuat PII pemohon. */
export const SkrdVerifyShape = z.object({
  number: z.string(),
  documentType: z.enum(["SKRD", "DIPERSAMAKAN"]),
  issuerCode: z.string(),
  issuerName: z.string(),
  amount: z.number().int(),
  issuedAt: z.string().datetime(),
  dueAt: z.string().datetime(),
  status: z.enum(["TERBIT", "LUNAS", "CANCELLED"]),
  orderCode: z.string(),
  /** Nama pemohon DIMASKING — verifikasi tidak butuh identitas lengkap. */
  applicantName: z.string(),
  valid: z.boolean(),
});

const envelope = { statusCode: z.number(), code: z.string(), message: z.string() } as const;

export const SkrdSettingResponseSchema = z.object({ ...envelope, data: SkrdSettingShape });
export const SkrdResponseSchema = z.object({ ...envelope, data: SkrdShape });
export const SkrdVerifyResponseSchema = z.object({ ...envelope, data: SkrdVerifyShape });
export const SkrdListResponseSchema = z.object({
  ...envelope,
  data: z.array(SkrdShape),
  meta: z.object({
    page: z.number(), limit: z.number(), totalItems: z.number(),
    totalPages: z.number(), hasNextPage: z.boolean(), hasPreviousPage: z.boolean(),
  }),
});

export type SkrdSettingDto = z.infer<typeof SkrdSettingShape>;
export type SkrdDto = z.infer<typeof SkrdShape>;
