import { z } from "zod";

const envSchema = z.object({
  // ─── Server ─────────────────────────────────────────────────────────────────
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("0.0.0.0"),

  // ─── Database ────────────────────────────────────────────────────────────────
  DATABASE_URL: z
    .string()
    .url()
    .startsWith("postgresql://", { message: "DATABASE_URL must be a valid PostgreSQL connection string" }),

  // ─── Redis ───────────────────────────────────────────────────────────────────
  REDIS_HOST: z.string().min(1, { message: "REDIS_HOST is required" }),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().int().nonnegative().default(0),
  // z.coerce.boolean() turns the string "false" into true — parse explicitly.
  REDIS_TLS: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  REDIS_KEY_PREFIX: z.string().default("seloko:"),

  // ─── RabbitMQ ────────────────────────────────────────────────────────────────
  RABBITMQ_URL: z
    .string()
    .url()
    .startsWith("amqp", { message: "RABBITMQ_URL must be a valid AMQP connection string (amqp:// or amqps://)" }),
  RABBITMQ_EXCHANGE: z.string().default("seloko.exchange"),
  RABBITMQ_PREFETCH: z.coerce.number().int().positive().default(10),

  // ─── JWT ─────────────────────────────────────────────────────────────────────
  JWT_SECRET: z
    .string()
    .min(32, { message: "JWT_SECRET must be at least 32 characters long" }),
  JWT_ACCESS_EXPIRES: z.string().default("15m"),
  JWT_REFRESH_EXPIRES: z.string().default("7d"),

  // ─── Cookie ──────────────────────────────────────────────────────────────────
  COOKIE_SECRET: z
    .string()
    .min(32, { message: "COOKIE_SECRET must be at least 32 characters long" }),

  // ─── CORS ────────────────────────────────────────────────────────────────────
  CORS_ORIGIN: z.string().default("*"),
});

function parseEnv() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const messages = parsed.error.issues
      .map((issue) => `  → [${issue.path.join(".")}]: ${issue.message}`)
      .join("\n");

    console.error("╔══════════════════════════════════════════════════════════╗");
    console.error("║  FATAL: Invalid environment variables detected           ║");
    console.error("╚══════════════════════════════════════════════════════════╝");
    console.error(messages);
    console.error("\nServer startup aborted. Fix the above environment variables.");

    // Intentional: fail fast on bad config
    process.exit(1);
  }

  return parsed.data;
}

// Validated, typed environment — exported as immutable singleton
export const env = Object.freeze(parseEnv());

// Convenience re-export for type inference
export type Env = z.infer<typeof envSchema>;
