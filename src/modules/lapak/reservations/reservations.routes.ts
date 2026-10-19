import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { APP_CODES } from "~/common/constants/index.js";
import {
  ReservationProductParamsSchema,
  ReservationParamsSchema,
  CreateReservationBodySchema,
  ListReservationsQuerySchema,
  SlotAvailabilityQuerySchema,
  CreateReservationResponseSchema,
  ReservationListResponseSchema,
  SlotAvailabilityResponseSchema,
  ReleaseReservationResponseSchema,
} from "./reservations.schema.js";
import {
  handleCreateReservation,
  handleReleaseReservation,
  handleListReservations,
  handleGetSlotAvailability,
} from "./reservations.controller.js";

/**
 * Reservasi rentang waktu produk (LJ-2.2, PRD 04 §H).
 *
 * Anti double-booking dijaga exclusion constraint PostgreSQL — lihat
 * `reservations.service.ts`. Endpoint publik sengaja TIDAK mengecek ketersediaan
 * sebelum insert; constraint yang menutup jendela race.
 */
export async function lapakReservationsRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const LAPAK = APP_CODES.LAPAK_JAMBI_WEB;

  // ── Publik ──────────────────────────────────────────────────────────────────
  app.get("/product/:productId/slots", {
    schema: {
      description: "Blok waktu yang sudah terpakai pada rentang (publik, hanya produk PUBLISHED)",
      tags: ["lapak-reservations"],
      params: ReservationProductParamsSchema,
      querystring: SlotAvailabilityQuerySchema,
      response: { 200: SlotAvailabilityResponseSchema },
    },
  }, handleGetSlotAvailability);

  app.post("/product/:productId", {
    schema: {
      description: "Pegang slot sementara (HOLD). Bentrok waktu dibalas 409 oleh exclusion constraint DB.",
      tags: ["lapak-reservations"],
      params: ReservationProductParamsSchema,
      body: CreateReservationBodySchema,
      response: { 201: CreateReservationResponseSchema },
    },
  }, handleCreateReservation);

  app.post("/:id/release", {
    schema: {
      description: "Lepas HOLD (tidak menghapus riwayat; slot langsung bisa dipesan ulang)",
      tags: ["lapak-reservations"],
      params: ReservationParamsSchema,
      response: { 200: ReleaseReservationResponseSchema },
    },
  }, handleReleaseReservation);

  // ── CMS ─────────────────────────────────────────────────────────────────────
  app.get("/product/:productId", {
    schema: {
      description: "Daftar reservasi produk (lingkup OPD)",
      tags: ["lapak-reservations"],
      params: ReservationProductParamsSchema,
      querystring: ListReservationsQuerySchema,
      response: { 200: ReservationListResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("product:read", { app: LAPAK }),
    ],
  }, handleListReservations);
}
