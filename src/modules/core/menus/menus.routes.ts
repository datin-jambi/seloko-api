import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { APP_CODES } from "~/common/constants/index.js";
import {
  GetMyMenusQuerySchema,
  GetMyMenusResponseSchema,
  ListMenusQuerySchema,
  ListMenusResponseSchema,
  MenuParamsSchema,
  GetMenuResponseSchema,
  CreateMenuBodySchema,
  CreateMenuResponseSchema,
  UpdateMenuBodySchema,
  UpdateMenuResponseSchema,
  SetMenuActiveBodySchema,
  SetMenuActiveResponseSchema,
  ReorderMenusBodySchema,
  ReorderMenusResponseSchema,
  DeleteMenuResponseSchema,
} from "./menus.schema.js";
import {
  handleGetMyMenus,
  handleListMenus,
  handleGetMenu,
  handleCreateMenu,
  handleUpdateMenu,
  handleSetMenuActive,
  handleReorderMenus,
  handleDeleteMenu,
} from "./menus.controller.js";

export async function menusRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // ── GET /menus/me ───────────────────────────────────────────────────────────
  // WAJIB sebelum /:id: mengembalikan pohon navigasi sidebar yang sudah difilter
  // sesuai permission dan role milik pemanggil pada aplikasi aktif.
  app.get("/me", {
    schema: {
      description: "Pohon menu sidebar milik pemanggil yang sudah difilter sesuai hak akses",
      tags: ["menus"],
      querystring: GetMyMenusQuerySchema,
      response: { 200: GetMyMenusResponseSchema },
    },
    preHandler: [fastify.authenticate],
  }, handleGetMyMenus);

  // ── GET /menus ──────────────────────────────────────────────────────────────
  app.get("/", {
    schema: {
      description: "Daftar menu CMS (flat terpaginasi atau pohon penuh via ?tree=true)",
      tags: ["menus"],
      querystring: ListMenusQuerySchema,
      response: { 200: ListMenusResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("application:read", { app: APP_CODES.SELOKO }),
    ],
  }, handleListMenus);

  // ── PATCH /menus/reorder ────────────────────────────────────────────────────
  // Rute statis ditaruh sebelum /:id agar router tidak mencocokkan "reorder" sebagai param ID.
  app.patch("/reorder", {
    schema: {
      description: "Update urutan sortOrder menu secara massal",
      tags: ["menus"],
      body: ReorderMenusBodySchema,
      response: { 200: ReorderMenusResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("application:update", { app: APP_CODES.SELOKO }),
    ],
  }, handleReorderMenus);

  // ── GET /menus/:id ──────────────────────────────────────────────────────────
  app.get("/:id", {
    schema: {
      description: "Detail lengkap menu beserta parent, children, permission, dan role pembatas",
      tags: ["menus"],
      params: MenuParamsSchema,
      response: { 200: GetMenuResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("application:read", { app: APP_CODES.SELOKO }),
    ],
  }, handleGetMenu);

  // ── POST /menus ─────────────────────────────────────────────────────────────
  app.post("/", {
    schema: {
      description: "Tambah item menu baru dalam aplikasi",
      tags: ["menus"],
      body: CreateMenuBodySchema,
      response: { 201: CreateMenuResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("application:update", { app: APP_CODES.SELOKO }),
    ],
  }, handleCreateMenu);

  // ── PATCH /menus/:id ────────────────────────────────────────────────────────
  app.patch("/:id", {
    schema: {
      description: "Perbarui metadata, hierarki parent, permission, atau role pembatas menu",
      tags: ["menus"],
      params: MenuParamsSchema,
      body: UpdateMenuBodySchema,
      response: { 200: UpdateMenuResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("application:update", { app: APP_CODES.SELOKO }),
    ],
  }, handleUpdateMenu);

  // ── PATCH /menus/:id/activate ───────────────────────────────────────────────
  app.patch("/:id/activate", {
    schema: {
      description: "Aktifkan atau nonaktifkan visibilitas menu",
      tags: ["menus"],
      params: MenuParamsSchema,
      body: SetMenuActiveBodySchema,
      response: { 200: SetMenuActiveResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("application:update", { app: APP_CODES.SELOKO }),
    ],
  }, handleSetMenuActive);

  // ── DELETE /menus/:id ───────────────────────────────────────────────────────
  app.delete("/:id", {
    schema: {
      description: "Hapus menu permanen (cascade menghapus sub-menu di bawahnya)",
      tags: ["menus"],
      params: MenuParamsSchema,
      response: { 200: DeleteMenuResponseSchema },
    },
    preHandler: [
      fastify.authenticate,
      fastify.requirePermission("application:update", { app: APP_CODES.SELOKO }),
    ],
  }, handleDeleteMenu);
}
