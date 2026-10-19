import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { APP_CODES } from "~/common/constants/index.js";
import {
  CreateRegulationBodySchema,
  ListRegulationsQuerySchema,
  PublicListRegulationsQuerySchema,
  RegulationDeleteResponseSchema,
  RegulationIdParamsSchema,
  RegulationListResponseSchema,
  RegulationResponseSchema,
  RegulationSlugParamsSchema,
  RegulationStatusBodySchema,
  UpdateRegulationBodySchema,
} from "./regulations.schema.js";
import {
  handleCreateRegulation,
  handleDeleteRegulation,
  handleGetPublicRegulationBySlug,
  handleGetRegulationById,
  handleListPublicRegulations,
  handleListRegulations,
  handleSetRegulationStatus,
  handleUpdateRegulation,
} from "./regulations.controller.js";

const TAGS = ["bapenda-regulations"];
const guard = (fastify: FastifyInstance, permission: string) => [
  fastify.authenticate,
  fastify.requirePermission(permission, { app: APP_CODES.BAPENDA_PROFILE }),
];

export async function regulationsRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // ── Publik ──────────────────────────────────────────────────────────────────
  app.get("/public", {
    schema: {
      description: "Daftar regulasi terbit (PDF), filter pencarian",
      tags: TAGS,
      querystring: PublicListRegulationsQuerySchema,
      response: { 200: RegulationListResponseSchema },
    },
  }, handleListPublicRegulations);

  app.get("/public/:slug", {
    schema: {
      description: "Detail regulasi terbit berdasarkan slug",
      tags: TAGS,
      params: RegulationSlugParamsSchema,
      response: { 200: RegulationResponseSchema },
    },
  }, handleGetPublicRegulationBySlug);

  // ── CMS ─────────────────────────────────────────────────────────────────────
  app.get("/", {
    schema: {
      description: "Daftar regulasi untuk CMS",
      tags: TAGS,
      querystring: ListRegulationsQuerySchema,
      response: { 200: RegulationListResponseSchema },
    },
    preHandler: guard(fastify, "regulation:list"),
  }, handleListRegulations);

  app.get("/:id", {
    schema: {
      description: "Detail regulasi untuk edit",
      tags: TAGS,
      params: RegulationIdParamsSchema,
      response: { 200: RegulationResponseSchema },
    },
    preHandler: guard(fastify, "regulation:read"),
  }, handleGetRegulationById);

  app.post("/", {
    schema: {
      description: "Membuat regulasi (selalu draft)",
      tags: TAGS,
      body: CreateRegulationBodySchema,
      response: { 201: RegulationResponseSchema },
    },
    preHandler: guard(fastify, "regulation:create"),
  }, handleCreateRegulation);

  app.put("/:id", {
    schema: {
      description: "Memperbarui regulasi",
      tags: TAGS,
      params: RegulationIdParamsSchema,
      body: UpdateRegulationBodySchema,
      response: { 200: RegulationResponseSchema },
    },
    preHandler: guard(fastify, "regulation:update"),
  }, handleUpdateRegulation);

  app.patch("/:id/status", {
    schema: {
      description: "Terbitkan / tarik regulasi ke draft (PDF divalidasi saat terbit)",
      tags: TAGS,
      params: RegulationIdParamsSchema,
      body: RegulationStatusBodySchema,
      response: { 200: RegulationResponseSchema },
    },
    preHandler: guard(fastify, "regulation:publish"),
  }, handleSetRegulationStatus);

  app.delete("/:id", {
    schema: {
      description: "Soft-delete regulasi + bersihkan berkas ImageKit",
      tags: TAGS,
      params: RegulationIdParamsSchema,
      response: { 200: RegulationDeleteResponseSchema },
    },
    preHandler: guard(fastify, "regulation:delete"),
  }, handleDeleteRegulation);
}
