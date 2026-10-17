import { z } from "zod";

// ─── Login ────────────────────────────────────────────────────────────────────
export const LoginBodySchema = z.object({
  identity: z
    .string()
    .min(1, "Email or username is required")
    .describe("Email address or username"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters"),
});

export const LoginResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.object({
    accessToken: z.string(),
    expiresIn: z.number().describe("Access token TTL in seconds"),
    user: z.object({
      id: z.string(),
      email: z.string().email(),
      username: z.string().nullable(),
      fullName: z.string(),
      avatarUrl: z.string().nullable(),
      avatarFileId: z.string().nullable().optional(),
      accountType: z.enum(["INTERNAL", "PUBLIC"]),
      isSuperAdmin: z.boolean(),
    }),
  }),
});

// ─── Register (akun warga) ────────────────────────────────────────────────────
/**
 * Pendaftaran mandiri akun PUBLIC.
 *
 * Hanya bisa dipanggil pada aplikasi ber-audience PUBLIC — akun pegawai dibuat
 * operator lewat `/api/users`, tidak pernah lewat endpoint terbuka ini.
 * `roleName` sengaja TIDAK bisa dikirim: role yang diberikan ditetapkan server
 * (default `warga` pada aplikasi itu), supaya pendaftar tidak bisa memilih
 * `admin-opd` untuk dirinya sendiri.
 */
export const RegisterBodySchema = z
  .object({
    email: z.string().email("Format email tidak valid").max(100),
    password: z
      .string()
      .min(8, "Password minimal 8 karakter")
      .max(100)
      .regex(/[A-Z]/, "Password harus mengandung minimal 1 huruf besar")
      .regex(/[0-9]/, "Password harus mengandung minimal 1 angka"),
    fullName: z.string().trim().min(2, "Nama lengkap minimal 2 karakter").max(150),
    phoneNumber: z.string().trim().max(20).optional(),
    nik: z
      .string()
      .trim()
      .regex(/^\d{16}$/, "NIK harus 16 digit angka")
      .optional()
      .describe("NIK opsional; bila diisi harus 16 digit dan belum terdaftar"),
    passwordConfirm: z.string().min(8, "Konfirmasi password minimal 8 karakter"),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: "Konfirmasi password tidak sama",
    path: ["passwordConfirm"],
  });

export const RegisterResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.object({
    id: z.string(),
    email: z.string().email(),
    fullName: z.string(),
    accountType: z.enum(["INTERNAL", "PUBLIC"]),
    emailVerifiedAt: z.string().datetime().nullable(),
    /** Role yang otomatis diberikan server pada aplikasi ini. */
    roleName: z.string(),
  }),
});

// ─── Refresh Token ────────────────────────────────────────────────────────────
export const RefreshResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.object({
    accessToken: z.string(),
    expiresIn: z.number(),
  }),
});

// ─── Logout ───────────────────────────────────────────────────────────────────
export const LogoutResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.null(),
});

// ─── Logout Semua Sesi ────────────────────────────────────────────────────────
export const LogoutAllResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.object({
    revokedSessions: z.number().describe("Jumlah sesi yang dicabut"),
  }),
});

// ─── Me ───────────────────────────────────────────────────────────────────────
export const MeResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.object({
    id: z.string(),
    nip: z.string().nullable(),
    email: z.string().email(),
    username: z.string().nullable(),
    fullName: z.string(),
    avatarUrl: z.string().nullable(),
    avatarFileId: z.string().nullable().optional(),
    phoneNumber: z.string().nullable(),
    accountType: z.enum(["INTERNAL", "PUBLIC"]),
    isSuperAdmin: z.boolean(),
    emailVerifiedAt: z.string().datetime().nullable(),
    lastLoginAt: z.string().datetime().nullable(),
    roles: z.array(z.string()).describe("Nama role aktif pada aplikasi ini"),
    permissions: z.array(z.string()).describe("Kode permission aktif: module:action"),
  }),
});

// ─── Inferred Types ───────────────────────────────────────────────────────────
export type RegisterBody = z.infer<typeof RegisterBodySchema>;
export type LoginBody = z.infer<typeof LoginBodySchema>;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
export type MeResponse = z.infer<typeof MeResponseSchema>;
