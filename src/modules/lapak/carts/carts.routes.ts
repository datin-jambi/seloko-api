import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  CartOrgParamsSchema,
  CartParamsSchema,
  CartItemParamsSchema,
  AddCartItemBodySchema,
  UpdateCartItemBodySchema,
  CartResponseSchema,
  CartListResponseSchema,
  EmptyCartResponseSchema,
} from "./carts.schema.js";
import {
  handleListCarts,
  handleGetCart,
  handleGetOrCreateCart,
  handleAddItem,
  handleUpdateItem,
  handleRemoveItem,
  handleClearCart,
  handleDeleteCart,
} from "./carts.controller.js";

/**
 * Keranjang warga (LJ-2.3, PRD 04 §4.F).
 *
 * SEMUA rute butuh login — keranjang selalu milik user yang terautentikasi,
 * tidak ada `userId` dari klien. Warga PUBLIK maupun pegawai sama-sama bisa
 * berbelanja; yang membedakan hanya akun mana yang dipakai.
 */
export async function lapakCartsRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  const auth = { preHandler: [fastify.authenticate] };

  app.get("/", {
    schema: {
      description: "Semua keranjang milik user yang login (satu per OPD)",
      tags: ["lapak-carts"],
      response: { 200: CartListResponseSchema },
    },
    ...auth,
  }, handleListCarts);

  app.get("/opd/:code", {
    schema: {
      description: "Ambil (atau buat) keranjang untuk OPD tertentu berdasarkan kode OPD",
      tags: ["lapak-carts"],
      params: CartOrgParamsSchema,
      response: { 200: CartResponseSchema },
    },
    ...auth,
  }, handleGetOrCreateCart);

  app.get("/:id", {
    schema: {
      description: "Detail satu keranjang (harus milik sendiri)",
      tags: ["lapak-carts"],
      params: CartParamsSchema,
      response: { 200: CartResponseSchema },
    },
    ...auth,
  }, handleGetCart);

  app.post("/:id/items", {
    schema: {
      description: "Tambah produk ke keranjang. Produk OPD lain ditolak 409 (satu pesanan = satu OPD).",
      tags: ["lapak-carts"],
      params: CartParamsSchema,
      body: AddCartItemBodySchema,
      response: { 201: CartResponseSchema },
    },
    ...auth,
  }, handleAddItem);

  app.put("/:id/items/:itemId", {
    schema: {
      description: "Ubah qty / tarif / catatan sebuah item",
      tags: ["lapak-carts"],
      params: CartParamsSchema.merge(CartItemParamsSchema),
      body: UpdateCartItemBodySchema,
      response: { 200: CartResponseSchema },
    },
    ...auth,
  }, handleUpdateItem);

  app.delete("/:id/items/:itemId", {
    schema: {
      description: "Hapus satu item dari keranjang",
      tags: ["lapak-carts"],
      params: CartParamsSchema.merge(CartItemParamsSchema),
      response: { 200: CartResponseSchema },
    },
    ...auth,
  }, handleRemoveItem);

  app.post("/:id/clear", {
    schema: {
      description: "Kosongkan keranjang (baris dihapus, keranjang tetap ada)",
      tags: ["lapak-carts"],
      params: CartParamsSchema,
      response: { 200: CartResponseSchema },
    },
    ...auth,
  }, handleClearCart);

  app.delete("/:id", {
    schema: {
      description: "Hapus keranjang beserta seluruh itemnya",
      tags: ["lapak-carts"],
      params: CartParamsSchema,
      response: { 200: EmptyCartResponseSchema },
    },
    ...auth,
  }, handleDeleteCart);
}
