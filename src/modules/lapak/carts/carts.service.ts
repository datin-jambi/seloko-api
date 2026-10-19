import type { ContentStatus } from "@prisma/client";
import { prisma } from "~/config/database.js";
import { NotFoundError, BadRequestError, ConflictError } from "~/common/errors/index.js";
import { APP_CODES } from "~/common/constants/index.js";
import type { AddCartItemBody, UpdateCartItemBody, CartDto, CartItemDto } from "./carts.schema.js";

/**
 * Keranjang warga (LJ-2.3, PRD 04 §4.F).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SATU KERANJANG PER (user, OPD) — dan itu ditegakkan DUA LAPIS:
 *   1. unique index `uq_lapak_carts_user_org` di database (jaminan terakhir),
 *   2. pemeriksaan ramah di sini yang menghasilkan 409 berpesan jelas.
 *
 * Menambah produk dari OPD lain ke keranjang yang sudah ada DITOLAK, bukan
 * digabung diam-diam: penggabungan akan membuat satu checkout berisi dua
 * penerbit SKRD, yang mustahil diterbitkan.
 *
 * Harga TIDAK disimpan di keranjang. `unitPrice`/`subtotal` di respons hanya
 * informasi dari tarif aktif saat ini; angka final dibekukan sebagai snapshot
 * saat quote/checkout (LJ-2.4). Menyimpan harga di keranjang berarti harga
 * basi bisa ikut ter-checkout.
 * ─────────────────────────────────────────────────────────────────────────────
 */

async function getLapakAppId(): Promise<string> {
  const app = await prisma.application.findUniqueOrThrow({
    where: { code: APP_CODES.LAPAK_JAMBI_WEB },
    select: { id: true },
  });
  return app.id;
}

/**
 * Tarif yang boleh dipakai publik: aktif, disetujui, dan sudah berlaku.
 * FUNGSI, bukan konstanta — `new Date()` di konstanta membeku saat modul
 * dimuat (jebakan yang sudah pernah memakan waktu di LJ-1.3).
 */
function publicRateWhere() {
  return {
    deletedAt: null,
    isActive: true,
    status: { in: ["APPROVED", "PUBLISHED"] as ContentStatus[] },
    effectiveFrom: { lte: new Date() },
  };
}

// ─── Baca ─────────────────────────────────────────────────────────────────────
const CART_INCLUDE = {
  organization: { select: { code: true, name: true } },
  items: {
    orderBy: { createdAt: "asc" as const },
    include: {
      product: { select: { id: true, name: true, slug: true } },
      rate: { select: { id: true, name: true, price: true } },
    },
  },
} as const;

async function toDto(cart: {
  id: string;
  organization: { code: string; name: string };
  items: Array<{
    id: string;
    productId: string;
    product: { name: string; slug: string };
    rateId: string | null;
    rate: { name: string; price: unknown } | null;
    reservationId: string | null;
    qty: number;
    startAt: Date | null;
    endAt: Date | null;
    note: string | null;
  }>;
}): Promise<CartDto> {
  // Harga diambil dari tarif yang dipilih; bila belum dipilih, pakai tarif
  // termurah yang aktif saat ini agar keranjang tetap informatif.
  const productIds = [...new Set(cart.items.map((i) => i.productId))];
  const cheapest = productIds.length === 0 ? [] : await prisma.lapakProductRate.findMany({
    where: { ...publicRateWhere(), productId: { in: productIds } },
    orderBy: { price: "asc" },
    select: { productId: true, price: true },
  });
  const cheapestByProduct = new Map<string, number>();
  for (const r of cheapest) {
    if (!cheapestByProduct.has(r.productId)) cheapestByProduct.set(r.productId, Number(r.price));
  }

  const items: CartItemDto[] = cart.items.map((i) => {
    const unitPrice = i.rate ? Number(i.rate.price) : cheapestByProduct.get(i.productId) ?? null;
    return {
      id: i.id,
      productId: i.productId,
      productName: i.product.name,
      productSlug: i.product.slug,
      rateId: i.rateId,
      rateName: i.rate?.name ?? null,
      reservationId: i.reservationId,
      qty: i.qty,
      startAt: i.startAt?.toISOString() ?? null,
      endAt: i.endAt?.toISOString() ?? null,
      note: i.note,
      unitPrice,
      lineTotal: unitPrice === null ? null : unitPrice * i.qty,
    };
  });

  return {
    id: cart.id,
    organization: cart.organization,
    items,
    itemCount: items.reduce((n, i) => n + i.qty, 0),
    subtotal: items.reduce((n, i) => n + (i.lineTotal ?? 0), 0),
  };
}

export async function listCarts(userId: string): Promise<CartDto[]> {
  const carts = await prisma.lapakCart.findMany({
    where: { userId },
    include: CART_INCLUDE,
    orderBy: { updatedAt: "desc" },
  });
  return Promise.all(carts.map(toDto));
}

/** Satu keranjang milik user tertentu; 404 bila bukan pemiliknya. */
async function getOwnedCartOr404(cartId: string, userId: string) {
  const cart = await prisma.lapakCart.findFirst({
    where: { id: cartId, userId },
    include: CART_INCLUDE,
  });
  // 404 (bukan 403): jangan bocorkan keberadaan keranjang milik orang lain.
  if (!cart) throw new NotFoundError("Keranjang", cartId);
  return cart;
}

export async function getCart(cartId: string, userId: string): Promise<CartDto> {
  return toDto(await getOwnedCartOr404(cartId, userId));
}

/** Keranjang untuk OPD tertentu (dibuat bila belum ada). */
export async function getOrCreateCart(userId: string, organizationCode: string): Promise<CartDto> {
  const org = await prisma.organization.findFirst({
    where: { code: organizationCode, deletedAt: null },
    select: { id: true },
  });
  if (!org) throw new NotFoundError("Organisasi", organizationCode);

  const existing = await prisma.lapakCart.findFirst({
    where: { userId, organizationId: org.id },
    include: CART_INCLUDE,
  });
  if (existing) return toDto(existing);

  const applicationId = await getLapakAppId();
  const created = await prisma.lapakCart.create({
    data: { userId, organizationId: org.id, applicationId },
    include: CART_INCLUDE,
  });
  return toDto(created);
}

// ─── Tambah item ──────────────────────────────────────────────────────────────
/**
 * Tambah produk ke keranjang.
 *
 * Keranjang ditentukan dari OPD PRODUK, bukan dipilih klien. Bila user sudah
 * punya keranjang untuk OPD itu, item masuk ke sana; bila belum, keranjang
 * dibuat. Inilah yang membuat aturan "satu pesanan = satu OPD" otomatis
 * terpenuhi tanpa klien perlu tahu.
 */
export async function addItem(
  cartId: string,
  userId: string,
  body: AddCartItemBody,
): Promise<CartDto> {
  const cart = await getOwnedCartOr404(cartId, userId);

  const product = await prisma.lapakProduct.findFirst({
    where: { id: body.productId, applicationId: cart.applicationId, deletedAt: null },
    select: { id: true, organizationId: true, status: true },
  });
  if (!product) throw new NotFoundError("Produk", body.productId);
  if (product.status !== "PUBLISHED") {
    throw new BadRequestError("Produk belum terbit; tidak bisa dimasukkan ke keranjang");
  }

  // INTI §4.F: produk dari OPD lain ditolak, bukan dipindah/gabung diam-diam.
  if (product.organizationId !== cart.organizationId) {
    throw new ConflictError(
      "Keranjang ini milik OPD lain. Satu pesanan hanya untuk satu OPD — buat keranjang terpisah untuk produk ini.",
    );
  }

  if (body.rateId) {
    const rate = await prisma.lapakProductRate.findFirst({
      where: { id: body.rateId, productId: product.id, ...publicRateWhere() },
      select: { id: true },
    });
    if (!rate) throw new BadRequestError("Tarif tidak tersedia atau belum disetujui untuk produk ini");
  }

  if (body.reservationId) {
    const res = await prisma.lapakReservation.findFirst({
      where: { id: body.reservationId, productId: product.id, userId },
      select: { id: true, status: true, expiresAt: true },
    });
    if (!res) throw new BadRequestError("Reservasi tidak ditemukan atau bukan milik Anda");
    if (res.status !== "HOLD") throw new BadRequestError("Reservasi tidak lagi berstatus HOLD");
    if (res.expiresAt && res.expiresAt.getTime() < Date.now()) {
      throw new BadRequestError("Reservasi sudah kedaluwarsa; pegang slot baru");
    }
  }

  // Produk sama, tarif sama, rentang waktu sama → tambahkan qty-nya alih-alih
  // membuat baris duplikat yang membingungkan di UI.
  const duplicate = await prisma.lapakCartItem.findFirst({
    where: {
      cartId: cart.id,
      productId: product.id,
      rateId: body.rateId ?? null,
      startAt: body.startAt ? new Date(body.startAt) : null,
      endAt: body.endAt ? new Date(body.endAt) : null,
    },
    select: { id: true },
  });

  if (duplicate) {
    await prisma.lapakCartItem.update({
      where: { id: duplicate.id },
      data: { qty: { increment: body.qty } },
    });
  } else {
    await prisma.lapakCartItem.create({
      data: {
        cartId: cart.id,
        productId: product.id,
        rateId: body.rateId ?? null,
        reservationId: body.reservationId ?? null,
        qty: body.qty,
        startAt: body.startAt ? new Date(body.startAt) : null,
        endAt: body.endAt ? new Date(body.endAt) : null,
        note: body.note ?? null,
      },
    });
  }

  return getCart(cart.id, userId);
}

// ─── Ubah / hapus item ────────────────────────────────────────────────────────
export async function updateItem(
  cartId: string,
  userId: string,
  itemId: string,
  body: UpdateCartItemBody,
): Promise<CartDto> {
  const cart = await getOwnedCartOr404(cartId, userId);

  const item = await prisma.lapakCartItem.findFirst({
    where: { id: itemId, cartId: cart.id },
    select: { id: true, productId: true },
  });
  if (!item) throw new NotFoundError("Item keranjang", itemId);

  if (body.rateId) {
    const rate = await prisma.lapakProductRate.findFirst({
      where: { id: body.rateId, productId: item.productId, ...publicRateWhere() },
      select: { id: true },
    });
    if (!rate) throw new BadRequestError("Tarif tidak tersedia atau belum disetujui untuk produk ini");
  }

  await prisma.lapakCartItem.update({
    where: { id: item.id },
    data: {
      ...(body.qty !== undefined && { qty: body.qty }),
      ...(body.rateId !== undefined && { rateId: body.rateId }),
      ...(body.note !== undefined && { note: body.note }),
    },
  });

  return getCart(cart.id, userId);
}

export async function removeItem(cartId: string, userId: string, itemId: string): Promise<CartDto> {
  const cart = await getOwnedCartOr404(cartId, userId);
  const item = await prisma.lapakCartItem.findFirst({
    where: { id: itemId, cartId: cart.id },
    select: { id: true },
  });
  if (!item) throw new NotFoundError("Item keranjang", itemId);

  await prisma.lapakCartItem.delete({ where: { id: item.id } });
  return getCart(cart.id, userId);
}

/** Kosongkan keranjang (hapus baris, keranjang tetap ada). */
export async function clearCart(cartId: string, userId: string): Promise<CartDto> {
  const cart = await getOwnedCartOr404(cartId, userId);
  await prisma.lapakCartItem.deleteMany({ where: { cartId: cart.id } });
  return getCart(cart.id, userId);
}

/** Hapus keranjang beserta itemnya (cascade). */
export async function deleteCart(cartId: string, userId: string) {
  const cart = await getOwnedCartOr404(cartId, userId);
  await prisma.lapakCart.delete({ where: { id: cart.id } });
  return { id: cart.id, deleted: true as const };
}
