import { z } from "zod";

// ─── Shared Shapes ────────────────────────────────────────────────────────────
const ApplicationShape = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  baseUrl: z.string().nullable(),
  icon: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

/** Jumlah entitas yang bergantung pada aplikasi — dipakai CMS sebelum menghapus. */
const ApplicationCountsShape = z.object({
  permissions: z.number(),
  roles: z.number(),
  menuItems: z.number(),
  userAppRoles: z.number(),
});

const ApplicationListItemShape = ApplicationShape.extend({
  counts: ApplicationCountsShape,
});

const ApplicationDetailShape = ApplicationShape.extend({
  counts: ApplicationCountsShape,
  roles: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().nullable(),
      isSystemRole: z.boolean(),
      isActive: z.boolean(),
      permissionCount: z.number(),
    }),
  ),
  /** Permission dikelompokkan per `module` — persis urutan tampil di CMS. */
  permissionsByModule: z.array(
    z.object({
      module: z.string(),
      permissions: z.array(
        z.object({ id: z.string(), code: z.string(), name: z.string() }),
      ),
    }),
  ),
});

// ─── Field Rules ──────────────────────────────────────────────────────────────
/**
 * Pola kode aplikasi disamakan dengan APP_CODE_PATTERN di appCode.middleware:
 * kode yang lolos di sini tapi ditolak middleware akan membuat aplikasi yang
 * mustahil dipakai.
 */
const codeField = z
  .string()
  .min(2, "Kode aplikasi minimal 2 karakter")
  .max(50)
  .regex(
    /^[a-z0-9_-]+$/,
    "Kode hanya boleh huruf kecil, angka, underscore, atau tanda hubung",
  )
  .describe("Kode unik untuk header X-App-Code, mis. 'lapak-jambi-web'");

const nameField = z.string().min(2, "Nama aplikasi minimal 2 karakter").max(100);

const baseUrlField = z
  .string()
  .url("Format URL tidak valid")
  .max(255)
  .describe("Alamat pangkal aplikasi — menu dengan path relatif digabung ke sini");

const iconField = z
  .string()
  .max(50)
  .describe("Nama ikon di launcher super app");

// ─── List ─────────────────────────────────────────────────────────────────────
export const ListApplicationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional().describe("Cari berdasarkan kode atau nama"),
  isActive: z.enum(["true", "false"]).optional().describe("Filter status aktif"),
});

export const ListApplicationsResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.array(ApplicationListItemShape),
  meta: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
    hasNextPage: z.boolean(),
    hasPreviousPage: z.boolean(),
  }),
});

// ─── Get ──────────────────────────────────────────────────────────────────────
export const ApplicationParamsSchema = z.object({
  id: z.string().uuid("Application ID harus berformat UUID"),
});

export const GetApplicationResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: ApplicationDetailShape,
});

// ─── Create ───────────────────────────────────────────────────────────────────
export const CreateApplicationBodySchema = z.object({
  code: codeField,
  name: nameField,
  description: z.string().max(500).optional(),
  baseUrl: baseUrlField.optional(),
  icon: iconField.optional(),
  isActive: z.boolean().default(true),
});

export const CreateApplicationResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: ApplicationShape,
});

// ─── Update ───────────────────────────────────────────────────────────────────
/**
 * `code` TIDAK bisa diubah: nilainya tertanam di header X-App-Code milik setiap
 * klien yang sudah terpasang, di refresh_tokens.app_code, dan di audit_logs
 * yang bersifat tak-termutasi. Ganti kode = putus seluruh sesi aktif dan
 * memutus jejak audit dari aplikasinya.
 */
export const UpdateApplicationBodySchema = z
  .object({
    name: nameField.optional(),
    description: z.string().max(500).nullable().optional(),
    baseUrl: baseUrlField.nullable().optional(),
    icon: iconField.nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Setidaknya satu field harus diisi untuk update",
  });

export const UpdateApplicationResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: ApplicationShape,
});

// ─── Toggle Active ────────────────────────────────────────────────────────────
export const SetApplicationActiveBodySchema = z.object({
  isActive: z.boolean(),
});

export const SetApplicationActiveResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.object({ isActive: z.boolean() }),
});

// ─── Delete ───────────────────────────────────────────────────────────────────
export const DeleteApplicationResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.null(),
});

// ─── Inferred Types ───────────────────────────────────────────────────────────
export type ListApplicationsQuery = z.infer<typeof ListApplicationsQuerySchema>;
export type ApplicationParams = z.infer<typeof ApplicationParamsSchema>;
export type CreateApplicationBody = z.infer<typeof CreateApplicationBodySchema>;
export type UpdateApplicationBody = z.infer<typeof UpdateApplicationBodySchema>;
export type SetApplicationActiveBody = z.infer<typeof SetApplicationActiveBodySchema>;
