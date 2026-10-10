import type { FastifyReply, FastifyRequest } from "fastify";
import { HttpStatus } from "~/common/errors/index.js";
import {
  listUptds,
  getPublicUptds,
  getUptdById,
  getUptdByCode,
  createUptd,
  updateUptd,
  setUptdActive,
  setUptdPublicMap,
  deleteUptd,
} from "./uptds.service.js";
import type {
  ListUptdsQuery,
  PublicListUptdsQuery,
  UptdParams,
  UptdCodeParams,
  CreateUptdBody,
  UpdateUptdBody,
  SetUptdActiveBody,
  SetUptdPublicMapBody,
} from "./uptds.schema.js";

export async function handleListUptds(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = request.query as ListUptdsQuery;
  const result = await listUptds(query);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Daftar UPTD Samsat berhasil diambil",
    data: result.data,
    meta: result.meta,
  });
}

export async function handleGetPublicUptds(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = request.query as PublicListUptdsQuery;
  const data = await getPublicUptds(query);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Daftar kantor layanan Samsat publik berhasil diambil",
    data,
  });
}

export async function handleGetUptdById(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as UptdParams;
  const data = await getUptdById(id);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Detail UPTD Samsat berhasil diambil",
    data,
  });
}

export async function handleGetUptdByCode(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { code } = request.params as UptdCodeParams;
  const data = await getUptdByCode(code);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Detail UPTD Samsat berhasil diambil",
    data,
  });
}

export async function handleCreateUptd(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const body = request.body as CreateUptdBody;
  const data = await createUptd(body);

  return reply.status(HttpStatus.CREATED).send({
    statusCode: HttpStatus.CREATED,
    code: "SUCCESS",
    message: "UPTD Samsat baru berhasil ditambahkan",
    data,
  });
}

export async function handleUpdateUptd(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as UptdParams;
  const body = request.body as UpdateUptdBody;
  const data = await updateUptd(id, body);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "Data UPTD Samsat berhasil diperbarui",
    data,
  });
}

export async function handleSetUptdActive(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as UptdParams;
  const { isActive } = request.body as SetUptdActiveBody;
  const data = await setUptdActive(id, isActive);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: `Status UPTD berhasil diubah menjadi ${isActive ? "aktif" : "non-aktif"}`,
    data,
  });
}

export async function handleSetUptdPublicMap(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as UptdParams;
  const { showOnPublicMap } = request.body as SetUptdPublicMapBody;
  const data = await setUptdPublicMap(id, showOnPublicMap);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: `Visibilitas peta publik berhasil diubah menjadi ${showOnPublicMap ? "tampil" : "sembunyi"}`,
    data,
  });
}

export async function handleDeleteUptd(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as UptdParams;
  const result = await deleteUptd(id);

  return reply.status(HttpStatus.OK).send({
    statusCode: HttpStatus.OK,
    code: "SUCCESS",
    message: "UPTD Samsat berhasil dihapus",
    data: result,
  });
}
