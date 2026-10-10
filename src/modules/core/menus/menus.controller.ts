import type { FastifyRequest, FastifyReply } from "fastify";
import { ok } from "~/common/types/index.js";
import {
  getMyMenus,
  listMenus,
  getMenuById,
  createMenu,
  updateMenu,
  setMenuActive,
  reorderMenus,
  deleteMenu,
} from "./menus.service.js";
import type {
  GetMyMenusQuery,
  ListMenusQuery,
  MenuParams,
  CreateMenuBody,
  UpdateMenuBody,
  SetMenuActiveBody,
  ReorderMenusBody,
} from "./menus.schema.js";

// ─── 1. Get My Menus (Sidebar) ────────────────────────────────────────────────
export async function handleGetMyMenus(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { sub, isSuperAdmin } = request.user;
  const callerAppCode = request.appCode;
  const query = request.query as GetMyMenusQuery;

  const result = await getMyMenus(sub, callerAppCode, isSuperAdmin, query);
  void reply.status(200).send(ok(result, "Menu sidebar berhasil diambil"));
}

// ─── 2. List Menus (CMS) ──────────────────────────────────────────────────────
export async function handleListMenus(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = request.query as ListMenusQuery;
  const result = await listMenus(query);

  if ("meta" in result) {
    void reply.status(200).send({
      success: true,
      message: "Daftar menu berhasil diambil",
      data: result.data,
      meta: result.meta,
    });
  } else {
    void reply.status(200).send({
      success: true,
      message: "Pohon menu berhasil diambil",
      data: result.data,
    });
  }
}

// ─── 3. Get Menu Detail ───────────────────────────────────────────────────────
export async function handleGetMenu(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as MenuParams;
  const menu = await getMenuById(id);
  void reply.status(200).send(ok(menu, "Detail menu berhasil diambil"));
}

// ─── 4. Create Menu ───────────────────────────────────────────────────────────
export async function handleCreateMenu(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const body = request.body as CreateMenuBody;
  const menu = await createMenu(body);
  void reply.status(201).send(ok(menu, "Menu berhasil dibuat"));
}

// ─── 5. Update Menu ───────────────────────────────────────────────────────────
export async function handleUpdateMenu(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as MenuParams;
  const body = request.body as UpdateMenuBody;
  const menu = await updateMenu(id, body);
  void reply.status(200).send(ok(menu, "Menu berhasil diperbarui"));
}

// ─── 6. Set Active / Inactive ─────────────────────────────────────────────────
export async function handleSetMenuActive(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as MenuParams;
  const { isActive } = request.body as SetMenuActiveBody;
  const result = await setMenuActive(id, isActive);
  const actionLabel = isActive ? "diaktifkan" : "dinonaktifkan";
  void reply.status(200).send(ok(result, `Menu berhasil ${actionLabel}`));
}

// ─── 7. Reorder Menus ─────────────────────────────────────────────────────────
export async function handleReorderMenus(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const body = request.body as ReorderMenusBody;
  const result = await reorderMenus(body);
  void reply.status(200).send(ok(result, "Urutan menu berhasil diperbarui"));
}

// ─── 8. Delete Menu ───────────────────────────────────────────────────────────
export async function handleDeleteMenu(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as MenuParams;
  const result = await deleteMenu(id);
  void reply.status(200).send(ok(result, "Menu berhasil dihapus"));
}
