import { z } from "zod";

// ─── Settings ─────────────────────────────────────────────────────────────────
/**
 * Konfigurasi tampilan per aplikasi — hanya dibaca front-end, tidak pernah
 * ditegakkan API. Disimpan sebagai JSONB supaya field baru tidak butuh migrasi,
 * tapi bentuknya tetap dikunci di sini: `.strict()` menolak key asing agar
 * salah ketik ("primaryColour") tidak tersimpan diam-diam lalu tak terbaca.
 *
 * Secret (SMTP, token WA) TIDAK PERNAH masuk sini — settings ikut keluar di
 * respons GET. Tempatnya tabel integrasi terenkripsi (Fase 2).
 */
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Warna harus hex 6 digit, mis. #0F766E");

export const ApplicationContactSchema = z
  .object({
    email: z.string().email("Format email kontak tidak valid").max(100).optional().nullable(),
    phone: z.string().max(30).optional().nullable(),
    whatsapp: z.string().max(30).optional().nullable(),
    address: z.string().max(255).optional().nullable(),
    googleMapsUrl: z.string().url("Format URL Google Maps tidak valid").max(500).optional().nullable(),
    workingHours: z.string().max(100).optional().nullable(),
    socialMedia: z
      .object({
        instagram: z.string().url().max(255).optional().nullable(),
        facebook: z.string().url().max(255).optional().nullable(),
        youtube: z.string().url().max(255).optional().nullable(),
        twitter: z.string().url().max(255).optional().nullable(),
        tiktok: z.string().url().max(255).optional().nullable(),
      })
      .strict()
      .optional()
      .nullable(),
  })
  .strict();

export const ApplicationSeoSchema = z
  .object({
    titleTemplate: z.string().max(100).optional().nullable(),
    metaTitle: z.string().max(100).optional().nullable(),
    metaDescription: z.string().max(300).optional().nullable(),
    description: z.string().max(300).optional().nullable(),
    ogImageUrl: z.string().url().max(255).optional().nullable(),
    keywords: z.array(z.string().max(50)).max(20).optional().nullable(),
    canonicalUrl: z.string().url().max(255).optional().nullable(),
  })
  .strict();

export const ApplicationFeaturesSchema = z
  .object({
    maintenanceMode: z.boolean().default(false),
    maintenanceMessage: z.string().max(300).optional().nullable(),
    enablePayment: z.boolean().default(false),
    enableRegistration: z.boolean().default(true),
    announcement: z
      .object({
        isActive: z.boolean().default(false),
        message: z.string().max(500).optional().nullable(),
        type: z.enum(["info", "warning", "danger"]).default("info"),
      })
      .strict()
      .optional()
      .nullable(),
  })
  .strict();

export const ApplicationLegalSchema = z
  .object({
    termsUrl: z.string().max(255).optional().nullable(),
    privacyPolicyUrl: z.string().max(255).optional().nullable(),
  })
  .strict();

export const ApplicationSettingsSchema = z
  .object({
    branding: z
      .object({
        shortName: z.string().max(30).optional().nullable(),
        primaryColor: hexColor.optional().nullable(),
        accentColor: hexColor.optional().nullable(),
        faviconUrl: z.string().url().max(255).optional().nullable(),
      })
      .strict()
      .optional()
      .nullable(),
    contact: ApplicationContactSchema.optional().nullable(),
    seo: ApplicationSeoSchema.optional().nullable(),
    features: ApplicationFeaturesSchema.optional().nullable(),
    legal: ApplicationLegalSchema.optional().nullable(),
  })
  .strict();

export type ApplicationSettings = z.infer<typeof ApplicationSettingsSchema>;

const audienceField = z
  .enum(["INTERNAL", "PUBLIC"])
  .describe("INTERNAL = pegawai lewat seloko; PUBLIC = warga daftar sendiri");

// ─── Shared Shapes ────────────────────────────────────────────────────────────
export const ApplicationShape = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  tagline: z.string().nullable(),
  description: z.string().nullable(),
  baseUrl: z.string().nullable(),
  icon: z.string().nullable(),
  audience: audienceField,
  logoUrl: z.string().nullable(),
  logoFileId: z.string().nullable(),
  logoDarkUrl: z.string().nullable(),
  logoDarkFileId: z.string().nullable(),
  faviconUrl: z.string().nullable(),
  faviconFileId: z.string().nullable(),
  ogImageUrl: z.string().nullable(),
  ogImageFileId: z.string().nullable(),
  settings: ApplicationSettingsSchema,
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
      audience: audienceField,
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
  audience: audienceField.optional(),
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

// ─── Milik Sendiri ────────────────────────────────────────────────────────────
/**
 * Bentuk entri launcher: metadata navigasi saja.
 *
 * Tanpa `counts` (pemanggil belum tentu berhak melihat isi internal aplikasi),
 * tanpa `isActive` (yang non-aktif tidak pernah muncul di sini), dan tanpa
 * timestamp — launcher tidak punya gunanya untuk ketiganya.
 */
const MyApplicationShape = ApplicationShape.pick({
  id: true,
  code: true,
  name: true,
  tagline: true,
  description: true,
  baseUrl: true,
  icon: true,
  logoUrl: true,
  logoDarkUrl: true,
  faviconUrl: true,
}).extend({
  /** Role yang dipegang di aplikasi ini. Kosong untuk super admin (bypass). */
  roles: z.array(z.string()),
  /** Kapan akses hilang; null berarti permanen. */
  expiresAt: z.string().datetime().nullable(),
});

export const ListMyApplicationsResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.array(MyApplicationShape),
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

// ─── Public Config ────────────────────────────────────────────────────────────
export const PublicAppConfigParamsSchema = z.object({
  code: z.string().min(2).max(50),
});

export const ApplicationPublicConfigShape = ApplicationShape.pick({
  code: true,
  name: true,
  tagline: true,
  description: true,
  baseUrl: true,
  icon: true,
  audience: true,
  logoUrl: true,
  logoDarkUrl: true,
  faviconUrl: true,
  ogImageUrl: true,
  settings: true,
});

export const GetPublicAppConfigResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: ApplicationPublicConfigShape,
});

// ─── Create ───────────────────────────────────────────────────────────────────
export const CreateApplicationBodySchema = z.object({
  code: codeField,
  name: nameField,
  /** Wajib dan final — lihat catatan UpdateApplicationBodySchema. */
  audience: audienceField,
  tagline: z.string().max(150).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  baseUrl: baseUrlField.optional().nullable(),
  icon: iconField.optional().nullable(),
  logoUrl: z.string().url("Format URL logo tidak valid").max(255).optional().nullable(),
  logoFileId: z.string().max(100).optional().nullable(),
  logoDarkUrl: z.string().url("Format URL logo tema gelap tidak valid").max(255).optional().nullable(),
  logoDarkFileId: z.string().max(100).optional().nullable(),
  faviconUrl: z.string().url("Format URL favicon tidak valid").max(255).optional().nullable(),
  faviconFileId: z.string().max(100).optional().nullable(),
  ogImageUrl: z.string().url("Format URL Open Graph image tidak valid").max(255).optional().nullable(),
  ogImageFileId: z.string().max(100).optional().nullable(),
  settings: ApplicationSettingsSchema.default({}),
  isActive: z.boolean().default(true),
});

export const CreateApplicationResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: ApplicationShape,
});

// ─── Update ───────────────────────────────────────────────────────────────────
export const UpdateApplicationBodySchema = z
  .object({
    name: nameField.optional(),
    tagline: z.string().max(150).nullable().optional(),
    description: z.string().max(500).nullable().optional(),
    baseUrl: baseUrlField.nullable().optional(),
    icon: iconField.nullable().optional(),
    logoUrl: z.string().url("Format URL logo tidak valid").max(255).nullable().optional(),
    logoFileId: z.string().max(100).nullable().optional(),
    logoDarkUrl: z.string().url("Format URL logo tema gelap tidak valid").max(255).nullable().optional(),
    logoDarkFileId: z.string().max(100).nullable().optional(),
    faviconUrl: z.string().url("Format URL favicon tidak valid").max(255).nullable().optional(),
    faviconFileId: z.string().max(100).nullable().optional(),
    ogImageUrl: z.string().url("Format URL Open Graph image tidak valid").max(255).nullable().optional(),
    ogImageFileId: z.string().max(100).nullable().optional(),
    settings: ApplicationSettingsSchema.optional(),
    isActive: z.boolean().optional(),
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
export type PublicAppConfigParams = z.infer<typeof PublicAppConfigParamsSchema>;
export type CreateApplicationBody = z.infer<typeof CreateApplicationBodySchema>;
export type UpdateApplicationBody = z.infer<typeof UpdateApplicationBodySchema>;
export type SetApplicationActiveBody = z.infer<typeof SetApplicationActiveBodySchema>;
