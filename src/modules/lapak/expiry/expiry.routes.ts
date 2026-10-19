import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { APP_CODES } from "~/common/constants/index.js";
import {
  RunExpiryBodySchema,
  ListRunsQuerySchema,
  RunParamsSchema,
  PurgeRunsQuerySchema,
  PurgeRunsResponseSchema,
  ExpiryRunResponseSchema,
  ExpiryRunListResponseSchema,
  ExpiryStatusResponseSchema,
} from "./expiry.schema.js";
import {
  handleRunExpiry,
  handleStatus,
  handleListRuns,
  handleGetRun,
  handlePurgeRuns,
} from "./expiry.controller.js";

/**
 * Worker kedaluwarsa (LJ-2.8, PRD 04 §5).
 *
 * Worker juga bisa dijalankan sebagai proses terjadwal
 * (`npx tsx src/workers/lapak-expiry.worker.ts`). Endpoint di sini untuk:
 * - memicu manual dari CMS,
 * - memantau kondisi (`/status`) tanpa mengubah apa pun,
 * - menelusuri riwayat run.
 */
export async function lapakExpiryRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const LAPAK = APP_CODES.LAPAK_JAMBI_WEB;

  app.get("/status", {
    schema: {
      description: "Ringkasan kedaluwarsa: sisa yang belum diproses + run terakhir (tanpa mengubah data)",
      tags: ["lapak-expiry"],
      response: { 200: ExpiryStatusResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("order:read", { app: LAPAK }),
    ],
  }, handleStatus);

  app.post("/run", {
    schema: {
      description: "Jalankan worker kedaluwarsa sekarang (lepas HOLD, kedaluwarsakan pesanan & tiket)",
      tags: ["lapak-expiry"],
      body: RunExpiryBodySchema,
      response: { 200: ExpiryRunResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("order:update", { app: LAPAK }),
    ],
  }, handleRunExpiry);

  app.get("/runs", {
    schema: {
      description: "Riwayat run worker kedaluwarsa",
      tags: ["lapak-expiry"],
      querystring: ListRunsQuerySchema,
      response: { 200: ExpiryRunListResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("order:read", { app: LAPAK }),
    ],
  }, handleListRuns);

  app.get("/runs/:id", {
    schema: {
      description: "Detail satu run worker",
      tags: ["lapak-expiry"],
      params: RunParamsSchema,
      response: { 200: ExpiryRunResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("order:read", { app: LAPAK }),
    ],
  }, handleGetRun);

  app.delete("/runs", {
    schema: {
      description: "Bersihkan riwayat run lama (default simpan 30 hari terakhir; run RUNNING tidak pernah dihapus)",
      tags: ["lapak-expiry"],
      querystring: PurgeRunsQuerySchema,
      response: { 200: PurgeRunsResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("order:update", { app: LAPAK }),
    ],
  }, handlePurgeRuns);
}
