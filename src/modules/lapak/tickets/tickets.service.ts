import { Prisma, type TicketKind } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { prisma } from "~/config/database.js";
import { NotFoundError, BadRequestError, ConflictError } from "~/common/errors/index.js";
import type {
  UseTicketBody,
  ListTicketsQuery,
  TicketDto,
} from "./tickets.schema.js";

/**
 * Tiket / bukti pemenuhan (LJ-2.7, PRD 04 §3 & §5).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ATURAN YANG DIJAGA:
 *
 * 1. TERBIT SAAT LUNAS, bukan saat checkout. Menerbitkan lebih awal berarti
 *    warga bisa masuk tanpa membayar.
 *
 * 2. SEKALI PAKAI. Penandaan terpakai memakai `updateMany` dengan syarat
 *    `status: 'AKTIF'` — dua petugas yang scan bersamaan tidak bisa sama-sama
 *    berhasil (yang kedua mendapat 0 baris → 409).
 *
 * 3. MASA BERLAKU diperiksa saat verifikasi, bukan hanya status. Tiket yang
 *    lewat `validUntil` tidak bisa dipakai walau statusnya masih AKTIF.
 *
 * 4. SNAPSHOT nama produk & tarif — tiket yang sudah terbit tidak berubah bila
 *    produknya diganti nama atau dihapus.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Terbitkan tiket saat LUNAS ──────────────────────────────────────────────
/**
 * Petakan `fulfillmentType` produk → `TicketKind`.
 *
 * Produk tanpa tipe pemenuhan tetap mendapat tiket BOOKING sebagai bukti
 * transaksi — lebih baik punya bukti berlebih daripada warga tidak punya apa pun
 * untuk ditunjukkan.
 */
function kindFromFulfillment(fulfillmentType: string | null | undefined): TicketKind {
  switch (fulfillmentType) {
    case "TICKET_QR": return "TICKET";
    case "CONTRACT": return "CONTRACT";
    case "RESULT": return "RESULT";
    case "SCHEDULE": return "SCHEDULE";
    case "DOCUMENT_SKRD": return "HANDOVER";
    case "BOOKING": return "BOOKING";
    default: return "BOOKING";
  }
}

/**
 * Kode pendek untuk dibacakan manual bila QR rusak.
 * Alfabet tanpa I/O/0/1 agar tidak salah baca di lapangan.
 */
function generateTicketCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `TKT-${s}`;
}

/**
 * Terbitkan tiket untuk SEMUA baris pesanan.
 *
 * Wajib dipanggil di dalam transaksi konfirmasi pembayaran (saat LUNAS) agar
 * pesanan, SKRD, dan tiket semuanya konsisten atau semuanya batal.
 *
 * Idempoten: baris yang sudah punya tiket dilewati, jadi konfirmasi ulang tidak
 * menggandakan tiket.
 */
export async function issueTicketsInTx(
  tx: Prisma.TransactionClient,
  params: { orderId: string; organizationId: string },
): Promise<number> {
  const items = await tx.lapakOrderItem.findMany({
    where: { orderId: params.orderId },
    select: {
      id: true,
      productId: true,
      productName: true,
      rateName: true,
      startAt: true,
      endAt: true,
      ticket: { select: { id: true } },
      product: { select: { fulfillmentType: true } },
    },
  });

  let issued = 0;
  for (const item of items) {
    if (item.ticket) continue; // sudah terbit — idempoten

    // Masa berlaku: ikut rentang pesanan bila ada. Bila tidak, tiket berlaku
    // sejak terbit tanpa batas (mis. dokumen hasil, serah terima barang).
    const validFrom = item.startAt ?? new Date();
    const validUntil = item.endAt ?? null;

    let code = generateTicketCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      const dup = await tx.lapakTicket.findFirst({
        where: { organizationId: params.organizationId, code },
        select: { id: true },
      });
      if (!dup) break;
      code = generateTicketCode();
    }

    await tx.lapakTicket.create({
      data: {
        orderItemId: item.id,
        kind: kindFromFulfillment(item.product.fulfillmentType),
        code,
        // Token QR 24 byte acak — tidak bisa diturunkan dari kode pendek.
        qrToken: randomBytes(24).toString("base64url"),
        status: "AKTIF",
        validFrom,
        validUntil,
        productName: item.productName,
        rateName: item.rateName,
        organizationId: params.organizationId,
      },
    });
    issued += 1;
  }
  return issued;
}

/** Batalkan tiket sebuah pesanan (dipakai saat pesanan dibatalkan/refund). */
export async function cancelTicketsForOrderInTx(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<number> {
  const result = await tx.lapakTicket.updateMany({
    where: { orderItem: { orderId }, status: "AKTIF" },
    data: { status: "DIBATALKAN" },
  });
  return result.count;
}

// ─── Baca ─────────────────────────────────────────────────────────────────────
const TICKET_INCLUDE = {
  orderItem: {
    select: {
      orderId: true,
      order: {
        select: {
          code: true,
          organization: { select: { code: true, name: true } },
        },
      },
    },
  },
} as const;

type TicketRow = Prisma.LapakTicketGetPayload<{ include: typeof TICKET_INCLUDE }>;

function toDto(row: TicketRow): TicketDto {
  return {
    id: row.id,
    orderItemId: row.orderItemId,
    orderId: row.orderItem.orderId,
    orderCode: row.orderItem.order.code,
    kind: row.kind,
    code: row.code,
    status: row.status,
    productName: row.productName,
    rateName: row.rateName,
    organization: row.orderItem.order.organization,
    validFrom: row.validFrom?.toISOString() ?? null,
    validUntil: row.validUntil?.toISOString() ?? null,
    usedAt: row.usedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Tiket milik sebuah pesanan (warga melihat tiketnya sendiri). */
export async function getOrderTickets(orderId: string, userId: string | null) {
  const order = await prisma.lapakOrder.findFirst({
    where: { id: orderId, ...(userId ? { userId } : {}) },
    select: { id: true },
  });
  if (!order) throw new NotFoundError("Pesanan", orderId);

  const rows = await prisma.lapakTicket.findMany({
    where: { orderItem: { orderId } },
    include: TICKET_INCLUDE,
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toDto);
}

export async function getTicket(id: string, userId: string | null) {
  const row = await prisma.lapakTicket.findFirst({
    where: { id, ...(userId ? { orderItem: { order: { userId } } } : {}) },
    include: TICKET_INCLUDE,
  });
  if (!row) throw new NotFoundError("Tiket", id);
  return toDto(row);
}

// ─── Verifikasi publik ────────────────────────────────────────────────────────
/**
 * Periksa tiket lewat token QR **atau** kode pendek.
 *
 * Tanpa login & tanpa data pribadi — petugas lokasi hanya perlu tahu: tiket ini
 * asli, milik produk apa, dan boleh dipakai sekarang atau tidak.
 */
export async function verifyTicket(tokenOrCode: string) {
  const row = await prisma.lapakTicket.findFirst({
    where: {
      OR: [{ qrToken: tokenOrCode }, { code: tokenOrCode.toUpperCase() }],
    },
    include: TICKET_INCLUDE,
  });
  if (!row) throw new NotFoundError("Tiket", tokenOrCode);

  const now = new Date();
  let usable = true;
  let reason: string | null = null;

  if (row.status === "DIGUNAKAN") {
    usable = false;
    reason = row.usedAt
      ? `Tiket sudah dipakai pada ${row.usedAt.toISOString()}`
      : "Tiket sudah dipakai";
  } else if (row.status === "DIBATALKAN") {
    usable = false;
    reason = "Tiket dibatalkan";
  } else if (row.status === "KEDALUWARSA") {
    usable = false;
    reason = "Tiket kedaluwarsa";
  } else if (row.validFrom && row.validFrom.getTime() > now.getTime()) {
    usable = false;
    reason = `Belum bisa dipakai sebelum ${row.validFrom.toISOString()}`;
  } else if (row.validUntil && row.validUntil.getTime() < now.getTime()) {
    usable = false;
    reason = `Sudah lewat masa berlaku (${row.validUntil.toISOString()})`;
  }

  return {
    code: row.code,
    kind: row.kind,
    productName: row.productName,
    rateName: row.rateName,
    organizationName: row.orderItem.order.organization.name,
    status: row.status,
    validFrom: row.validFrom?.toISOString() ?? null,
    validUntil: row.validUntil?.toISOString() ?? null,
    usedAt: row.usedAt?.toISOString() ?? null,
    usable,
    reason,
  };
}

// ─── Pakai / check-in ─────────────────────────────────────────────────────────
/**
 * Tandai tiket terpakai (scan petugas).
 *
 * `updateMany` dengan syarat `status: 'AKTIF'` membuat operasi ini **atomik
 * sekali pakai**: dua petugas yang scan bersamaan, hanya satu yang mendapat
 * `count: 1`; yang lain menerima 409. Tanpa syarat ini, dua scan bisa sama-sama
 * berhasil dan satu tiket dipakai dua orang.
 */
export async function useTicket(
  id: string,
  actorId: string,
  scope: string[] | null,
  body: UseTicketBody,
) {
  const ticket = await prisma.lapakTicket.findUnique({
    where: { id },
    include: { orderItem: { select: { orderId: true } } },
  });
  if (!ticket) throw new NotFoundError("Tiket", id);
  if (scope !== null && !scope.includes(ticket.organizationId)) {
    // 404 agar tiket OPD lain tidak terbocorkan.
    throw new NotFoundError("Tiket", id);
  }

  const now = new Date();
  if (ticket.validFrom && ticket.validFrom.getTime() > now.getTime()) {
    throw new BadRequestError(
      `Tiket belum bisa dipakai sebelum ${ticket.validFrom.toISOString()}`,
    );
  }
  if (ticket.validUntil && ticket.validUntil.getTime() < now.getTime()) {
    throw new BadRequestError(
      `Tiket sudah lewat masa berlaku (${ticket.validUntil.toISOString()})`,
    );
  }

  const updated = await prisma.lapakTicket.updateMany({
    where: { id, status: "AKTIF" },
    data: {
      status: "DIGUNAKAN",
      usedAt: now,
      checkedInBy: actorId,
    },
  });

  if (updated.count === 0) {
    // Sudah dipakai / dibatalkan / kedaluwarsa — jangan ungkap detail berlebih.
    throw new ConflictError("Tiket tidak bisa dipakai (sudah dipakai atau tidak aktif)");
  }

  void body; // catatan petugas saat ini belum disimpan; model belum punya kolomnya
  return getTicket(id, null);
}

// ─── Daftar untuk CMS ─────────────────────────────────────────────────────────
export async function listTickets(scope: string[] | null, query: ListTicketsQuery) {
  let organizationId: string | undefined;
  if (query.organization) {
    const org = await prisma.organization.findFirst({
      where: { code: query.organization, deletedAt: null },
      select: { id: true },
    });
    if (!org) throw new NotFoundError("Organisasi", query.organization);
    if (scope !== null && !scope.includes(org.id)) {
      throw new NotFoundError("Organisasi", query.organization);
    }
    organizationId = org.id;
  }

  const where = {
    ...(query.status && { status: query.status }),
    ...(query.kind && { kind: query.kind }),
    ...(organizationId
      ? { organizationId }
      : scope !== null ? { organizationId: { in: scope } } : {}),
  } satisfies Prisma.LapakTicketWhereInput;

  const [rows, totalItems] = await Promise.all([
    prisma.lapakTicket.findMany({
      where,
      include: TICKET_INCLUDE,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.lapakTicket.count({ where }),
  ]);

  const totalPages = Math.ceil(totalItems / query.limit) || 1;
  return {
    data: rows.map(toDto),
    meta: {
      page: query.page, limit: query.limit, totalItems, totalPages,
      hasNextPage: query.page < totalPages, hasPreviousPage: query.page > 1,
    },
  };
}

/**
 * Tandai tiket kedaluwarsa yang sudah lewat masa berlaku.
 * Dipanggil worker; tidak mengubah tiket tanpa `validUntil`.
 */
export async function expireOverdueTickets() {
  const result = await prisma.lapakTicket.updateMany({
    where: {
      status: "AKTIF",
      validUntil: { not: null, lt: new Date() },
    },
    data: { status: "KEDALUWARSA" },
  });
  return { expired: result.count };
}
