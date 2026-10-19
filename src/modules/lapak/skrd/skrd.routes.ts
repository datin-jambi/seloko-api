import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { APP_CODES } from "~/common/constants/index.js";
import {
  SkrdSettingParamsSchema,
  SkrdParamsSchema,
  SkrdTokenParamsSchema,
  SkrdOrderParamsSchema,
  SkrdOrgCodeParamsSchema,
  SkrdDeleteResponseSchema,
  SkrdPreviewResponseSchema,
  UpsertSkrdSettingBodySchema,
  IssueSkrdBodySchema,
  ListSkrdQuerySchema,
  SkrdSettingListResponseSchema,
  SkrdSettingResponseSchema,
  SkrdResponseSchema,
  SkrdListResponseSchema,
  SkrdVerifyResponseSchema,
} from "./skrd.schema.js";
import {
  handleListSettings,
  handleUpsertSetting,
  handleDeleteSetting,
  handlePreviewNumber,
  handleIssueSkrd,
  handleGetSkrd,
  handleGetSkrdByOrder,
  handleVerifySkrd,
  handleListSkrds,
  handleCancelSkrd,
} from "./skrd.controller.js";

/**
 * Pengaturan & penerbitan SKRD (LJ-2.5, PRD 04 §D).
 *
 * Pengaturan = Bapenda saja (penerbit, format nomor, penandatangan, rekening).
 * SKRD terbit OTOMATIS saat checkout, bukan lewat endpoint ini — endpoint
 * penerbitan hanya untuk pesanan lama yang belum punya SKRD.
 * Verifikasi token bersifat PUBLIK: siapa pun bisa memastikan dokumen asli.
 */
export async function lapakSkrdRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const LAPAK = APP_CODES.LAPAK_JAMBI_WEB;

  // ── Publik: verifikasi dokumen lewat token QR ───────────────────────────────
  app.get("/verify/:token", {
    schema: {
      description: "Verifikasi keaslian SKRD lewat token QR (publik, tanpa PII)",
      tags: ["lapak-skrd"],
      params: SkrdTokenParamsSchema,
      response: { 200: SkrdVerifyResponseSchema },
    },
  }, handleVerifySkrd);

  // ── Pengaturan (Bapenda) ────────────────────────────────────────────────────
  app.get("/settings", {
    schema: {
      description: "Daftar pengaturan SKRD (default Bapenda + per OPD)",
      tags: ["lapak-skrd"],
      response: { 200: SkrdSettingListResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("order:read", { app: LAPAK }),
    ],
  }, handleListSettings);

  app.post("/settings", {
    schema: {
      description: "Simpan pengaturan SKRD (upsert per OPD; kode kosong = default Bapenda)",
      tags: ["lapak-skrd"],
      body: UpsertSkrdSettingBodySchema,
      response: { 200: SkrdSettingResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("order:update", { app: LAPAK }),
    ],
  }, handleUpsertSetting);

  app.delete("/settings/:id", {
    schema: {
      description: "Hapus pengaturan SKRD",
      tags: ["lapak-skrd"],
      params: SkrdSettingParamsSchema,
      response: { 200: SkrdDeleteResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("order:update", { app: LAPAK }),
    ],
  }, handleDeleteSetting);

  app.get("/settings/preview/:organizationCode", {
    schema: {
      description: "Pratinjau nomor SKRD berikutnya untuk sebuah OPD (tanpa memakainya)",
      tags: ["lapak-skrd"],
      params: SkrdOrgCodeParamsSchema,
      response: { 200: SkrdPreviewResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("order:read", { app: LAPAK }),
    ],
  }, handlePreviewNumber);

  // ── SKRD ────────────────────────────────────────────────────────────────────
  app.get("/", {
    schema: {
      description: "Daftar SKRD — tersaring lingkup OPD",
      tags: ["lapak-skrd"],
      querystring: ListSkrdQuerySchema,
      response: { 200: SkrdListResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("order:read", { app: LAPAK }),
    ],
  }, handleListSkrds);

  app.post("/order/:orderId", {
    schema: {
      description: "Terbitkan SKRD untuk pesanan yang belum punya (mis. data lama)",
      tags: ["lapak-skrd"],
      params: SkrdOrderParamsSchema,
      body: IssueSkrdBodySchema,
      response: { 201: SkrdResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("order:update", { app: LAPAK }),
    ],
  }, handleIssueSkrd);

  app.get("/order/:orderId", {
    schema: {
      description: "SKRD milik sebuah pesanan",
      tags: ["lapak-skrd"],
      params: SkrdOrderParamsSchema,
      response: { 200: SkrdResponseSchema },
    },
    preHandler: [fastify.authenticate],
  }, handleGetSkrdByOrder);

  app.get("/:id", {
    schema: {
      description: "Detail SKRD",
      tags: ["lapak-skrd"],
      params: SkrdParamsSchema,
      response: { 200: SkrdResponseSchema },
    },
    preHandler: [fastify.authenticate],
  }, handleGetSkrd);

  app.post("/:id/cancel", {
    schema: {
      description: "Batalkan SKRD — nomor TIDAK dipakai ulang (gapless)",
      tags: ["lapak-skrd"],
      params: SkrdParamsSchema,
      response: { 200: SkrdResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("order:update", { app: LAPAK }),
    ],
  }, handleCancelSkrd);
}
