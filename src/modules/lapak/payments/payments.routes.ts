import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { APP_CODES } from "~/common/constants/index.js";
import {
  PaymentParamsSchema,
  PaymentOrderParamsSchema,
  SubmitProofBodySchema,
  RejectPaymentBodySchema,
  VerifyPaymentBodySchema,
  ListPaymentsQuerySchema,
  PaymentResponseSchema,
  PaymentListResponseSchema,
  OrderPaymentListResponseSchema,
} from "./payments.schema.js";
import {
  handleGetOrderPayments,
  handleGetPayment,
  handleSubmitProof,
  handleListPayments,
  handleVerifyPayment,
  handleRejectPayment,
} from "./payments.controller.js";

/**
 * Pembayaran transfer manual (LJ-2.6, PRD 04 §E).
 *
 * Fase awal: `MANUAL_TRANSFER` — warga unggah bukti (ImageKit), admin OPD
 * konfirmasi. Kolom gateway sudah disiapkan sehingga VA/QRIS Bank Jambi nanti
 * hanya menambah adapter.
 */
export async function lapakPaymentsRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const LAPAK = APP_CODES.LAPAK_JAMBI_WEB;

  // ── Warga ───────────────────────────────────────────────────────────────────
  app.get("/order/:orderId", {
    schema: {
      description: "Pembayaran milik pesanan sendiri (riwayat lengkap)",
      tags: ["lapak-payments"],
      params: PaymentOrderParamsSchema,
      response: { 200: OrderPaymentListResponseSchema },
    },
    preHandler: [fastify.authenticate],
  }, handleGetOrderPayments);

  app.get("/:id", {
    schema: {
      description: "Detail pembayaran (harus milik sendiri)",
      tags: ["lapak-payments"],
      params: PaymentParamsSchema,
      response: { 200: PaymentResponseSchema },
    },
    preHandler: [fastify.authenticate],
  }, handleGetPayment);

  app.post("/:id/proof", {
    schema: {
      description: "Unggah bukti transfer. proofUrl & proofFileId WAJIB dari ImageKit (POST /api/storage/upload?module=lapak&subFolder=payments)",
      tags: ["lapak-payments"],
      params: PaymentParamsSchema,
      body: SubmitProofBodySchema,
      response: { 200: PaymentResponseSchema },
    },
    preHandler: [fastify.authenticate],
  }, handleSubmitProof);

  // ── CMS ─────────────────────────────────────────────────────────────────────
  app.get("/", {
    schema: {
      description: "Daftar pembayaran CMS — tersaring lingkup OPD",
      tags: ["lapak-payments"],
      querystring: ListPaymentsQuerySchema,
      response: { 200: PaymentListResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("payment:read", { app: LAPAK }),
    ],
  }, handleListPayments);

  app.post("/:id/verify", {
    schema: {
      description: "Konfirmasi pembayaran → LUNAS (pembayaran, pesanan, dan SKRD sekaligus)",
      tags: ["lapak-payments"],
      params: PaymentParamsSchema,
      body: VerifyPaymentBodySchema,
      response: { 200: PaymentResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("payment:approve", { app: LAPAK }),
    ],
  }, handleVerifyPayment);

  app.post("/:id/reject", {
    schema: {
      description: "Tolak bukti pembayaran — warga boleh unggah ulang, riwayat tetap tersimpan",
      tags: ["lapak-payments"],
      params: PaymentParamsSchema,
      body: RejectPaymentBodySchema,
      response: { 200: PaymentResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("payment:approve", { app: LAPAK }),
    ],
  }, handleRejectPayment);
}
