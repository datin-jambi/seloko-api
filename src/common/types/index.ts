import "@fastify/jwt";

// ─── JWT Payload ──────────────────────────────────────────────────────────────
export interface JwtPayload {
  sub: string;          // userId
  email: string;
  /** null untuk akun PUBLIC — warga login dengan email saja. */
  username: string | null;
  /**
   * INTERNAL (pegawai) atau PUBLIC (warga). Disimpan di token karena guard
   * memakainya di setiap request untuk memutuskan boleh tidaknya akses
   * lintas aplikasi — query DB tiap request hanya untuk ini terlalu mahal.
   * Nilainya tidak pernah berubah untuk satu akun, jadi tidak bisa basi.
   */
  accountType: "INTERNAL" | "PUBLIC";
  isSuperAdmin: boolean;
  appCode: string;
  type: "access" | "refresh";
  /**
   * Token id — wajib untuk refresh token. Tanpa ini payload dua token refresh
   * berturut-turut identik, dan bila terbit dalam detik yang sama `iat`/`exp`
   * pun sama, sehingga JWT yang dihasilkan byte-identik. token_hash di DB
   * unique, jadi rotasi gagal dengan P2002.
   */
  jti?: string;
  iat?: number;
  exp?: number;
}

// ─── Augmented Request ────────────────────────────────────────────────────────
// Extend FastifyRequest with our custom context fields.
// These are populated by hooks/middlewares before reaching route handlers.
declare module "fastify" {
  interface FastifyRequest {
    /** The validated X-App-Code header value */
    appCode: string;
  }

  // Route-level OpenAPI metadata used across *.routes.ts. Normally contributed
  // by @fastify/swagger — declared here so routes typecheck without it.
  interface FastifySchema {
    description?: string;
    summary?: string;
    tags?: string[];
  }
}

// `request.user` is owned by @fastify/jwt — narrow it there, not on FastifyRequest,
// otherwise the two declarations conflict (TS2717).
declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

// ─── Pagination ───────────────────────────────────────────────────────────────
export interface PaginationQuery {
  page: number;
  limit: number;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export function buildPaginatedResult<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResult<T> {
  const totalPages = Math.ceil(total / limit);
  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

// ─── Generic API Response ─────────────────────────────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  meta?: Record<string, unknown>;
}

export function ok<T>(data: T, message = "Success"): ApiResponse<T> {
  return { success: true, message, data };
}

export function accepted(message = "Request accepted"): ApiResponse<null> {
  return { success: true, message, data: null };
}
