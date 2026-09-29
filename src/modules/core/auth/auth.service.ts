import argon2 from "argon2";
import crypto from "node:crypto";
import { prisma } from "../../../config/database.js";
import {
  invalidatePermissionCache,
  invalidateAllUserPermissionCaches,
  blockAccessToken,
} from "../../../config/redis.js";
import { resolveUserPermissions } from "../../../common/guards/permission.guard.js";
import { env } from "../../../config/env.js";
import {
  UnauthorizedError,
  NotFoundError,
  ForbiddenError,
} from "../../../common/errors/index.js";
import type { JwtPayload } from "../../../common/types/index.js";
import type { FastifyInstance } from "fastify";

// ─── Token Helpers ────────────────────────────────────────────────────────────
function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

// ─── Access Control ───────────────────────────────────────────────────────────
/**
 * Memastikan user berhak masuk ke aplikasi yang diminta.
 *
 * Tanpa ini siapa pun yang punya akun di ekosistem bisa login ke aplikasi mana
 * pun hanya dengan mengganti header X-App-Code — misalnya pedagang lapak masuk
 * ke CMS internal. Satu-satunya penahan tersisa adalah requirePermission di
 * tiap route, sehingga route yang lupa memasang guard langsung terbuka.
 *
 * Super admin dikecualikan: mereka memang lintas-aplikasi.
 */
async function assertUserCanAccessApp(
  userId: string,
  isSuperAdmin: boolean,
  appCode: string,
): Promise<void> {
  if (isSuperAdmin) return;

  const application = await prisma.application.findUnique({
    where: { code: appCode },
    select: { id: true, isActive: true },
  });

  if (!application || !application.isActive) {
    throw new ForbiddenError(`Aplikasi "${appCode}" tidak aktif atau tidak terdaftar`);
  }

  const assignment = await prisma.userAppRole.findFirst({
    where: {
      userId,
      applicationId: application.id,
      role: { isActive: true },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { id: true },
  });

  if (!assignment) {
    throw new ForbiddenError(`Anda tidak memiliki akses ke aplikasi "${appCode}"`);
  }
}

// ─── Service Methods ──────────────────────────────────────────────────────────
export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    id: string;
    email: string;
    username: string;
    fullName: string;
    avatarUrl: string | null;
    isSuperAdmin: boolean;
  };
}

/**
 * Validates credentials and returns signed JWT pair.
 * Publishes audit log via RabbitMQ (fire-and-forget).
 */
export async function loginUser(
  fastify: FastifyInstance,
  identity: string,
  password: string,
  appCode: string,
  ipAddress?: string,
  userAgent?: string,
): Promise<LoginResult> {
  // Find user by email or username
  const user = await prisma.user.findFirst({
    where: {
      AND: [
        { deletedAt: null },
        { isActive: true },
        {
          OR: [
            { email: identity.toLowerCase() },
            { username: identity.toLowerCase() },
          ],
        },
      ],
    },
    select: {
      id: true,
      email: true,
      username: true,
      fullName: true,
      avatarUrl: true,
      passwordHash: true,
      isSuperAdmin: true,
      isActive: true,
    },
  });

  if (!user) {
    throw new UnauthorizedError("Invalid credentials");
  }

  // Verify password (argon2id)
  const passwordValid = await argon2.verify(user.passwordHash, password);
  if (!passwordValid) {
    throw new UnauthorizedError("Invalid credentials");
  }

  // Kredensial benar bukan berarti berhak masuk aplikasi ini.
  await assertUserCanAccessApp(user.id, user.isSuperAdmin, appCode);

  // Build JWT payload
  const accessPayload: JwtPayload = {
    sub: user.id,
    email: user.email,
    username: user.username,
    isSuperAdmin: user.isSuperAdmin,
    appCode,
    type: "access",
  };

  const refreshPayload: JwtPayload = {
    ...accessPayload,
    type: "refresh",
    // jti unik: tanpa ini dua refresh token dengan payload dan iat/exp sama
    // menghasilkan JWT identik, dan token_hash yang unique menolaknya (P2002).
    jti: crypto.randomUUID(),
  };

  const accessToken = fastify.jwt.sign(accessPayload, {
    expiresIn: env.JWT_ACCESS_EXPIRES,
  });

  const rawRefreshToken = fastify.jwt.sign(refreshPayload, {
    expiresIn: env.JWT_REFRESH_EXPIRES,
  });

  // Store hashed refresh token in DB — expiry must track JWT_REFRESH_EXPIRES,
  // otherwise the DB row and the token itself disagree.
  const refreshExpiresAt = new Date(
    Date.now() + parseExpiresIn(env.JWT_REFRESH_EXPIRES) * 1000,
  );
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(rawRefreshToken),
      appCode,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
      expiresAt: refreshExpiresAt,
    },
  });

  // Update last login timestamp (non-critical — don't await in fast path)
  void prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  // Parse expiresIn from string like "15m" → seconds
  const expiresIn = parseExpiresIn(env.JWT_ACCESS_EXPIRES);

  return {
    accessToken,
    refreshToken: rawRefreshToken,
    expiresIn,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      isSuperAdmin: user.isSuperAdmin,
    },
  };
}

/**
 * Rotates refresh token: validates the old one, revokes it, issues a new pair.
 * The caller must set the returned refreshToken as the new cookie.
 */
export async function refreshAccessToken(
  fastify: FastifyInstance,
  rawRefreshToken: string,
  appCode: string,
  ipAddress?: string,
  userAgent?: string,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  let payload: JwtPayload;

  try {
    payload = fastify.jwt.verify<JwtPayload>(rawRefreshToken);
  } catch {
    throw new UnauthorizedError("Invalid or expired refresh token");
  }

  if (payload.type !== "refresh") {
    throw new UnauthorizedError("Token type mismatch");
  }

  const tokenHash = hashToken(rawRefreshToken);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!stored) {
    // Token tidak ada di DB: token yang tidak pernah diterbitkan atau sudah dihapus.
    throw new UnauthorizedError("Refresh token not recognized");
  }

  if (stored.isRevoked) {
    // ── Token Reuse Detection ─────────────────────────────────────────────────
    // Token yang sudah di-revoke dicoba ulang — kemungkinan besar refresh token
    // dicuri. Cabut SEMUA sesi user sebagai tindakan preventif.
    fastify.log.warn(
      { userId: stored.userId, tokenHash },
      "[Auth] Revoked refresh token reuse detected — revoking all sessions",
    );
    await prisma.refreshToken.updateMany({
      where: { userId: stored.userId, isRevoked: false },
      data: { isRevoked: true },
    });
    throw new UnauthorizedError("Refresh token has been revoked. All sessions invalidated for security.");
  }

  if (stored.expiresAt < new Date()) {
    throw new UnauthorizedError("Refresh token has expired");
  }

  if (stored.appCode !== appCode) {
    throw new ForbiddenError("Token was issued for a different application");
  }

  // Revoke old token
  await prisma.refreshToken.update({
    where: { tokenHash },
    data: { isRevoked: true },
  });

  const user = await prisma.user.findUnique({
    where: { id: payload.sub, isActive: true, deletedAt: null },
    select: { id: true, email: true, username: true, isSuperAdmin: true },
  });

  if (!user) {
    throw new UnauthorizedError("User account is no longer active");
  }

  // Akses aplikasi bisa dicabut setelah token terbit — periksa ulang setiap
  // rotasi, bukan hanya saat login.
  await assertUserCanAccessApp(user.id, user.isSuperAdmin, appCode);

  const newAccessPayload: JwtPayload = {
    sub: user.id,
    email: user.email,
    username: user.username,
    isSuperAdmin: user.isSuperAdmin,
    appCode,
    type: "access",
  };

  const accessToken = fastify.jwt.sign(newAccessPayload, {
    expiresIn: env.JWT_ACCESS_EXPIRES,
  });

  // Issue a replacement refresh token — the old one was just revoked, so without
  // this the next /refresh call would always fail. jti wajib unik, lihat catatan
  // pada penerbitan saat login.
  const newRefreshToken = fastify.jwt.sign(
    {
      ...newAccessPayload,
      type: "refresh",
      jti: crypto.randomUUID(),
    } satisfies JwtPayload,
    { expiresIn: env.JWT_REFRESH_EXPIRES },
  );

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(newRefreshToken),
      appCode,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
      expiresAt: new Date(
        Date.now() + parseExpiresIn(env.JWT_REFRESH_EXPIRES) * 1000,
      ),
    },
  });

  return {
    accessToken,
    refreshToken: newRefreshToken,
    expiresIn: parseExpiresIn(env.JWT_ACCESS_EXPIRES),
  };
}

/**
 * Revokes the given refresh token and clears permission cache.
 * Jika rawAccessToken disertakan, token tersebut juga diblokir di Redis
 * sehingga tidak bisa dipakai lagi meski belum expire.
 */
export async function logoutUser(
  rawRefreshToken: string,
  userId: string,
  appCode: string,
  rawAccessToken?: string,
  accessTokenExp?: number, // Unix timestamp (seconds)
): Promise<void> {
  const tokenHash = hashToken(rawRefreshToken);

  await prisma.refreshToken.updateMany({
    where: { tokenHash, userId, isRevoked: false },
    data: { isRevoked: true },
  });

  // Block access token di Redis agar tidak bisa dipakai setelah logout.
  // TTL = sisa waktu hidup token; jika sudah expire tidak perlu disimpan.
  if (rawAccessToken && accessTokenExp) {
    const ttl = Math.floor(accessTokenExp - Date.now() / 1000);
    const atHash = hashToken(rawAccessToken);
    await blockAccessToken(atHash, ttl);
  }

  // Invalidate permission cache (helper builds the canonical key)
  await invalidatePermissionCache(userId, appCode);
}

/**
 * Mencabut SELURUH sesi aktif user di semua aplikasi.
 * Dipakai saat perangkat hilang atau ada dugaan akun disusupi.
 * Jika rawAccessToken disertakan (token dari request saat ini), token itu
 * juga langsung diblokir. Token dari sesi lain akan expire secara natural.
 * Mengembalikan jumlah sesi yang dicabut.
 */
export async function logoutAllSessions(
  userId: string,
  rawAccessToken?: string,
  accessTokenExp?: number, // Unix timestamp (seconds)
): Promise<number> {
  const { count } = await prisma.refreshToken.updateMany({
    where: { userId, isRevoked: false },
    data: { isRevoked: true },
  });

  // Block access token dari sesi saat ini agar langsung tidak bisa dipakai.
  // Sesi lain yang masih aktif akan expire secara natural (tidak bisa di-revoke
  // tanpa menyimpan semua access token aktif — trade-off yang disengaja).
  if (rawAccessToken && accessTokenExp) {
    const ttl = Math.floor(accessTokenExp - Date.now() / 1000);
    const atHash = hashToken(rawAccessToken);
    await blockAccessToken(atHash, ttl);
  }

  // Cache permission di semua aplikasi ikut dibuang.
  await invalidateAllUserPermissionCaches(userId);

  return count;
}

/**
 * Returns current user profile with active roles and permissions
 * for the given application context.
 */
export async function getMe(userId: string, appCode: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId, deletedAt: null },
    select: {
      id: true,
      nip: true,
      email: true,
      username: true,
      fullName: true,
      avatarUrl: true,
      phoneNumber: true,
      isSuperAdmin: true,
      emailVerifiedAt: true,
      lastLoginAt: true,
      // Role aktif pada aplikasi ini — sebuah user bisa punya lebih dari satu.
      userAppRoles: {
        where: {
          application: { code: appCode, isActive: true },
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: { role: { select: { name: true, isActive: true } } },
      },
    },
  });

  if (!user) throw new NotFoundError("User");

  const { userAppRoles, ...profile } = user;

  const roles = userAppRoles
    .filter((uar) => uar.role.isActive)
    .map((uar) => uar.role.name);

  // Super admins bypass permission checks entirely — nothing to resolve.
  // Otherwise reuse the guard's resolver so both paths can never drift apart.
  const permissions = profile.isSuperAdmin
    ? []
    : await resolveUserPermissions(userId, appCode);

  return {
    ...profile,
    emailVerifiedAt: profile.emailVerifiedAt?.toISOString() ?? null,
    lastLoginAt: profile.lastLoginAt?.toISOString() ?? null,
    roles,
    permissions,
  };
}

// ─── Utils ────────────────────────────────────────────────────────────────────
/**
 * Converts a JWT duration string ("15m", "7d") into seconds.
 * Falls back to 15 minutes on an unrecognized unit.
 */
export function parseExpiresIn(value: string): number {
  const unit = value.slice(-1);
  const amount = Number.parseInt(value.slice(0, -1), 10);
  if (Number.isNaN(amount)) return 900;
  if (unit === "s") return amount;
  if (unit === "m") return amount * 60;
  if (unit === "h") return amount * 3600;
  if (unit === "d") return amount * 86400;
  return 900; // Default 15 minutes
}
