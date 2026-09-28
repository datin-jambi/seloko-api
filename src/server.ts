/**
 * server.ts — Application bootstrap & graceful shutdown.
 *
 * Sequence:
 * 1. Validate environment variables (fails fast on bad config)
 * 2. Connect infrastructure: PostgreSQL → Redis → RabbitMQ
 * 3. Build Fastify app and register all plugins/routes
 * 4. Start HTTP listener
 * 5. Register SIGTERM/SIGINT handlers for graceful shutdown
 */
import { env } from "./config/env.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { getRedisClient, closeRedisClient } from "./config/redis.js";
import { connectRabbitMQ, closeRabbitMQ } from "./config/rabbitmq.js";
import { buildApp } from "./app.js";

async function bootstrap(): Promise<void> {
  console.info("╔══════════════════════════════════════════════════╗");
  console.info("║         SELOKO API — Bapenda Jambi               ║");
  console.info(`║         Environment: ${env.NODE_ENV.padEnd(26)}║`);
  console.info("╚══════════════════════════════════════════════════╝");

  // ── 1. Connect Infrastructure ───────────────────────────────────────────
  await connectDatabase();

  // Initialize Redis connection (lazy=false means it connects immediately)
  getRedisClient();

  await connectRabbitMQ();

  // ── 2. Build Fastify App ────────────────────────────────────────────────
  const app = await buildApp();

  // ── 3. Start Listener ───────────────────────────────────────────────────
  const address = await app.listen({ port: env.PORT, host: env.HOST });
  console.info(`\n🚀 SELOKO API listening at ${address}\n`);

  // ── 4. Graceful Shutdown ────────────────────────────────────────────────
  async function shutdown(signal: string): Promise<void> {
    console.info(`\n[Shutdown] Received ${signal}. Initiating graceful shutdown…`);

    // Stop accepting new connections
    await app.close();
    console.info("[Shutdown] HTTP server closed");

    // Drain infrastructure connections
    await closeRabbitMQ();
    await closeRedisClient();
    await disconnectDatabase();

    console.info("[Shutdown] All connections closed. Goodbye.");
    process.exit(0);
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  // Catch unhandled promise rejections — log and exit so the process
  // manager (PM2 / K8s) can restart the instance cleanly.
  process.on("unhandledRejection", (reason) => {
    console.error("[Fatal] Unhandled Promise Rejection:", reason);
    process.exit(1);
  });

  process.on("uncaughtException", (err) => {
    console.error("[Fatal] Uncaught Exception:", err);
    process.exit(1);
  });
}

bootstrap().catch((err) => {
  console.error("[Fatal] Bootstrap failed:", err);
  process.exit(1);
});
