import { PrismaClient } from "@prisma/client";
import { env } from "./env.js";

// ─── Prisma Singleton ─────────────────────────────────────────────────────────
declare global {
  // Prevents multiple instances in hot-reload (dev) environments
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log:
      env.NODE_ENV === "development"
        ? ["query", "info", "warn", "error"]
        : ["warn", "error"],
    errorFormat: "pretty",
  });
}

// In production: create fresh. In development: reuse across hot reloads.
export const prisma: PrismaClient =
  globalThis.__prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}

/**
 * Connects to the database and validates the connection.
 * Call during application bootstrap.
 */
export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  console.info("[Database] PostgreSQL connection established");
}

/**
 * Gracefully disconnects from the database.
 * Call during application shutdown.
 */
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  console.info("[Database] PostgreSQL connection closed");
}
