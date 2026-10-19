import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { PublicStatsQuerySchema, PublicStatsResponseSchema } from "./public-stats.schema.js";
import { handlePublicStats } from "./public-stats.controller.js";

/**
 * Transparansi PAD publik (LJ-3.3).
 *
 * Rute PUBLIK — tanpa login, tanpa header `X-App-Code` khusus. Siapa pun boleh
 * melihat berapa penerimaan retribusi dari layanan yang mereka gunakan.
 *
 * Tidak ada PII dan tidak ada nominal transaksi tunggal (lihat public-stats.service.ts).
 */
export async function lapakPublicStatsRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get("/", {
    schema: {
      description: "Ringkasan penerimaan retribusi (agregat per kategori & bulan, tanpa PII)",
      tags: ["lapak-public"],
      querystring: PublicStatsQuerySchema,
      response: { 200: PublicStatsResponseSchema },
    },
  }, handlePublicStats);
}
