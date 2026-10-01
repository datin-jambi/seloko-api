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
 * Ping ringan untuk health check. Mengembalikan false, tidak melempar.
 */
export async function pingRedis(): Promise<boolean> {
  try {
    return (await getRedisClient().ping()) === "PONG";
  } catch {
    return false;
  }
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
  const key = buildPermissionCacheKey(userId, appCode);
  let raw: string | null;

  try {
    raw = await getRedisClient().get(key);
  } catch (err) {
    // Redis down: laporkan sebagai cache miss agar pemanggil jatuh ke DB.
    // Cache bukan sumber kebenaran, jadi hasilnya tetap benar — hanya lebih
    // lambat. Melempar di sini membuat setiap request ber-permission balas 500.
    console.error("[Redis] Gagal membaca cache permission:", err);
    return null;
  }

  if (!raw) return null;

  try {
    return JSON.parse(raw) as string[];
  } catch {
    // Corrupt cache entry — evict it
    await getRedisClient()
      .del(key)
      .catch(() => undefined);
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
  const key = buildPermissionCacheKey(userId, appCode);
  try {
    await getRedisClient().set(
      key,
      JSON.stringify(permissions),
      "EX",
      PERMISSION_CACHE_TTL_SECONDS,
    );
  } catch (err) {
    // Gagal menulis cache tidak mengubah jawaban yang sudah dihitung dari DB.
    console.error("[Redis] Gagal menulis cache permission:", err);
  }
}

/**
 * Invalidates the permission cache for a specific user in a given app.
 * Call this whenever roles/permissions are updated.
 *
 * Mengembalikan false bila Redis sedang down, bukan melempar: aksi utama
 * (perubahan di DB) sudah permanen, dan entry cache yang tertinggal toh
 * kedaluwarsa sendiri dalam PERMISSION_CACHE_TTL_SECONDS. Pemanggil memakai
 * flag ini untuk memberi tahu klien bahwa perubahan baru efektif penuh
 * setelah TTL habis.
 */
export async function invalidatePermissionCache(
  userId: string,
  appCode: string,
): Promise<boolean> {
  const key = buildPermissionCacheKey(userId, appCode);
  try {
    await getRedisClient().del(key);
    return true;
  } catch (err) {
    console.error("[Redis] Gagal menghapus cache permission:", err);
    return false;
  }
}

// ─── Access Token Blocklist ───────────────────────────────────────────────────
/**
 * Builds the Redis key for a blocked access token.
 * @param tokenHash - SHA-256 hex digest of the raw access token.
 */
function buildBlockedTokenKey(tokenHash: string): string {
  return `blocked_at:${tokenHash}`;
}

/**
 * Memasukkan access token ke blocklist Redis.
 * TTL disetel ke sisa waktu hidup token agar entry otomatis terhapus
 * setelah token expire — tidak perlu pembersihan manual.
 *
 * @param tokenHash  - SHA-256 hex digest dari raw access token
 * @param ttlSeconds - Sisa waktu hidup token dalam detik (≥ 1)
 *
 * SENGAJA melempar bila Redis down — jangan diubah jadi fail-open. Blocklist
 * ini tidak punya cadangan apa pun: gagal menulis berarti token tetap sah
 * sampai expire, dan tidak ada mekanisme lain yang menangkapnya. Lebih baik
 * logout balas error (klien bisa retry) daripada balas 200 padahal tokennya
 * masih hidup.
 */
export async function blockAccessToken(
  tokenHash: string,
  ttlSeconds: number,
): Promise<void> {
  if (ttlSeconds <= 0) return; // Sudah expire, tidak perlu disimpan
  const redis = getRedisClient();
  await redis.set(buildBlockedTokenKey(tokenHash), "1", "EX", ttlSeconds);
}

/**
 * Mengecek apakah access token sudah masuk blocklist (telah di-revoke).
 * Mengembalikan false jika Redis sedang down agar API tidak mati total.
 */
export async function isAccessTokenBlocked(tokenHash: string): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const value = await redis.get(buildBlockedTokenKey(tokenHash));
    return value !== null;
  } catch {
    // Redis down: fail-open agar autentikasi tidak mati total.
    // Trade-off: revoked token bisa lewat sementara selama Redis down.
    return false;
  }
}

/**
 * Hapus setiap key yang cocok dengan pola, lewat SCAN agar tidak memblokir
 * server seperti KEYS.
 *
 * ioredis menempelkan keyPrefix hanya pada argumen key — MATCH milik SCAN
 * BUKAN key, jadi prefix harus ditambahkan sendiri di sini. Sebaliknya key yang
 * dikembalikan SCAN sudah membawa prefix, dan del() akan menambahkannya sekali
 * lagi, jadi prefix dilepas dulu sebelum dihapus.
 *
 * Mengembalikan false bila Redis down, tidak melempar — lihat catatan pada
 * invalidatePermissionCache untuk alasannya.
 */
async function deleteByPattern(suffixPattern: string, label: string): Promise<boolean> {
  const prefix = env.REDIS_KEY_PREFIX;

  try {
    const redis = getRedisClient();
    const stream = redis.scanStream({ match: `${prefix}${suffixPattern}`, count: 100 });
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

    return true;
  } catch (err) {
    console.error(`[Redis] Gagal menghapus ${label}:`, err);
    return false;
  }
}

/**
 * Invalidates ALL permission caches for a user across all apps.
 */
export async function invalidateAllUserPermissionCaches(
  userId: string,
): Promise<boolean> {
  return deleteByPattern(
    `perms:user:${userId}:app:*`,
    "seluruh cache permission user",
  );
}

/**
 * Buang cache permission SELURUH user pada satu aplikasi.
 *
 * Dipakai saat aplikasi dinonaktifkan atau permission/role-nya berubah: tanpa
 * ini pemegang izin lama tetap lolos guard sampai TTL 5 menit habis. Pola
 * key menaruh userId di tengah, jadi tidak bisa dihapus dengan satu DEL —
 * harus SCAN.
 */
export async function invalidateAppPermissionCaches(
  appCode: string,
): Promise<boolean> {
  return deleteByPattern(`perms:user:*:app:${appCode}`, `cache permission aplikasi "${appCode}"`);
}
