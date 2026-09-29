/**
 * audit.consumer.ts
 *
 * Consumes audit events from RabbitMQ and persists them into the
 * audit_logs PostgreSQL table. This worker runs as a separate process.
 *
 * Run: npx tsx src/workers/consumers/audit.consumer.ts
 */
import type { ConsumeMessage } from "amqplib";
import { Prisma } from "@prisma/client";
import { getConsumerChannel, connectRabbitMQ } from "~/config/rabbitmq.js";
import { connectDatabase, prisma } from "~/config/database.js";
import { QUEUES, ROUTING_KEYS } from "~/workers/queue-names/index.js";
import { env } from "~/config/env.js";

// ─── Audit Event Shape ────────────────────────────────────────────────────────
interface AuditEventPayload {
  action: string;
  userId?: string;
  appCode: string;
  entityType?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonObject;
  ipAddress?: string;
  userAgent?: string;
  publishedAt: string;
}

// ─── Consumer ─────────────────────────────────────────────────────────────────
async function startAuditConsumer(): Promise<void> {
  console.info("[AuditConsumer] Starting…");

  await connectDatabase();
  await connectRabbitMQ();

  const channel = getConsumerChannel();

  // Ensure the queue exists and is bound to the exchange
  await channel.assertQueue(QUEUES.AUDIT_LOG, {
    durable: true,
    arguments: {
      "x-dead-letter-exchange": `${env.RABBITMQ_EXCHANGE}.dlx`,
      "x-dead-letter-routing-key": "dead.audit",
    },
  });

  // Bind to all audit routing keys
  const auditRoutingKeys = [
    ROUTING_KEYS.AUDIT_USER_LOGIN,
    ROUTING_KEYS.AUDIT_USER_LOGOUT,
    ROUTING_KEYS.AUDIT_USER_CREATED,
    ROUTING_KEYS.AUDIT_PERMISSION_CHANGED,
  ];

  for (const key of auditRoutingKeys) {
    await channel.bindQueue(QUEUES.AUDIT_LOG, env.RABBITMQ_EXCHANGE, key);
  }

  console.info(`[AuditConsumer] Bound to ${auditRoutingKeys.length} routing keys`);
  console.info(`[AuditConsumer] Listening on queue: "${QUEUES.AUDIT_LOG}"`);

  await channel.consume(QUEUES.AUDIT_LOG, async (msg: ConsumeMessage | null) => {
    if (!msg) return; // Consumer was cancelled

    try {
      const raw = msg.content.toString("utf-8");
      const payload = JSON.parse(raw) as AuditEventPayload;

      await prisma.auditLog.create({
        data: {
          action: payload.action,
          appCode: payload.appCode,
          userId: payload.userId ?? null,
          entityType: payload.entityType ?? null,
          entityId: payload.entityId ?? null,
          // Prisma rejects plain `null` for Json? — use DbNull to store SQL NULL.
          metadata: payload.metadata ?? Prisma.DbNull,
          ipAddress: payload.ipAddress ?? null,
          userAgent: payload.userAgent ?? null,
          severity: "INFO",
        },
      });

      // Acknowledge — remove from queue
      channel.ack(msg);
    } catch (err) {
      console.error("[AuditConsumer] Failed to process message:", err);

      // Reject without requeue — send to DLX after maxRetries
      // For now: nack without requeue to prevent poison-message loop
      channel.nack(msg, false, false);
    }
  });
}

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
process.on("SIGTERM", () => {
  console.info("[AuditConsumer] SIGTERM received. Shutting down…");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.info("[AuditConsumer] SIGINT received. Shutting down…");
  process.exit(0);
});

startAuditConsumer().catch((err) => {
  console.error("[AuditConsumer] Fatal startup error:", err);
  process.exit(1);
});
