import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { APP_CODES } from "~/common/constants/index.js";
import {
  ListOrganizationsQuerySchema,
  ListOrganizationsResponseSchema,
  PublicListOrganizationsQuerySchema,
  PublicOrganizationListResponseSchema,
  PublicOrganizationResponseSchema,
  OrganizationParamsSchema,
  OrganizationCodeParamsSchema,
  OrganizationResponseSchema,
  CreateOrganizationBodySchema,
  CreateOrganizationResponseSchema,
  UpdateOrganizationBodySchema,
  SetOrganizationActiveBodySchema,
  SetOrganizationActiveResponseSchema,
  DeleteOrganizationResponseSchema,
} from "./organizations.schema.js";
import {
  handleListPublicOrganizations,
  handleGetPublicOrganization,
  handleListOrganizations,
  handleGetOrganization,
  handleCreateOrganization,
  handleUpdateOrganization,
  handleSetOrganizationActive,
  handleDeleteOrganization,
} from "./organizations.controller.js";

export async function organizationsRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const guard = (permission: string) => [
    fastify.authenticate,
    fastify.requirePermission(permission, { app: APP_CODES.SELOKO }),
  ];

  // ── Publik: filter katalog & profil OPD ────────────────────────────────────
  // Tanpa login: daftar OPD hanya berisi kolom identitas, tidak ada penugasan.
  app.get("/public", {
    schema: {
      description: "Daftar OPD aktif untuk filter katalog publik",
      tags: ["organizations"],
      querystring: PublicListOrganizationsQuerySchema,
      response: { 200: PublicOrganizationListResponseSchema },
    },
  }, handleListPublicOrganizations);

  app.get("/public/:code", {
    schema: {
      description: "Profil OPD publik berdasarkan kode (mis. /lapak/opd/BPSDM)",
      tags: ["organizations"],
      params: OrganizationCodeParamsSchema,
      response: { 200: PublicOrganizationResponseSchema },
    },
  }, handleGetPublicOrganization);

  // ── CMS: master OPD ───────────────────────────────────────────────────────
  app.get("/", {
    schema: {
      description: "Daftar organisasi (OPD/UPTD) dengan filter dan paginasi",
      tags: ["organizations"],
      querystring: ListOrganizationsQuerySchema,
      response: { 200: ListOrganizationsResponseSchema },
    },
    preHandler: guard("organization:list"),
  }, handleListOrganizations);

  app.get("/:id", {
    schema: {
      description: "Detail organisasi beserta induk dan jumlah turunan",
      tags: ["organizations"],
      params: OrganizationParamsSchema,
      response: { 200: OrganizationResponseSchema },
    },
    preHandler: guard("organization:read"),
  }, handleGetOrganization);

  app.post("/", {
    schema: {
      description: "Menambah organisasi baru",
      tags: ["organizations"],
      body: CreateOrganizationBodySchema,
      response: { 201: CreateOrganizationResponseSchema },
    },
    preHandler: guard("organization:create"),
  }, handleCreateOrganization);

  app.put("/:id", {
    schema: {
      description: "Memperbarui organisasi (termasuk memindahkan induk)",
      tags: ["organizations"],
      params: OrganizationParamsSchema,
      body: UpdateOrganizationBodySchema,
      response: { 200: CreateOrganizationResponseSchema },
    },
    preHandler: guard("organization:update"),
  }, handleUpdateOrganization);

  app.patch("/:id/active", {
    schema: {
      description: "Mengaktifkan/menonaktifkan organisasi beserta seluruh turunannya",
      tags: ["organizations"],
      params: OrganizationParamsSchema,
      body: SetOrganizationActiveBodySchema,
      response: { 200: SetOrganizationActiveResponseSchema },
    },
    preHandler: guard("organization:update"),
  }, handleSetOrganizationActive);

  app.delete("/:id", {
    schema: {
      description: "Menghapus (soft-delete) organisasi yang tidak punya turunan/penugasan",
      tags: ["organizations"],
      params: OrganizationParamsSchema,
      response: { 200: DeleteOrganizationResponseSchema },
    },
    preHandler: guard("organization:delete"),
  }, handleDeleteOrganization);
}
