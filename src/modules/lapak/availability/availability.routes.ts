import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { APP_CODES } from "~/common/constants/index.js";
import {
  AvailabilityProductParamsSchema,
  BlackoutParamsSchema,
  ReplaceOperatingHoursBodySchema,
  CreateBlackoutBodySchema,
  CheckAvailabilityQuerySchema,
  OperatingHoursResponseSchema,
  BlackoutListResponseSchema,
  BlackoutResponseSchema,
  AvailabilityResponseSchema,
  DeleteBlackoutResponseSchema,
} from "./availability.schema.js";
import {
  handleGetOperatingHours,
  handleReplaceOperatingHours,
  handleListBlackoutDates,
  handleCreateBlackoutDate,
  handleDeleteBlackoutDate,
  handleCheckAvailability,
} from "./availability.controller.js";

/**
 * Jam operasional & tanggal tutup produk (LJ-2.1, PRD 04 §H).
 *
 * CMS mengelola jadwal OPD-nya sendiri (lingkup OPD otomatis). Endpoint cek
 * ketersediaan bersifat PUBLIK — dibutuhkan halaman katalog sebelum warga
 * memesan, dan hanya produk PUBLISHED yang dilayani.
 */
export async function lapakAvailabilityRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const LAPAK = APP_CODES.LAPAK_JAMBI_WEB;

  // ── Publik ──────────────────────────────────────────────────────────────────
  app.get("/product/:productId/availability", {
    schema: {
      description: "Cek ketersediaan harian produk (publik, hanya produk PUBLISHED)",
      tags: ["lapak-availability"],
      params: AvailabilityProductParamsSchema,
      querystring: CheckAvailabilityQuerySchema,
      response: { 200: AvailabilityResponseSchema },
    },
  }, handleCheckAvailability);

  // ── CMS: jam operasional ────────────────────────────────────────────────────
  app.get("/product/:productId/hours", {
    schema: {
      description: "Jam operasional mingguan produk (lingkup OPD)",
      tags: ["lapak-availability"],
      params: AvailabilityProductParamsSchema,
      response: { 200: OperatingHoursResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("product:read", { app: LAPAK }),
    ],
  }, handleGetOperatingHours);

  app.put("/product/:productId/hours", {
    schema: {
      description: "Ganti seluruh jadwal mingguan (replace-set): hari tanpa baris = tutup",
      tags: ["lapak-availability"],
      params: AvailabilityProductParamsSchema,
      body: ReplaceOperatingHoursBodySchema,
      response: { 200: OperatingHoursResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("product:update", { app: LAPAK }),
    ],
  }, handleReplaceOperatingHours);

  // ── CMS: tanggal tutup ──────────────────────────────────────────────────────
  app.get("/product/:productId/blackouts", {
    schema: {
      description: "Daftar tanggal tutup / maintenance produk",
      tags: ["lapak-availability"],
      params: AvailabilityProductParamsSchema,
      response: { 200: BlackoutListResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("product:read", { app: LAPAK }),
    ],
  }, handleListBlackoutDates);

  app.post("/product/:productId/blackouts", {
    schema: {
      description: "Tambah rentang tanggal tutup (inklusif)",
      tags: ["lapak-availability"],
      params: AvailabilityProductParamsSchema,
      body: CreateBlackoutBodySchema,
      response: { 201: BlackoutResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("product:update", { app: LAPAK }),
    ],
  }, handleCreateBlackoutDate);

  app.delete("/product/:productId/blackouts/:id", {
    schema: {
      description: "Hapus tanggal tutup (hard delete — jadwal bukan data transaksi)",
      tags: ["lapak-availability"],
      params: BlackoutParamsSchema,
      response: { 200: DeleteBlackoutResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("product:update", { app: LAPAK }),
    ],
  }, handleDeleteBlackoutDate);
}
