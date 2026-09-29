import fp from "fastify-plugin";
import crypto from "node:crypto";
import type { FastifyInstance, FastifyPluginOptions, FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import { getCachedPermissions, isAccessTokenBlocked } from "../../config/redis.js";
import { prisma } from "../../config/database.js";
import { setCachedPermissions } from "../../config/redis.js";
import { ForbiddenError, UnauthorizedError } from "../errors/index.js";
import type { JwtPayload } from "../types/index.js";


// ─── Module Augmentation: Add requirePermission to Fastify ────────────────────
declare module "fastify" {
  interface FastifyInstance {
    /**
     * Generates a preHandler hook that enforces a granular permission.
     *
     * Usage in route definition:
     * ```ts
     * preHandler: [fastify.authenticate, fastify.requirePermission("article:publish")]
     * ```
     *
     * @param permissionCode - Kode permission penuh, mis. "article:publish"
     */
    requirePermission(permissionCode: string): preHandlerHookHandler;

    /**
     * PreHandler hook that validates JWT and populates request.user.
     * Must run before requirePermission.
     */
    authenticate: preHandlerHookHandler;
  }
}

// ─── Permission Resolver ──────────────────────────────────────────────────────
/**
 * Resolves the effective permission set for a user in a given app context.
 * 
 * Resolution order:
 * 1. Check Redis cache (fast path)
 * 2. Query DB: fetch all roles for user in this app → collect permissions
 * 3. Populate cache for next request
 *
 * Returns an array of atomic permission strings: "module:action" (kolom code)
 */
export async function resolveUserPermissions(
  userId: string,
  appCode: string,
): Promise<string[]> {
  // 1. Cache hit
  const cached = await getCachedPermissions(userId, appCode);
  if (cached !== null) return cached;

  // 2. DB query — fetch roles assigned to this user for this app, including
  //    their permissions.
  const userAppRoles = await prisma.userAppRole.findMany({
    where: {
      userId,
      application: { code: appCode, isActive: true },
      // Exclude expired role assignments
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: {
      role: {
        select: {
          isActive: true,
          rolePermissions: {
            select: {
              permission: { select: { code: true } },
            },
          },
        },
      },
    },
  });

  // 3. Flatten & deduplicate. Seorang user bisa punya beberapa role di satu
  //    aplikasi — hak akses digabung (union), bukan saling menimpa.
  const permissionSet = new Set<string>();

  for (const uar of userAppRoles) {
    if (!uar.role.isActive) continue;

    for (const rp of uar.role.rolePermissions) {
      permissionSet.add(rp.permission.code);
    }
  }

  const permissions = Array.from(permissionSet);

  // 4. Populate cache
  await setCachedPermissions(userId, appCode, permissions);

  return permissions;
}

// ─── Plugin ───────────────────────────────────────────────────────────────────
async function permissionGuardPlugin(
  fastify: FastifyInstance,
  _options: FastifyPluginOptions,
): Promise<void> {
  // ── authenticate decorator ────────────────────────────────────────────────
  fastify.decorate(
    "authenticate",
    async function authenticateHandler(
      request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<void> {
      try {
        // @fastify/jwt populates request.user via verifyJWT
        await request.jwtVerify<JwtPayload>();

        const payload = request.user;

        // Ensure the token was issued for the same app context
        if (payload.appCode !== request.appCode) {
          throw new ForbiddenError(
            `Token was issued for app "${payload.appCode}" but request targets "${request.appCode}"`,
          );
        }

        // ── Blocklist check ──────────────────────────────────────────────────
        // JWT stateless: hanya cek signature. Revokasi (logout) tidak bisa
        // ditanamkan ke dalam token — satu-satunya cara adalah menyimpan hash
        // token di Redis dan menolaknya di sini.
        const authHeader = request.headers.authorization;
        if (authHeader?.startsWith("Bearer ")) {
          const rawToken = authHeader.slice(7); // Strip "Bearer "
          const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

          if (await isAccessTokenBlocked(tokenHash)) {
            throw new UnauthorizedError("Token has been revoked");
          }
        }
      } catch (err) {
        if (err instanceof ForbiddenError) throw err;
        if (err instanceof UnauthorizedError) throw err;
        throw new UnauthorizedError("Invalid or expired access token");
      }
    },
  );


  // ── requirePermission decorator ───────────────────────────────────────────
  fastify.decorate(
    "requirePermission",
    function requirePermission(permissionCode: string): preHandlerHookHandler {
      return async function checkPermission(
        request: FastifyRequest,
        _reply: FastifyReply,
      ): Promise<void> {
        const user = request.user;

        if (!user) {
          throw new UnauthorizedError();
        }

        // Super admins bypass ALL permission checks
        if (user.isSuperAdmin) return;

        const appCode = request.appCode;
        const userId = user.sub;

        const permissions = await resolveUserPermissions(userId, appCode);

        if (!permissions.includes(permissionCode)) {
          throw new ForbiddenError(
            `Permission denied: "${permissionCode}" is required`,
          );
        }
      };
    },
  );
}

export const permissionGuard = fp(permissionGuardPlugin, {
  name: "permission-guard",
  dependencies: ["@fastify/jwt"],
});
