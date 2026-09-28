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
      username: z.string(),
      fullName: z.string(),
      avatarUrl: z.string().nullable(),
      isSuperAdmin: z.boolean(),
    }),
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

// ─── Me ───────────────────────────────────────────────────────────────────────
export const MeResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.object({
    id: z.string(),
    nip: z.string().nullable(),
    email: z.string().email(),
    username: z.string(),
    fullName: z.string(),
    avatarUrl: z.string().nullable(),
    phoneNumber: z.string().nullable(),
    isSuperAdmin: z.boolean(),
    emailVerifiedAt: z.string().datetime().nullable(),
    lastLoginAt: z.string().datetime().nullable(),
    roles: z.array(z.string()).describe("Nama role aktif pada aplikasi ini"),
    permissions: z.array(z.string()).describe("Kode permission aktif: module:action"),
  }),
});

// ─── Inferred Types ───────────────────────────────────────────────────────────
export type LoginBody = z.infer<typeof LoginBodySchema>;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
export type MeResponse = z.infer<typeof MeResponseSchema>;
