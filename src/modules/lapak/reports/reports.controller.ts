import type { FastifyReply, FastifyRequest } from "fastify";
import { HttpStatus } from "~/common/errors/index.js";
import { listTransactions, exportTransactionsCsv } from "./reports.service.js";
import { accessibleOrganizationIds } from "../availability/availability.service.js";
import type { TransactionQuery, ExportQuery } from "./reports.schema.js";

async function scopeOf(request: FastifyRequest): Promise<string[] | null> {
  if (request.user.isSuperAdmin) return null;
  return accessibleOrganizationIds(request.user.sub, false);
}

export async function handleListTransactions(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = request.query as TransactionQuery;
  const result = await listTransactions(await scopeOf(request), query);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK, code: "SUCCESS",
    message: "Daftar transaksi berhasil diambil",
    data: result.data,
    summary: result.summary,
    meta: result.meta,
  });
}

/**
 * Ekspor CSV.
 *
 * Header `Content-Disposition: attachment` penting: tanpa itu browser membuka
 * isi CSV sebagai teks di tab, bukan mengunduhnya sebagai berkas.
 */
export async function handleExportTransactions(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = request.query as ExportQuery;
  const result = await exportTransactionsCsv(await scopeOf(request), query);

  return reply
    .status(HttpStatus.OK)
    .header("Content-Type", "text/csv; charset=utf-8")
    .header("Content-Disposition", `attachment; filename="${result.filename}"`)
    .header("X-Total-Rows", String(result.rowCount))
    .send(result.csv);
}
