import type { FastifyRequest, FastifyReply } from "fastify";
import type { LoginBody } from "./auth.schema.js";
import { loginUser, refreshAccessToken, logoutUser, logoutAllSessions, getMe, parseExpiresIn } from "./auth.service.js";
import { ok, accepted } from "../../../common/types/index.js";
import { COOKIE_NAMES } from "../../../common/constants/index.js";
import { UnauthorizedError } from "../../../common/errors/index.js";
import { env } from "../../../config/env.js";
import { publishAuditUserLogin, publishAuditUserLogout, publishAuditEvent } from "../../../workers/producers/audit.producer.js";
import { ROUTING_KEYS } from "../../../workers/queue-names/index.js";

// ─── Refresh Cookie ───────────────────────────────────────────────────────────
// Path harus mencakup /logout juga, bukan hanya /refresh: cookie dengan
// Path=/api/auth/refresh tidak pernah dikirim ke /api/auth/logout, sehingga
// handleLogout tidak menemukan token, melewati revokasi, dan tetap membalas 200
// padahal refresh token masih hidup.
const REFRESH_COOKIE_PATH = "/api/auth";

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: REFRESH_COOKIE_PATH,
    maxAge: parseExpiresIn(env.JWT_REFRESH_EXPIRES),
  };
}

// ─── Login ────────────────────────────────────────────────────────────────────
export async function handleLogin(
  request: FastifyRequest<{ Body: LoginBody }>,
  reply: FastifyReply,
): Promise<void> {
  const { identity, password } = request.body;
  const appCode = request.appCode;

  const result = await loginUser(
    request.server,
    identity,
    password,
    appCode,
    request.ip,
    request.headers["user-agent"],
  );

  // Set refresh token as HttpOnly cookie
  reply.setCookie(COOKIE_NAMES.REFRESH_TOKEN, result.refreshToken, refreshCookieOptions());

  // Publish audit event (non-blocking)
  void publishAuditUserLogin({
    userId: result.user.id,
    appCode,
    ipAddress: request.ip,
    userAgent: request.headers["user-agent"],
  });

  void reply.status(200).send(
    ok(
      {
        accessToken: result.accessToken,
        expiresIn: result.expiresIn,
        user: result.user,
      },
      "Login successful",
    ),
  );
}

// ─── Refresh ──────────────────────────────────────────────────────────────────
export async function handleRefresh(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const rawRefreshToken = request.cookies[COOKIE_NAMES.REFRESH_TOKEN];

  if (!rawRefreshToken) {
    throw new UnauthorizedError("No refresh token provided");
  }

  const result = await refreshAccessToken(
    request.server,
    rawRefreshToken,
    request.appCode,
    request.ip,
    request.headers["user-agent"],
  );

  // Rotation: the old token was revoked, so replace the cookie too.
  reply.setCookie(COOKIE_NAMES.REFRESH_TOKEN, result.refreshToken, refreshCookieOptions());

  void reply.status(200).send(
    ok({ accessToken: result.accessToken, expiresIn: result.expiresIn }, "Token refreshed"),
  );
}

// ─── Logout ───────────────────────────────────────────────────────────────────
export async function handleLogout(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const rawRefreshToken = request.cookies[COOKIE_NAMES.REFRESH_TOKEN];
  const user = request.user;

  // Ekstrak raw access token dari Authorization header untuk di-block di Redis.
  // request.user sudah terisi oleh fastify.authenticate (jwtVerify), sehingga
  // exp tersedia di payload dan digunakan sebagai TTL blocklist.
  const authHeader = request.headers.authorization;
  const rawAccessToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : undefined;

  if (rawRefreshToken) {
    await logoutUser(
      rawRefreshToken,
      user.sub,
      request.appCode,
      rawAccessToken,
      user.exp, // Unix timestamp expire dari JWT payload
    );

    void publishAuditUserLogout({
      userId: user.sub,
      appCode: request.appCode,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"],
    });
  }

  reply.clearCookie(COOKIE_NAMES.REFRESH_TOKEN, { path: REFRESH_COOKIE_PATH });
  void reply.status(200).send(accepted("Logged out successfully"));
}

// ─── Logout Semua Sesi ────────────────────────────────────────────────────────
export async function handleLogoutAll(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const user = request.user;

  // Ekstrak raw access token dari Authorization header untuk di-block di Redis.
  const authHeader = request.headers.authorization;
  const rawAccessToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : undefined;

  const revokedSessions = await logoutAllSessions(
    user.sub,
    rawAccessToken,
    user.exp, // Unix timestamp expire dari JWT payload
  );

  void publishAuditEvent(ROUTING_KEYS.AUDIT_USER_LOGOUT, {
    action: "user.logout_all",
    userId: user.sub,
    appCode: request.appCode,
    ipAddress: request.ip,
    userAgent: request.headers["user-agent"],
    metadata: { revokedSessions },
  });

  reply.clearCookie(COOKIE_NAMES.REFRESH_TOKEN, { path: REFRESH_COOKIE_PATH });
  void reply.status(200).send(
    ok({ revokedSessions }, `${revokedSessions} sesi berhasil dicabut`),
  );
}

// ─── Me ───────────────────────────────────────────────────────────────────────
export async function handleMe(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const profile = await getMe(request.user.sub, request.appCode);
  void reply.status(200).send(ok(profile));
}
