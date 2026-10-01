import { env } from "~/config/env.js";

// ─── App Codes ────────────────────────────────────────────────────────────────
// Harus sama persis dengan kolom applications.code di database.
export const APP_CODES = {
  SELOKO: "seloko",
  BAPENDA_PROFILE: "bapenda-profile",
  LAPAK_JAMBI_WEB: "lapak-jambi-web",
  LAPAK_JAMBI_APP: "lapak-jambi-app",
} as const;

export type AppCode = (typeof APP_CODES)[keyof typeof APP_CODES];

// ─── Cookie Names ─────────────────────────────────────────────────────────────
export const COOKIE_NAMES = {
  REFRESH_TOKEN: "seloko_rt",
} as const;

// ─── Request Headers ──────────────────────────────────────────────────────────
export const HEADERS = {
  APP_CODE: "x-app-code",
  REQUEST_ID: "x-request-id",
} as const;

// ─── Cache TTLs (seconds) ─────────────────────────────────────────────────────
export const CACHE_TTL = {
  PERMISSIONS: 300,        // 5 minutes
  SESSION: 3600,           // 1 hour
  RESPONSE_SHORT: 60,      // 1 minute
  RESPONSE_LONG: 3600,     // 1 hour
} as const;

// ─── Pagination Defaults ──────────────────────────────────────────────────────
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
} as const;

// ─── Rate Limit ───────────────────────────────────────────────────────────────
// Dibedakan per environment: di development batas dibuat sangat longgar supaya
// iterasi di Postman/curl tidak memblokir diri sendiri, tapi TIDAK dimatikan —
// jalur kodenya tetap ikut teruji. Produksi memakai batas ketat + ban.
//
// LOGIN dev dinaikkan ke 200: satu smoke test end-to-end melakukan belasan
// login (tiap skenario butuh token pada appCode berbeda), dan dengan batas 50
// dua run beruntun dalam satu menit sudah saling memblokir — kegagalan yang
// menyesatkan karena tampak seperti bug autentikasi.
const isDev = env.NODE_ENV !== "production";

export const RATE_LIMIT = {
  GLOBAL: { max: isDev ? 1000 : 100, timeWindow: "1 minute" },
  // ban: 1 berarti sekali melewati batas langsung diblokir penuh — terlalu
  // galak untuk development, jadi hanya dipasang di produksi.
  LOGIN: isDev
    ? { max: 200, timeWindow: "1 minute" }
    : { max: 5, timeWindow: "15 minutes", ban: 1 },
} as const;

// ─── Permission Actions ───────────────────────────────────────────────────────
export const ACTIONS = {
  CREATE: "create",
  READ: "read",
  UPDATE: "update",
  DELETE: "delete",
  LIST: "list",
  PUBLISH: "publish",
  APPROVE: "approve",
  REJECT: "reject",
  EXPORT: "export",
  IMPORT: "import",
} as const;

export type Action = (typeof ACTIONS)[keyof typeof ACTIONS];
