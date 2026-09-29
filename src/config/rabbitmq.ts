import amqplib, { type Channel, type ChannelModel, type ConfirmChannel } from "amqplib";
import { env } from "./env.js";

// ─── Types ────────────────────────────────────────────────────────────────────
interface RabbitMQConnection {
  // amqplib >= 0.10.5: connect() resolves to ChannelModel, not Connection.
  connection: ChannelModel;
  publisherChannel: ConfirmChannel;
  consumerChannel: Channel;
}

// ─── Singleton State ──────────────────────────────────────────────────────────
let state: RabbitMQConnection | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const RECONNECT_DELAY_MS = 5000;

// ─── Connection Factory ───────────────────────────────────────────────────────
async function createConnection(): Promise<RabbitMQConnection> {
  const connection = await amqplib.connect(env.RABBITMQ_URL);

  // Publisher uses a ConfirmChannel to guarantee message delivery acknowledgment
  const publisherChannel = await connection.createConfirmChannel();
  await publisherChannel.prefetch(env.RABBITMQ_PREFETCH);

  // Consumer uses a regular channel
  const consumerChannel = await connection.createChannel();
  await consumerChannel.prefetch(env.RABBITMQ_PREFETCH);

  // Declare the global topic exchange
  await publisherChannel.assertExchange(env.RABBITMQ_EXCHANGE, "topic", {
    durable: true,
    autoDelete: false,
  });

  console.info(`[RabbitMQ] Connected to ${env.RABBITMQ_URL}`);
  console.info(`[RabbitMQ] Exchange "${env.RABBITMQ_EXCHANGE}" ready`);

  return { connection, publisherChannel, consumerChannel };
}

// ─── Reconnect Logic ──────────────────────────────────────────────────────────
async function scheduleReconnect(): Promise<void> {
  if (reconnectTimer) return; // Already scheduled

  console.warn(`[RabbitMQ] Scheduling reconnect in ${RECONNECT_DELAY_MS}ms…`);

  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    try {
      state = await createConnection();
      attachConnectionListeners(state);
    } catch (err) {
      console.error("[RabbitMQ] Reconnect failed:", err);
      void scheduleReconnect();
    }
  }, RECONNECT_DELAY_MS);
}

function attachConnectionListeners(conn: RabbitMQConnection): void {
  conn.connection.on("error", (err: Error) => {
    console.error("[RabbitMQ] Connection error:", err.message);
    state = null;
    void scheduleReconnect();
  });

  conn.connection.on("close", () => {
    console.warn("[RabbitMQ] Connection closed unexpectedly");
    state = null;
    void scheduleReconnect();
  });

  conn.publisherChannel.on("error", (err: Error) => {
    console.error("[RabbitMQ] Publisher channel error:", err.message);
  });

  conn.consumerChannel.on("error", (err: Error) => {
    console.error("[RabbitMQ] Consumer channel error:", err.message);
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────
/**
 * Initializes the RabbitMQ connection singleton.
 * Must be called once during application bootstrap.
 */
export async function connectRabbitMQ(): Promise<void> {
  if (state) return;

  state = await createConnection();
  attachConnectionListeners(state);
}

/**
 * Returns the shared publisher ConfirmChannel.
 * Throws if the connection has not been initialized.
 */
export function getPublisherChannel(): ConfirmChannel {
  if (!state) {
    throw new Error(
      "[RabbitMQ] Publisher channel not available. Call connectRabbitMQ() first.",
    );
  }
  return state.publisherChannel;
}

/**
 * Returns the shared consumer Channel.
 * Throws if the connection has not been initialized.
 */
export function getConsumerChannel(): Channel {
  if (!state) {
    throw new Error(
      "[RabbitMQ] Consumer channel not available. Call connectRabbitMQ() first.",
    );
  }
  return state.consumerChannel;
}

/**
 * Publishes a JSON payload to the RabbitMQ topic exchange.
 * Uses a ConfirmChannel — resolves when the broker acknowledges receipt.
 *
 * @param routingKey - Routing key, e.g. "audit.user.login"
 * @param payload    - JSON-serializable object
 * @param persistent - Whether the message survives broker restart (default: true)
 */
export async function publishToExchange(
  routingKey: string,
  payload: Record<string, unknown>,
  persistent = true,
): Promise<void> {
  const channel = getPublisherChannel();
  const buffer = Buffer.from(JSON.stringify(payload));

  return new Promise<void>((resolve, reject) => {
    channel.publish(
      env.RABBITMQ_EXCHANGE,
      routingKey,
      buffer,
      {
        persistent,
        contentType: "application/json",
        timestamp: Date.now(),
      },
      (err) => {
        if (err) {
          console.error(
            `[RabbitMQ] Failed to publish to "${routingKey}":`,
            err.message,
          );
          reject(err);
        } else {
          resolve();
        }
      },
    );
  });
}

/**
 * True bila koneksi broker sedang hidup. Dipakai health check.
 * Listener connection "close"/"error" mengosongkan state, jadi flag ini
 * ikut turun saat broker mati.
 */
export function isRabbitMQConnected(): boolean {
  return state !== null;
}

/**
 * Gracefully closes the RabbitMQ connection.
 * Should be called during application shutdown.
 */
export async function closeRabbitMQ(): Promise<void> {
  if (!state) return;

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  try {
    await state.publisherChannel.close();
    await state.consumerChannel.close();
    await state.connection.close();
    console.info("[RabbitMQ] Connection gracefully closed");
  } catch (err) {
    console.error("[RabbitMQ] Error during graceful shutdown:", err);
  } finally {
    state = null;
  }
}
