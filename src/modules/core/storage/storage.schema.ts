import { z } from "zod";

// ─── Query Params ─────────────────────────────────────────────────────────────
export const UploadMediaQuerySchema = z.object({
  module: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9_-]+$/i, { message: "Module hanya boleh berupa huruf, angka, strip, atau underscore" })
    .optional()
    .describe("Nama modul tujuan penyimpanan (mis. articles, banners, galleries, regulations)"),
  subFolder: z
    .string()
    .max(50)
    .regex(/^[a-z0-9_-]+$/i, { message: "subFolder hanya boleh berupa huruf, angka, strip, atau underscore" })
    .optional()
    .describe("Subfolder opsional di dalam modul (mis. thumbnails, attachments)"),
  subModule: z
    .string()
    .max(50)
    .regex(/^[a-z0-9_-]+$/i, { message: "subModule hanya boleh berupa huruf, angka, strip, atau underscore" })
    .optional()
    .describe("Alias untuk subFolder"),
  appCode: z
    .string()
    .max(50)
    .regex(/^[a-z0-9_-]+$/i)
    .optional()
    .describe("Target aplikasi tujuan (opsional override jika admin Seloko mengunggah media untuk aplikasi lain)"),
  fileName: z
    .string()
    .max(150)
    .optional()
    .describe("Nama file kustom yang diinginkan"),
  useUniqueFileName: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true"))
    .describe("Apakah ImageKit menambahkan suffix acak di nama file (default true)"),
});

export type UploadMediaQuery = z.infer<typeof UploadMediaQuerySchema>;

// ─── Response Item Schema ─────────────────────────────────────────────────────
export const StorageFileItemSchema = z.object({
  fileId: z.string(),
  url: z.string(),
  name: z.string(),
  size: z.number(),
  filePath: z.string(),
  thumbnailUrl: z.string().nullable().optional(),
}).passthrough();

export type StorageFileItem = z.infer<typeof StorageFileItemSchema>;

// ─── Response Schema ──────────────────────────────────────────────────────────
export const UploadMediaResponseSchema = z.object({
  statusCode: z.number().default(201),
  code: z.string().default("SUCCESS"),
  message: z.string(),
  data: z.union([StorageFileItemSchema, z.array(StorageFileItemSchema)]),
}).passthrough();

export type UploadMediaResponse = z.infer<typeof UploadMediaResponseSchema>;

// ─── Delete Media Params & Response ───────────────────────────────────────────
export const DeleteMediaParamsSchema = z.object({
  fileId: z.string().min(1, { message: "fileId wajib diisi" }),
});

export type DeleteMediaParams = z.infer<typeof DeleteMediaParamsSchema>;

export const DeleteMediaResponseSchema = z.object({
  statusCode: z.number().default(200),
  code: z.string().default("SUCCESS"),
  message: z.string(),
  data: z.object({
    deleted: z.boolean(),
  }),
});

export type DeleteMediaResponse = z.infer<typeof DeleteMediaResponseSchema>;
