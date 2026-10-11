import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  UploadMediaQuerySchema,
  UploadMediaResponseSchema,
  GetMediaParamsSchema,
  GetMediaResponseSchema,
  DeleteMediaParamsSchema,
  DeleteMediaResponseSchema,
} from "./storage.schema.js";
import {
  handleUploadMedia,
  handleGetMediaDetails,
  handleDeleteMedia,
} from "./storage.controller.js";

export async function storageRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // ── POST /api/storage/upload ────────────────────────────────────────────────
  app.post("/upload", {
    schema: {
      description: "Mengunggah berkas multimedia/dokumen ke ImageKit dengan isolasi folder per modul & aplikasi",
      tags: ["storage"],
      querystring: UploadMediaQuerySchema,
      response: { 201: UploadMediaResponseSchema },
    },
    preHandler: [fastify.authenticate],
  }, handleUploadMedia);

  // ── GET /api/storage/:fileId ────────────────────────────────────────────────
  app.get("/:fileId", {
    schema: {
      description: "Mengambil informasi detail dan metadata berkas dari ImageKit berdasarkan fileId",
      tags: ["storage"],
      params: GetMediaParamsSchema,
      response: { 200: GetMediaResponseSchema },
    },
    preHandler: [fastify.authenticate],
  }, handleGetMediaDetails);

  // ── DELETE /api/storage/:fileId ─────────────────────────────────────────────
  app.delete("/:fileId", {
    schema: {
      description: "Menghapus berkas dari ImageKit berdasarkan fileId",
      tags: ["storage"],
      params: DeleteMediaParamsSchema,
      response: { 200: DeleteMediaResponseSchema },
    },
    preHandler: [fastify.authenticate],
  }, handleDeleteMedia);
}
