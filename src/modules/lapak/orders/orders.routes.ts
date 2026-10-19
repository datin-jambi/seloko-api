import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { APP_CODES } from "~/common/constants/index.js";
import {
  CartIdParamsSchema,
  OrderParamsSchema,
  CheckoutBodySchema,
  ListOrdersQuerySchema,
  QuoteResponseSchema,
  CheckoutResponseSchema,
  OrderDetailResponseSchema,
  OrderListResponseSchema,
} from "./orders.schema.js";
import {
  handleQuote,
  handleCheckout,
  handleGetOrder,
  handleListMyOrders,
  handleListOrdersCms,
} from "./orders.controller.js";

/**
 * Quote & checkout → pesanan (LJ-2.4, PRD 04 §4.F & §5).
 *
 * Warga: quote, checkout, lihat pesanannya sendiri.
 * CMS: daftar pesanan tersaring lingkup OPD — PII selalu termasking.
 */
export async function lapakOrdersRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const LAPAK = APP_CODES.LAPAK_JAMBI_WEB;

  // ── Warga ───────────────────────────────────────────────────────────────────
  app.get("/cart/:cartId/quote", {
    schema: {
      description: "Hitung rincian harga keranjang tanpa menyimpan apa pun",
      tags: ["lapak-orders"],
      params: CartIdParamsSchema,
      response: { 200: QuoteResponseSchema },
    },
    preHandler: [fastify.authenticate],
  }, handleQuote);

  app.post("/cart/:cartId/checkout", {
    schema: {
      description: "Buat pesanan dari keranjang: bekukan snapshot harga & konfirmasi reservasi",
      tags: ["lapak-orders"],
      params: CartIdParamsSchema,
      body: CheckoutBodySchema,
      response: { 201: CheckoutResponseSchema },
    },
    preHandler: [fastify.authenticate],
  }, handleCheckout);

  app.get("/mine", {
    schema: {
      description: "Pesanan milik warga yang login",
      tags: ["lapak-orders"],
      querystring: ListOrdersQuerySchema,
      response: { 200: OrderListResponseSchema },
    },
    preHandler: [fastify.authenticate],
  }, handleListMyOrders);

  app.get("/:id", {
    schema: {
      description: "Detail pesanan (harus milik sendiri). Data pemohon termasking.",
      tags: ["lapak-orders"],
      params: OrderParamsSchema,
      response: { 200: OrderDetailResponseSchema },
    },
    preHandler: [fastify.authenticate],
  }, handleGetOrder);

  // ── CMS ─────────────────────────────────────────────────────────────────────
  app.get("/", {
    schema: {
      description: "Daftar pesanan CMS — tersaring lingkup OPD, PII termasking",
      tags: ["lapak-orders"],
      querystring: ListOrdersQuerySchema,
      response: { 200: OrderListResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("order:read", { app: LAPAK }),
    ],
  }, handleListOrdersCms);
}
