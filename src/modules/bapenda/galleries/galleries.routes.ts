import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { APP_CODES } from "~/common/constants/index.js";
import {
  AddGalleryItemsBodySchema,
  CreateGalleryBodySchema,
  GalleryDeleteResponseSchema,
  GalleryIdParamsSchema,
  GalleryItemListResponseSchema,
  GalleryItemParamsSchema,
  GalleryListResponseSchema,
  GalleryResponseSchema,
  GallerySlugParamsSchema,
  GalleryStatusBodySchema,
  ListGalleriesQuerySchema,
  PublicListGalleriesQuerySchema,
  ReorderGalleryItemsBodySchema,
  UpdateGalleryBodySchema,
} from "./galleries.schema.js";
import {
  handleAddGalleryItems,
  handleChangeGalleryStatus,
  handleCreateGallery,
  handleDeleteGallery,
  handleDeleteGalleryItem,
  handleGetGalleryById,
  handleGetPublicGalleryBySlug,
  handleListGalleries,
  handleListPublicGalleries,
  handleReorderGalleryItems,
  handleUpdateGallery,
} from "./galleries.controller.js";

const TAGS = ["bapenda-galleries"];
const guard = (fastify: FastifyInstance, permission: string) => [
  fastify.authenticate,
  fastify.requirePermission(permission, { app: APP_CODES.BAPENDA_PROFILE }),
];

export async function galleriesRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // ── 1. Publik ───────────────────────────────────────────────────────────────
  app.get("/public", {
    schema: {
      description: "Daftar galeri terbit (beserta jumlah item)",
      tags: TAGS,
      querystring: PublicListGalleriesQuerySchema,
      response: { 200: GalleryListResponseSchema },
    },
  }, handleListPublicGalleries);

  app.get("/public/:slug", {
    schema: {
      description: "Detail galeri terbit beserta seluruh item",
      tags: TAGS,
      params: GallerySlugParamsSchema,
      response: { 200: GalleryResponseSchema },
    },
  }, handleGetPublicGalleryBySlug);

  // ── 2. CMS: Galeri ──────────────────────────────────────────────────────────
  app.get("/", {
    schema: {
      description: "Daftar galeri CMS (penulis tanpa hak approve hanya melihat miliknya)",
      tags: TAGS,
      querystring: ListGalleriesQuerySchema,
      response: { 200: GalleryListResponseSchema },
    },
    preHandler: guard(fastify, "gallery:list"),
  }, handleListGalleries);

  app.get("/:id", {
    schema: {
      description: "Detail galeri beserta item",
      tags: TAGS,
      params: GalleryIdParamsSchema,
      response: { 200: GalleryResponseSchema },
    },
    preHandler: guard(fastify, "gallery:read"),
  }, handleGetGalleryById);

  app.post("/", {
    schema: {
      description: "Buat galeri (status DRAFT), item awal opsional",
      tags: TAGS,
      body: CreateGalleryBodySchema,
      response: { 201: GalleryResponseSchema },
    },
    preHandler: guard(fastify, "gallery:create"),
  }, handleCreateGallery);

  app.put("/:id", {
    schema: {
      description: "Perbarui data galeri (penulis: hanya DRAFT/REJECTED)",
      tags: TAGS,
      params: GalleryIdParamsSchema,
      body: UpdateGalleryBodySchema,
      response: { 200: GalleryResponseSchema },
    },
    preHandler: guard(fastify, "gallery:update"),
  }, handleUpdateGallery);

  app.patch("/:id/status", {
    schema: {
      description: "Transisi alur review: submit/approve/reject/publish/unpublish",
      tags: TAGS,
      params: GalleryIdParamsSchema,
      body: GalleryStatusBodySchema,
      response: { 200: GalleryResponseSchema },
    },
    preHandler: guard(fastify, "gallery:read"),
  }, handleChangeGalleryStatus);

  app.delete("/:id", {
    schema: {
      description: "Soft-delete galeri + bersihkan seluruh berkas ImageKit",
      tags: TAGS,
      params: GalleryIdParamsSchema,
      response: { 200: GalleryDeleteResponseSchema },
    },
    preHandler: guard(fastify, "gallery:delete"),
  }, handleDeleteGallery);

  // ── 3. CMS: Item ────────────────────────────────────────────────────────────
  app.post("/:id/items", {
    schema: {
      description: "Tambah item ke galeri (ditaruh di urutan paling akhir)",
      tags: TAGS,
      params: GalleryIdParamsSchema,
      body: AddGalleryItemsBodySchema,
      response: { 201: GalleryItemListResponseSchema },
    },
    preHandler: guard(fastify, "gallery:update"),
  }, handleAddGalleryItems);

  app.patch("/:id/items/reorder", {
    schema: {
      description: "Atur ulang urutan item (itemIds wajib memuat seluruh item)",
      tags: TAGS,
      params: GalleryIdParamsSchema,
      body: ReorderGalleryItemsBodySchema,
      response: { 200: GalleryItemListResponseSchema },
    },
    preHandler: guard(fastify, "gallery:update"),
  }, handleReorderGalleryItems);

  app.delete("/:id/items/:itemId", {
    schema: {
      description: "Hapus satu item + bersihkan berkasnya di ImageKit",
      tags: TAGS,
      params: GalleryItemParamsSchema,
      response: { 200: GalleryDeleteResponseSchema },
    },
    preHandler: guard(fastify, "gallery:update"),
  }, handleDeleteGalleryItem);
}
