import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { APP_CODES } from "~/common/constants/index.js";
import {
  ListRatesQuerySchema,
  ListRatesResponseSchema,
  RateParamsSchema,
  RateActionParamsSchema,
  RateProductParamsSchema,
  GetRateResponseSchema,
  CreateRateBodySchema,
  MutateRateResponseSchema,
  UpdateRateBodySchema,
  RateActionBodySchema,
  DeleteRateResponseSchema,
} from "./rates.schema.js";
import {
  handleListRates,
  handleGetRateById,
  handleCreateRate,
  handleUpdateRate,
  handleReviseRate,
  handlePatchRateStatus,
  handleDeactivateRate,
  handleDeleteRate,
} from "./rates.controller.js";

/**
 * Tarif produk (PRD 04 §C). Punya status sendiri: mengubah harga produk
 * terbit TIDAK menurunkan produk — buat tarif baru yang di-approve terpisah;
 * pesanan menyimpan snapshot harga sehingga riwayat tak pernah rusak.
 * Izin memakai `product:approve|reject` (bukan entity baru) sesuai seed.
 */
export async function lapakRatesRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const LAPAK = APP_CODES.LAPAK_JAMBI_WEB;

  // ── CMS ─────────────────────────────────────────────────────────────────────
  app.get("/", {
    schema: {
      description: "Daftar tarif untuk CMS — filter produk & status; tersaring lingkup OPD",
      tags: ["lapak-rates"],
      querystring: ListRatesQuerySchema,
      response: { 200: ListRatesResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("product:list", { app: LAPAK }),
    ],
  }, handleListRates);

  app.get("/:id", {
    schema: {
      description: "Detail tarif untuk CMS",
      tags: ["lapak-rates"],
      params: RateParamsSchema,
      response: { 200: GetRateResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("product:read", { app: LAPAK }),
    ],
  }, handleGetRateById);

  app.post("/product/:productId", {
    schema: {
      description:
        "Menambah tarif pada produk. Produk terbit → tarif lahir PENDING_REVIEW; produk lain → DRAFT.",
      tags: ["lapak-rates"],
      params: RateProductParamsSchema,
      body: CreateRateBodySchema,
      response: { 201: MutateRateResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("product:update", { app: LAPAK }),
    ],
  }, handleCreateRate);

  app.put("/:id", {
    schema: {
      description: "Mengubah tarif DRAFT/REJECTED/PENDING_REVIEW. Tarif ter-approve ditolak (409).",
      tags: ["lapak-rates"],
      params: RateParamsSchema,
      body: UpdateRateBodySchema,
      response: { 200: MutateRateResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("product:update", { app: LAPAK }),
    ],
  }, handleUpdateRate);

  app.post("/:id/revise", {
    schema: {
      description:
        "Merevisi tarif APPROVED/PUBLISHED: baris lama dinonaktifkan, dibuat baris baru ber-status sesuai produk. Riwayat harga tetap.",
      tags: ["lapak-rates"],
      params: RateParamsSchema,
      body: UpdateRateBodySchema,
      response: { 200: MutateRateResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("product:update", { app: LAPAK }),
    ],
  }, handleReviseRate);

  app.patch("/:id/status/:action", {
    schema: {
      description:
        "Transisi tarif: submit | approve | reject. approve/reject butuh product:approve|product:reject — dalam lingkup OPD. reject wajib menyertakan note.",
      tags: ["lapak-rates"],
      params: RateActionParamsSchema,
      body: RateActionBodySchema,
      response: { 200: MutateRateResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("product:read", { app: LAPAK }),
    ],
  }, handlePatchRateStatus);

  app.patch("/:id/deactivate", {
    schema: {
      description:
        "Menonaktifkan tarif (hilang dari publik tanpa menghapus riwayat). Tarif terakhir yang aktif ditolak.",
      tags: ["lapak-rates"],
      params: RateParamsSchema,
      response: { 200: MutateRateResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("product:update", { app: LAPAK }),
    ],
  }, handleDeactivateRate);

  app.delete("/:id", {
    schema: {
      description: "Menghapus (soft-delete) tarif. Tarif aktif ter-approve ditolak.",
      tags: ["lapak-rates"],
      params: RateParamsSchema,
      response: { 200: DeleteRateResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("product:delete", { app: LAPAK }),
    ],
  }, handleDeleteRate);
}
