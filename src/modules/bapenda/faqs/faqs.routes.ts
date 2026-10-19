import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { APP_CODES } from "~/common/constants/index.js";
import {
  CreateFaqBodySchema,
  CreateFaqCategoryBodySchema,
  FaqCategoryListResponseSchema,
  FaqCategoryResponseSchema,
  FaqDeleteResponseSchema,
  FaqIdParamsSchema,
  FaqListResponseSchema,
  FaqResponseSchema,
  FaqViewResponseSchema,
  ListFaqCategoriesQuerySchema,
  ListFaqsQuerySchema,
  PublicFaqListResponseSchema,
  PublicListFaqsQuerySchema,
  PublishFaqBodySchema,
  ReorderFaqsBodySchema,
  SetFaqCategoryActiveBodySchema,
  UpdateFaqBodySchema,
  UpdateFaqCategoryBodySchema,
} from "./faqs.schema.js";
import {
  handleCreateFaq,
  handleCreateFaqCategory,
  handleDeleteFaq,
  handleDeleteFaqCategory,
  handleGetFaqById,
  handleIncrementFaqView,
  handleListFaqCategories,
  handleListFaqs,
  handleListPublicFaqCategories,
  handleListPublicFaqs,
  handlePublishFaq,
  handleReorderFaqs,
  handleSetFaqCategoryActive,
  handleUpdateFaq,
  handleUpdateFaqCategory,
} from "./faqs.controller.js";

const TAGS = ["bapenda-faqs"];
const guard = (fastify: FastifyInstance, permission: string) => [
  fastify.authenticate,
  fastify.requirePermission(permission, { app: APP_CODES.BAPENDA_PROFILE }),
];

export async function faqsRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // ── 1. Publik ───────────────────────────────────────────────────────────────
  app.get("/public", {
    schema: {
      description: "Seluruh FAQ terbit (filter slug kategori & pencarian), urut kategori lalu urutan FAQ",
      tags: TAGS,
      querystring: PublicListFaqsQuerySchema,
      response: { 200: PublicFaqListResponseSchema },
    },
  }, handleListPublicFaqs);

  app.get("/public/categories", {
    schema: {
      description: "Daftar kategori FAQ aktif",
      tags: TAGS,
      response: { 200: FaqCategoryListResponseSchema },
    },
  }, handleListPublicFaqCategories);

  app.post("/public/:id/view", {
    schema: {
      description: "Tambah hitungan pembaca FAQ (hanya FAQ terbit)",
      tags: TAGS,
      params: FaqIdParamsSchema,
      response: { 200: FaqViewResponseSchema },
    },
  }, handleIncrementFaqView);

  // ── 2. CMS: Kategori FAQ ────────────────────────────────────────────────────
  app.get("/categories", {
    schema: {
      description: "Daftar kategori FAQ untuk CMS",
      tags: TAGS,
      querystring: ListFaqCategoriesQuerySchema,
      response: { 200: FaqCategoryListResponseSchema },
    },
    preHandler: guard(fastify, "faq-category:list"),
  }, handleListFaqCategories);

  app.post("/categories", {
    schema: {
      description: "Menambah kategori FAQ",
      tags: TAGS,
      body: CreateFaqCategoryBodySchema,
      response: { 201: FaqCategoryResponseSchema },
    },
    preHandler: guard(fastify, "faq-category:create"),
  }, handleCreateFaqCategory);

  app.put("/categories/:id", {
    schema: {
      description: "Memperbarui kategori FAQ",
      tags: TAGS,
      params: FaqIdParamsSchema,
      body: UpdateFaqCategoryBodySchema,
      response: { 200: FaqCategoryResponseSchema },
    },
    preHandler: guard(fastify, "faq-category:update"),
  }, handleUpdateFaqCategory);

  app.patch("/categories/:id/active", {
    schema: {
      description: "Mengaktifkan atau menonaktifkan kategori FAQ",
      tags: TAGS,
      params: FaqIdParamsSchema,
      body: SetFaqCategoryActiveBodySchema,
      response: { 200: FaqCategoryResponseSchema },
    },
    preHandler: guard(fastify, "faq-category:update"),
  }, handleSetFaqCategoryActive);

  app.delete("/categories/:id", {
    schema: {
      description: "Soft-delete kategori FAQ (409 bila masih dipakai)",
      tags: TAGS,
      params: FaqIdParamsSchema,
      response: { 200: FaqDeleteResponseSchema },
    },
    preHandler: guard(fastify, "faq-category:delete"),
  }, handleDeleteFaqCategory);

  // ── 3. CMS: FAQ ─────────────────────────────────────────────────────────────
  // Rute statis `/reorder` didaftarkan sebelum `/:id` agar tidak tertangkap param.
  app.patch("/reorder", {
    schema: {
      description: "Atur ulang urutan FAQ dalam satu kategori (faqIds wajib lengkap)",
      tags: TAGS,
      body: ReorderFaqsBodySchema,
      response: { 200: PublicFaqListResponseSchema },
    },
    preHandler: guard(fastify, "faq:update"),
  }, handleReorderFaqs);

  app.get("/", {
    schema: {
      description: "Daftar FAQ untuk CMS",
      tags: TAGS,
      querystring: ListFaqsQuerySchema,
      response: { 200: FaqListResponseSchema },
    },
    preHandler: guard(fastify, "faq:list"),
  }, handleListFaqs);

  app.get("/:id", {
    schema: {
      description: "Detail FAQ untuk edit",
      tags: TAGS,
      params: FaqIdParamsSchema,
      response: { 200: FaqResponseSchema },
    },
    preHandler: guard(fastify, "faq:read"),
  }, handleGetFaqById);

  app.post("/", {
    schema: {
      description: "Membuat FAQ (selalu draft; tanpa sortOrder ditaruh di akhir kategori)",
      tags: TAGS,
      body: CreateFaqBodySchema,
      response: { 201: FaqResponseSchema },
    },
    preHandler: guard(fastify, "faq:create"),
  }, handleCreateFaq);

  app.put("/:id", {
    schema: {
      description: "Memperbarui FAQ",
      tags: TAGS,
      params: FaqIdParamsSchema,
      body: UpdateFaqBodySchema,
      response: { 200: FaqResponseSchema },
    },
    preHandler: guard(fastify, "faq:update"),
  }, handleUpdateFaq);

  app.patch("/:id/publish", {
    schema: {
      description: "Terbitkan / tarik FAQ ke draft",
      tags: TAGS,
      params: FaqIdParamsSchema,
      body: PublishFaqBodySchema,
      response: { 200: FaqResponseSchema },
    },
    preHandler: guard(fastify, "faq:publish"),
  }, handlePublishFaq);

  app.delete("/:id", {
    schema: {
      description: "Soft-delete FAQ",
      tags: TAGS,
      params: FaqIdParamsSchema,
      response: { 200: FaqDeleteResponseSchema },
    },
    preHandler: guard(fastify, "faq:delete"),
  }, handleDeleteFaq);
}
