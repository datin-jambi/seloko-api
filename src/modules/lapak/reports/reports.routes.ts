import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { APP_CODES } from "~/common/constants/index.js";
import {
  TransactionQuerySchema,
  ExportQuerySchema,
  TransactionListResponseSchema,
} from "./reports.schema.js";
import { handleListTransactions, handleExportTransactions } from "./reports.controller.js";

/**
 * Daftar transaksi lintas OPD + ekspor (LJ-3.2).
 *
 * Ekspor CSV dijaga izin `report:export` — berbeda dari `report:read`. Alasannya:
 * membaca satu halaman di layar berbeda risikonya dengan mengunduh seluruh
 * riwayat transaksi ke berkas yang bisa berpindah tangan.
 */
export async function lapakReportsRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const LAPAK = APP_CODES.LAPAK_JAMBI_WEB;

  app.get("/transactions", {
    schema: {
      description: "Daftar transaksi lintas OPD (lingkup OPD, pemohon dimasking) + ringkasan per status",
      tags: ["lapak-reports"],
      querystring: TransactionQuerySchema,
      response: { 200: TransactionListResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("report:read", { app: LAPAK }),
    ],
  }, handleListTransactions);

  app.get("/transactions/export", {
    schema: {
      description: "Unduh daftar transaksi sebagai CSV (aman dibuka di Excel, pemohon dimasking)",
      tags: ["lapak-reports"],
      querystring: ExportQuerySchema,
      // Respons berupa berkas, bukan JSON — skema body dilewati.
      produces: ["text/csv"],
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("report:export", { app: LAPAK }),
    ],
  }, handleExportTransactions);
}
