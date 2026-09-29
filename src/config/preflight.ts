/**
 * preflight.ts — Pemeriksaan infrastruktur saat startup.
 *
 * Menguji PostgreSQL, Redis, dan RabbitMQ satu per satu lalu mencetak tabel
 * status + latensi. PostgreSQL wajib (critical); Redis & RabbitMQ terdegradasi
 * (permission jatuh ke DB, audit event hilang) tapi API tetap melayani.
 */
import { env } from "./env.js";
import { prisma } from "./database.js";
import { getRedisClient } from "./redis.js";
import { isRabbitMQConnected } from "./rabbitmq.js";

export interface CheckResult {
  name: string;
  critical: boolean;
  ok: boolean;
  ms: number;
  target: string;
  detail: string;
}

const PROBE_TIMEOUT_MS = 5000;

/** Sensor kredensial di connection string sebelum masuk log. */
export function maskUrl(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.password) url.password = "***";
    return url.toString();
  } catch {
    return raw.replace(/:\/\/[^@/]*@/, "://***@");
  }
}

/** Gagalkan probe yang menggantung — ioredis/amqplib bisa retry tanpa akhir. */
async function withTimeout<T>(task: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timeout setelah ${PROBE_TIMEOUT_MS}ms`)),
          PROBE_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function runCheck(
  name: string,
  critical: boolean,
  target: string,
  probe: () => Promise<string>,
): Promise<CheckResult> {
  const startedAt = Date.now();
  try {
    const detail = await withTimeout(probe(), name);
    return { name, critical, ok: true, ms: Date.now() - startedAt, target, detail };
  } catch (err) {
    return {
      name,
      critical,
      ok: false,
      ms: Date.now() - startedAt,
      target,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkDatabase(): Promise<CheckResult> {
  return runCheck("PostgreSQL", true, maskUrl(env.DATABASE_URL), async () => {
    await prisma.$connect();
    const rows = await prisma.$queryRaw<{ version: string }[]>`SELECT version()`;
    const version = rows[0]?.version ?? "";
    // "PostgreSQL 16.4 on x86_64…" → "PostgreSQL 16.4"
    return version.split(/\s+on\s+/)[0] || "terhubung";
  });
}

async function checkRedis(): Promise<CheckResult> {
  const target = `${env.REDIS_HOST}:${env.REDIS_PORT} db=${env.REDIS_DB}${env.REDIS_TLS ? " tls" : ""}`;
  return runCheck("Redis", false, target, async () => {
    const redis = getRedisClient();
    if ((await redis.ping()) !== "PONG") throw new Error("PING tidak membalas PONG");
    const info = await redis.info("server");
    const version = /redis_version:([^\r\n]+)/.exec(info)?.[1] ?? "?";
    return `v${version}, prefix "${env.REDIS_KEY_PREFIX}"`;
  });
}

async function checkRabbitMQ(): Promise<CheckResult> {
  return runCheck("RabbitMQ", false, maskUrl(env.RABBITMQ_URL), async () => {
    if (!isRabbitMQConnected()) throw new Error("broker tidak terhubung");
    return `exchange "${env.RABBITMQ_EXCHANGE}", prefetch ${env.RABBITMQ_PREFETCH}`;
  });
}

/**
 * Jalankan semua pemeriksaan, cetak tabel status, kembalikan hasilnya.
 * Pemanggil yang memutuskan apakah startup dibatalkan.
 */
export async function runPreflight(): Promise<CheckResult[]> {
  console.info("[Preflight] Memeriksa koneksi infrastruktur…");

  // Berurutan, bukan paralel: log per-service tetap terbaca dan latensi tidak
  // tercampur satu sama lain.
  const results = [await checkDatabase(), await checkRedis(), await checkRabbitMQ()];

  const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);
  console.info("┌──────────────┬──────────┬────────┬─────────────────────────────────────────────┐");
  console.info("│ Service      │ Status   │ Waktu  │ Keterangan                                  │");
  console.info("├──────────────┼──────────┼────────┼─────────────────────────────────────────────┤");
  for (const r of results) {
    const status = r.ok ? "OK      " : r.critical ? "GAGAL   " : "DEGRADED";
    console.info(
      `│ ${pad(r.name, 12)} │ ${status} │ ${pad(`${r.ms}ms`, 6)} │ ${pad(r.detail, 43)} │`,
    );
    console.info(`│ ${pad("", 12)} │ ${pad("", 8)} │ ${pad("", 6)} │ ${pad(`→ ${r.target}`, 43)} │`);
  }
  console.info("└──────────────┴──────────┴────────┴─────────────────────────────────────────────┘");

  for (const r of results.filter((x) => !x.ok)) {
    if (r.critical) {
      console.error(`[Preflight] ${r.name} WAJIB tersedia — ${r.detail}`);
    } else {
      console.warn(
        `[Preflight] ${r.name} tidak tersedia — API jalan terdegradasi (${r.detail})`,
      );
    }
  }

  return results;
}
