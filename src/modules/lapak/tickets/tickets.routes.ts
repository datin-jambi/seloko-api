import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { APP_CODES } from "~/common/constants/index.js";
import {
  TicketParamsSchema,
  TicketOrderParamsSchema,
  TicketTokenParamsSchema,
  UseTicketBodySchema,
  ListTicketsQuerySchema,
  TicketResponseSchema,
  TicketVerifyResponseSchema,
  TicketOrderListResponseSchema,
  TicketListResponseSchema,
} from "./tickets.schema.js";
import {
  handleGetOrderTickets,
  handleGetTicket,
  handleVerifyTicket,
  handleUseTicket,
  handleListTickets,
} from "./tickets.controller.js";

/**
 * Tiket / bukti pemenuhan (LJ-2.7, PRD 04 §3 & §5).
 *
 * Tiket terbit OTOMATIS saat pesanan LUNAS — tidak ada endpoint "terbitkan tiket".
 * Verifikasi token bersifat PUBLIK agar petugas lokasi bisa memeriksa tanpa login.
 */
export async function lapakTicketsRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const LAPAK = APP_CODES.LAPAK_JAMBI_WEB;

  // ── Publik: verifikasi tiket (petugas lokasi / warga) ───────────────────────
  app.get("/verify/:token", {
    schema: {
      description: "Periksa tiket lewat token QR atau kode pendek (publik, tanpa data pribadi)",
      tags: ["lapak-tickets"],
      params: TicketTokenParamsSchema,
      response: { 200: TicketVerifyResponseSchema },
    },
  }, handleVerifyTicket);

  // ── Warga ───────────────────────────────────────────────────────────────────
  app.get("/order/:orderId", {
    schema: {
      description: "Tiket milik pesanan sendiri",
      tags: ["lapak-tickets"],
      params: TicketOrderParamsSchema,
      response: { 200: TicketOrderListResponseSchema },
    },
    preHandler: [fastify.authenticate],
  }, handleGetOrderTickets);

  app.get("/:id", {
    schema: {
      description: "Detail tiket (harus milik sendiri)",
      tags: ["lapak-tickets"],
      params: TicketParamsSchema,
      response: { 200: TicketResponseSchema },
    },
    preHandler: [fastify.authenticate],
  }, handleGetTicket);

  // ── Petugas lokasi / CMS ───────────────────────────────────────────────────
  app.get("/", {
    schema: {
      description: "Daftar tiket CMS — tersaring lingkup OPD",
      tags: ["lapak-tickets"],
      querystring: ListTicketsQuerySchema,
      response: { 200: TicketListResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("ticket:read", { app: LAPAK }),
    ],
  }, handleListTickets);

  app.post("/:id/use", {
    schema: {
      description: "Tandai tiket terpakai (scan petugas). Sekali pakai — scan kedua ditolak 409.",
      tags: ["lapak-tickets"],
      params: TicketParamsSchema,
      body: UseTicketBodySchema,
      response: { 200: TicketResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("ticket:approve", { app: LAPAK }),
    ],
  }, handleUseTicket);
}
