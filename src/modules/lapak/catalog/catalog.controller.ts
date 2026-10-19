import type { FastifyReply, FastifyRequest } from "fastify";
import { HttpStatus } from "~/common/errors/index.js";
import { getPublicOrganizationProducts, getPublicOrganizationProfile } from "./catalog.service.js";
import type { CatalogOrgParams, CatalogOrgProductsQuery } from "./catalog.schema.js";

export async function handleGetOrganizationProfile(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { code } = request.params as CatalogOrgParams;
  const data = await getPublicOrganizationProfile(code);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Profil OPD berhasil diambil",
    data,
  });
}

export async function handleGetOrganizationProducts(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { code } = request.params as CatalogOrgParams;
  const query = request.query as CatalogOrgProductsQuery;
  const result = await getPublicOrganizationProducts(code, query);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Produk OPD berhasil diambil",
    data: result.data,
    meta: result.meta,
  });
}
