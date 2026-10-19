import type { FastifyReply, FastifyRequest } from "fastify";
import { HttpStatus } from "~/common/errors/index.js";
import * as faq from "./faqs.service.js";
import type {
  CreateFaqBody,
  CreateFaqCategoryBody,
  FaqIdParams,
  ListFaqCategoriesQuery,
  ListFaqsQuery,
  PublicListFaqsQuery,
  PublishFaqBody,
  ReorderFaqsBody,
  SetFaqCategoryActiveBody,
  UpdateFaqBody,
  UpdateFaqCategoryBody,
} from "./faqs.schema.js";

function send(reply: FastifyReply, statusCode: number, message: string, data: unknown, meta?: unknown) {
  return reply.status(statusCode).send({
    statusCode,
    code: "SUCCESS",
    message,
    data,
    ...(meta !== undefined && { meta }),
  });
}

// ─── Publik ───────────────────────────────────────────────────────────────────
export async function handleListPublicFaqs(request: FastifyRequest, reply: FastifyReply) {
  const data = await faq.listPublicFaqs(request.query as PublicListFaqsQuery);
  return send(reply, HttpStatus.OK, "Daftar FAQ berhasil diambil", data);
}

export async function handleListPublicFaqCategories(_request: FastifyRequest, reply: FastifyReply) {
  return send(reply, HttpStatus.OK, "Daftar kategori FAQ berhasil diambil", await faq.listPublicFaqCategories());
}

export async function handleIncrementFaqView(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as FaqIdParams;
  return send(reply, HttpStatus.OK, "Jumlah pembaca FAQ diperbarui", await faq.incrementFaqView(id));
}

// ─── CMS: FAQ ─────────────────────────────────────────────────────────────────
export async function handleListFaqs(request: FastifyRequest, reply: FastifyReply) {
  const result = await faq.listFaqs(request.query as ListFaqsQuery);
  return send(reply, HttpStatus.OK, "Daftar FAQ berhasil diambil", result.data, result.meta);
}

export async function handleGetFaqById(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as FaqIdParams;
  return send(reply, HttpStatus.OK, "Detail FAQ berhasil diambil", await faq.getFaqById(id));
}

export async function handleCreateFaq(request: FastifyRequest, reply: FastifyReply) {
  const data = await faq.createFaq(request.user.sub, request.body as CreateFaqBody);
  return send(reply, HttpStatus.CREATED, "FAQ berhasil dibuat sebagai draft", data);
}

export async function handleUpdateFaq(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as FaqIdParams;
  const data = await faq.updateFaq(request.user.sub, id, request.body as UpdateFaqBody);
  return send(reply, HttpStatus.OK, "FAQ berhasil diperbarui", data);
}

export async function handlePublishFaq(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as FaqIdParams;
  const { isPublished } = request.body as PublishFaqBody;
  const data = await faq.setFaqPublished(request.user.sub, id, isPublished);
  return send(reply, HttpStatus.OK, isPublished ? "FAQ berhasil diterbitkan" : "FAQ ditarik ke draft", data);
}

export async function handleDeleteFaq(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as FaqIdParams;
  return send(reply, HttpStatus.OK, "FAQ berhasil dihapus", await faq.deleteFaq(id));
}

export async function handleReorderFaqs(request: FastifyRequest, reply: FastifyReply) {
  const { categoryId, faqIds } = request.body as ReorderFaqsBody;
  return send(reply, HttpStatus.OK, "Urutan FAQ berhasil diperbarui", await faq.reorderFaqs(categoryId, faqIds));
}

// ─── CMS: Kategori ────────────────────────────────────────────────────────────
export async function handleListFaqCategories(request: FastifyRequest, reply: FastifyReply) {
  const data = await faq.listFaqCategories(request.query as ListFaqCategoriesQuery);
  return send(reply, HttpStatus.OK, "Daftar kategori FAQ berhasil diambil", data);
}

export async function handleCreateFaqCategory(request: FastifyRequest, reply: FastifyReply) {
  const data = await faq.createFaqCategory(request.body as CreateFaqCategoryBody);
  return send(reply, HttpStatus.CREATED, "Kategori FAQ berhasil dibuat", data);
}

export async function handleUpdateFaqCategory(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as FaqIdParams;
  const data = await faq.updateFaqCategory(id, request.body as UpdateFaqCategoryBody);
  return send(reply, HttpStatus.OK, "Kategori FAQ berhasil diperbarui", data);
}

export async function handleSetFaqCategoryActive(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as FaqIdParams;
  const { isActive } = request.body as SetFaqCategoryActiveBody;
  const data = await faq.setFaqCategoryActive(id, isActive);
  return send(reply, HttpStatus.OK, isActive ? "Kategori FAQ diaktifkan" : "Kategori FAQ dinonaktifkan", data);
}

export async function handleDeleteFaqCategory(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as FaqIdParams;
  return send(reply, HttpStatus.OK, "Kategori FAQ berhasil dihapus", await faq.deleteFaqCategory(id));
}
