import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { APP_CODES } from "~/common/constants/index.js";
import {
  DashboardQuerySchema,
  TargetQuerySchema,
  TargetUpsertBodySchema,
  TargetParamsSchema,
  DashboardResponseSchema,
  TargetResponseSchema,
  TargetListResponseSchema,
  TargetDeleteResponseSchema,
} from "./dashboard.schema.js";
import {
  handleDashboard,
  handleListTargets,
  handleUpsertTarget,
  handleDeleteTarget,
} from "./dashboard.controller.js";

/**
 * Dashboard & pelaporan PAD (LJ-3.1).
 *
 * Format mengikuti laporan resmi SIKD/DJPK Kemenkeu:
 * Akun | Anggaran/Pagu | Realisasi | %
 *
 * Target ditetapkan Bapenda (entity `report`); dashboard dibaca Bapenda maupun
 * admin OPD — admin OPD hanya melihat OPD-nya sendiri.
 */
export async function lapakDashboardRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const LAPAK = APP_CODES.LAPAK_JAMBI_WEB;

  app.get("/", {
    schema: {
      description: "Ringkasan penerimaan (target vs realisasi) per OPD/kategori/bulan, plus pending & tren",
      tags: ["lapak-dashboard"],
      querystring: DashboardQuerySchema,
      response: { 200: DashboardResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("report:read", { app: LAPAK }),
    ],
  }, handleDashboard);

  app.get("/targets", {
    schema: {
      description: "Daftar target penerimaan (default aplikasi + per OPD)",
      tags: ["lapak-dashboard"],
      querystring: TargetQuerySchema,
      response: { 200: TargetListResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("report:read", { app: LAPAK }),
    ],
  }, handleListTargets);

  app.post("/targets", {
    schema: {
      description: "Simpan target penerimaan (upsert per OPD per tahun; kode kosong = default)",
      tags: ["lapak-dashboard"],
      body: TargetUpsertBodySchema,
      response: { 200: TargetResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("report:update", { app: LAPAK }),
    ],
  }, handleUpsertTarget);

  app.delete("/targets/:id", {
    schema: {
      description: "Hapus target penerimaan",
      tags: ["lapak-dashboard"],
      params: TargetParamsSchema,
      response: { 200: TargetDeleteResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("report:update", { app: LAPAK }),
    ],
  }, handleDeleteTarget);
}
