import { Redis } from "ioredis";
import { env } from "./env.js";

// ─── Singleton Instance ───────────────────────────────────────────────────────
let redisClient: Redis | null = null;

/**
 * Returns the shared Redis singleton client.
 * Creates and connects the client on first call.
 * Subsequent calls return the already-connected instance.
 */
export function getRedisClient(): Redis {
  if (redisClient) return redisClient;

  redisClient = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
    db: env.REDIS_DB,
    keyPrefix: env.REDIS_KEY_PREFIX,
    tls: env.REDIS_TLS ? {} : undefined,
    lazyConnect: false,
    enableReadyCheck: true,
    maxRetriesPerRequest: 3,
    retryStrategy(times: number) {
      // Exponential backoff: 50ms, 100ms, 200ms … up to 2s
      const delay = Math.min(50 * 2 ** times, 2000);
      return delay;
    },
    reconnectOnError(err: Error) {
      // Reconnect on READONLY errors (cluster failover)
      return err.message.includes("READONLY");
    },
  });

  redisClient.on("connect", () => {
    console.info("[Redis] Connection established");
  });

  redisClient.on("ready", () => {
    console.info("[Redis] Client ready");
  });

  redisClient.on("error", (err: Error) => {
    console.error("[Redis] Connection error:", err.message);
  });

  redisClient.on("reconnecting", () => {
    console.warn("[Redis] Reconnecting…");
  });

  redisClient.on("close", () => {
    console.warn("[Redis] Connection closed");
  });

  return redisClient;
}

/**
 * Gracefully disconnects the Redis client.
 * Should be called during application shutdown.
 */
export async function closeRedisClient(): Promise<void> {
  if (!redisClient) return;

  try {
    await redisClient.quit();
    console.info("[Redis] Connection gracefully closed");
  } catch (err) {
    console.error("[Redis] Error during graceful shutdown:", err);
    redisClient.disconnect();
  } finally {
    redisClient = null;
  }
}

// ─── Permission Cache Helpers ─────────────────────────────────────────────────
/** TTL for permission cache: 5 minutes */
const PERMISSION_CACHE_TTL_SECONDS = 300;

/**
 * Builds the canonical Redis key for a user's permissions in a given app.
 */
export function buildPermissionCacheKey(userId: string, appCode: string): string {
  return `perms:user:${userId}:app:${appCode}`;
}

/**
 * Fetches cached permissions for a user in a given app context.
 * Returns null if not cached.
 */
export async function getCachedPermissions(
  userId: string,
  appCode: string,
): Promise<string[] | null> {
  const redis = getRedisClient();
  const key = buildPermissionCacheKey(userId, appCode);
  const raw = await redis.get(key);

  if (!raw) return null;

  try {
    return JSON.parse(raw) as string[];
  } catch {
    // Corrupt cache entry — evict it
    await redis.del(key);
    return null;
  }
}

/**
 * Stores a user's computed permissions into Redis cache.
 * Format: "module_code:action"
 */
export async function setCachedPermissions(
  userId: string,
  appCode: string,
  permissions: string[],
): Promise<void> {
  const redis = getRedisClient();
  const key = buildPermissionCacheKey(userId, appCode);
  await redis.set(key, JSON.stringify(permissions), "EX", PERMISSION_CACHE_TTL_SECONDS);
}

/**
 * Invalidates the permission cache for a specific user in a given app.
 * Call this whenever roles/permissions are updated.
 */
export async function invalidatePermissionCache(
  userId: string,
  appCode: string,
): Promise<void> {
  const redis = getRedisClient();
  const key = buildPermissionCacheKey(userId, appCode);
  await redis.del(key);
}

/**
 * Invalidates ALL permission caches for a user across all apps.
 * Uses SCAN to avoid blocking the server with KEYS.
 */
export async function invalidateAllUserPermissionCaches(
  userId: string,
): Promise<void> {
  const redis = getRedisClient();
  const prefix = env.REDIS_KEY_PREFIX;

  // ioredis applies keyPrefix to key arguments only — SCAN's MATCH pattern is
  // NOT a key, so the prefix has to be added by hand here. Conversely the keys
  // SCAN returns already carry the prefix, and del() would add it a second
  // time, so strip it back off before deleting.
  const pattern = `${prefix}perms:user:${userId}:app:*`;
  const stream = redis.scanStream({ match: pattern, count: 100 });

  const keysToDelete: string[] = [];

  await new Promise<void>((resolve, reject) => {
    stream.on("data", (keys: string[]) => {
      for (const key of keys) {
        keysToDelete.push(key.startsWith(prefix) ? key.slice(prefix.length) : key);
      }
    });
    stream.on("end", resolve);
    stream.on("error", reject);
  });

  if (keysToDelete.length > 0) {
    await redis.del(...keysToDelete);
  }
}
