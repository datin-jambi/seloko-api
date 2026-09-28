import { publishToExchange } from "../../config/rabbitmq.js";
import { ROUTING_KEYS } from "../queue-names/index.js";

// ─── Audit Event Payload Types ────────────────────────────────────────────────
// Optional fields are explicitly `| undefined`: with exactOptionalPropertyTypes
// callers routinely pass e.g. request.headers["user-agent"] which may be undefined.
interface BaseAuditPayload {
  userId?: string | undefined;
  appCode: string;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
  entityType?: string | undefined;
  entityId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

// ─── Producer Functions ───────────────────────────────────────────────────────
/**
 * Publishes an audit event, swallowing broker failures.
 *
 * Callers use `void publishAudit…()` (fire-and-forget). If the broker is down
 * the rejection would be unhandled, and server.ts kills the process on
 * unhandledRejection — a RabbitMQ outage must not take the API down with it.
 */
async function publishSafely(
  routingKey: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await publishToExchange(routingKey, {
      ...payload,
      publishedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`[AuditProducer] Dropped audit event "${routingKey}":`, err);
  }
}

/**
 * Publishes a "user.login" audit event to RabbitMQ.
 * Non-blocking — returns immediately after enqueue.
 */
export async function publishAuditUserLogin(
  payload: BaseAuditPayload & { userId: string },
): Promise<void> {
  await publishSafely(ROUTING_KEYS.AUDIT_USER_LOGIN, {
    action: "user.login",
    ...payload,
  });
}

/**
 * Publishes a "user.logout" audit event.
 */
export async function publishAuditUserLogout(
  payload: BaseAuditPayload & { userId: string },
): Promise<void> {
  await publishSafely(ROUTING_KEYS.AUDIT_USER_LOGOUT, {
    action: "user.logout",
    ...payload,
  });
}

/**
 * Publishes a generic audit event.
 */
export async function publishAuditEvent(
  routingKey: string,
  payload: BaseAuditPayload & { action: string },
): Promise<void> {
  await publishSafely(routingKey, { ...payload });
}
