import { Prisma } from "@prisma/client";
import { prisma } from "~/config/database.js";
import { NotFoundError, BadRequestError } from "~/common/errors/index.js";
import type {
  SubmitProofBody,
  RejectPaymentBody,
  VerifyPaymentBody,
  ListPaymentsQuery,
  PaymentDto,
} from "./payments.schema.js";

/**
 * Pembayaran transfer manual (LJ-2.6, PRD 04 §E).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ATURAN YANG DIJAGA:
 *
 * 1. Satu pesanan boleh punya BANYAK baris pembayaran. Bukti yang ditolak
 *    membuat warga mengunggah ulang — riwayatnya tetap utuh untuk audit.
 *
 * 2. Hanya SATU pembayaran yang boleh aktif (MENUNGGU_*) pada satu waktu.
 *    Mencegah warga mengunggah dua bukti untuk tagihan yang sama dan
 *    mencegah admin mengonfirmasi dua kali.
 *
 * 3. Konfirmasi bersifat ATOMIK: pembayaran LUNAS + pesanan LUNAS + SKRD LUNAS
 *    + log status ditulis dalam SATU transaksi. Setengah jadi berarti negara
 *    menganggap lunas tetapi dokumennya belum.
 *
 * 4. Nominal diperiksa. Bila jumlah transfer kurang dari tagihan, admin TIDAK
 *    boleh menandai lunas lewat jalur ini — harus ditolak dan warga melunasi
 *    sisanya (atau diterima dengan nominal berbeda lewat `amount` eksplisit
 *    yang tercatat).
 * ─────────────────────────────────────────────────────────────────────────────
 */

const PAYMENT_INCLUDE = {
  order: {
    select: {
      code: true,
      total: true,
      organization: { select: { code: true, name: true } },
      skrd: {
        select: { bankName: true, bankAccount: true, bankHolder: true, dueAt: true, status: true },
      },
    },
  },
} as const;

type PaymentRow = Prisma.LapakPaymentGetPayload<{ include: typeof PAYMENT_INCLUDE }>;

function toDto(row: PaymentRow): PaymentDto {
  return {
    id: row.id,
    orderId: row.orderId,
    orderCode: row.order.code,
    method: row.method,
    status: row.status,
    amount: row.amount,
    organization: row.order.organization,
    bank: {
      name: row.order.skrd?.bankName ?? null,
      account: row.order.skrd?.bankAccount ?? null,
      holder: row.order.skrd?.bankHolder ?? null,
    },
    proofUrl: row.proofUrl,
    proofFileId: row.proofFileId,
    senderName: row.senderName,
    senderBank: row.senderBank,
    note: row.note,
    rejectReason: row.rejectReason,
    paidAt: row.paidAt?.toISOString() ?? null,
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

// ─── Pembuatan otomatis saat checkout ────────────────────────────────────────
/**
 * Buat baris pembayaran awal saat pesanan dibuat.
 *
 * Dipanggil di dalam transaksi checkout. Status awal `MENUNGGU_BUKTI`; batas
 * waktu mengikuti `dueAt` SKRD (jatuh tempo retribusi), bukan default terpisah —
 * satu tanggal yang dipakai warga & OPD.
 */
export async function createInitialPaymentInTx(
  tx: Prisma.TransactionClient,
  params: { orderId: string; amount: number; dueAt: Date | null },
): Promise<void> {
  await tx.lapakPayment.create({
    data: {
      orderId: params.orderId,
      method: "MANUAL_TRANSFER",
      status: "MENUNGGU_BUKTI",
      amount: params.amount,
      expiresAt: params.dueAt,
    },
  });
}

// ─── Baca ─────────────────────────────────────────────────────────────────────
/** Pembayaran milik pesanan tertentu; 404 bila pesanan bukan milik user. */
export async function getOrderPayments(orderId: string, userId: string | null) {
  const order = await prisma.lapakOrder.findFirst({
    where: { id: orderId, ...(userId ? { userId } : {}) },
    select: { id: true },
  });
  if (!order) throw new NotFoundError("Pesanan", orderId);

  const rows = await prisma.lapakPayment.findMany({
    where: { orderId },
    include: PAYMENT_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toDto);
}

export async function getPayment(id: string, userId: string | null) {
  const row = await prisma.lapakPayment.findFirst({
    where: { id, ...(userId ? { order: { userId } } : {}) },
    include: PAYMENT_INCLUDE,
  });
  // 404 (bukan 403): jangan bocorkan keberadaan pembayaran orang lain.
  if (!row) throw new NotFoundError("Pembayaran", id);
  return toDto(row);
}

// ─── Unggah bukti ─────────────────────────────────────────────────────────────
/**
 * Warga mengunggah bukti transfer.
 *
 * Bukti WAJIB dari ImageKit (`POST /api/storage/upload?module=lapak&subFolder=payments`).
 * URL eksternal ditolak: bukti bayar adalah lampiran resmi — harus tersimpan di
 * storage yang kita kendalikan, bukan tautan yang bisa hilang atau berubah isinya.
 */
export async function submitProof(paymentId: string, userId: string, body: SubmitProofBody) {
  const payment = await prisma.lapakPayment.findFirst({
    where: { id: paymentId, order: { userId } },
    include: { order: { select: { status: true, total: true, userId: true } } },
  });
  if (!payment) throw new NotFoundError("Pembayaran", paymentId);

  if (payment.status === "LUNAS") {
    throw new BadRequestError("Pembayaran sudah lunas — tidak perlu unggah bukti lagi");
  }
  if (payment.status === "KEDALUWARSA") {
    throw new BadRequestError("Pembayaran sudah kedaluwarsa — pesanan perlu dibuat ulang");
  }
  if (payment.order.status !== "MENUNGGU_PEMBAYARAN") {
    throw new BadRequestError(
      `Pesanan berstatus ${payment.order.status} — bukti tidak bisa diunggah saat ini`,
    );
  }

  // Nominal harus positif; selisih dari tagihan dicatat apa adanya agar OPD
  // bisa memutuskan (kurang → tolak, lebih → bisa diterima dengan catatan).
  await prisma.$transaction(async (tx) => {
    await tx.lapakPayment.update({
      where: { id: payment.id },
      data: {
        proofUrl: body.proofUrl,
        proofFileId: body.proofFileId,
        senderName: body.senderName,
        senderBank: body.senderBank,
        amount: body.amount,
        paidAt: new Date(body.paidAt),
        note: body.note ?? null,
        status: "MENUNGGU_KONFIRMASI",
        // Bukti baru membatalkan alasan penolakan sebelumnya (unggah ulang).
        rejectReason: null,
      },
    });

    await tx.lapakOrder.update({
      where: { id: payment.orderId },
      data: {
        status: "MENUNGGU_KONFIRMASI",
        statusLogs: {
          create: {
            fromStatus: "MENUNGGU_PEMBAYARAN",
            toStatus: "MENUNGGU_KONFIRMASI",
            actorId: userId,
            note: "Bukti transfer diunggah",
          },
        },
      },
    });
  });

  return getPayment(payment.id, userId);
}

// ─── Konfirmasi / tolak ───────────────────────────────────────────────────────
async function assertInScope(organizationId: string, scope: string[] | null) {
  if (scope !== null && !scope.includes(organizationId)) {
    // 404 supaya keberadaan pembayaran OPD lain tidak terbocorkan.
    throw new NotFoundError("Pembayaran", organizationId);
  }
}

/**
 * Admin OPD mengonfirmasi pembayaran → LUNAS.
 *
 * Atomik: pembayaran LUNAS + pesanan LUNAS + SKRD LUNAS + log status.
 */
export async function verifyPayment(
  paymentId: string,
  actorId: string,
  scope: string[] | null,
  body: VerifyPaymentBody,
) {
  const payment = await prisma.lapakPayment.findUnique({
    where: { id: paymentId },
    include: {
      order: { select: { id: true, organizationId: true, total: true, status: true } },
    },
  });
  if (!payment) throw new NotFoundError("Pembayaran", paymentId);
  await assertInScope(payment.order.organizationId, scope);

  if (payment.status === "LUNAS") {
    // Idempoten: konfirmasi ganda tidak boleh menggandakan efek.
    return getPayment(paymentId, null);
  }
  if (payment.status !== "MENUNGGU_KONFIRMASI") {
    throw new BadRequestError(
      `Pembayaran berstatus ${payment.status} — belum bisa dikonfirmasi`,
    );
  }

  const received = body.amount ?? payment.amount;
  if (received < payment.order.total) {
    throw new BadRequestError(
      `Nominal diterima (${received}) kurang dari tagihan (${payment.order.total}). Tolak pembayaran dan minta pelunasan.`,
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.lapakPayment.update({
      where: { id: payment.id },
      data: {
        status: "LUNAS",
        amount: received,
        confirmedBy: actorId,
        confirmedAt: new Date(),
        ...(body.note !== undefined && { note: body.note }),
      },
    });

    await tx.lapakOrder.update({
      where: { id: payment.orderId },
      data: {
        status: "LUNAS",
        statusLogs: {
          create: {
            fromStatus: payment.order.status,
            toStatus: "LUNAS",
            actorId,
            note: body.note ?? "Pembayaran dikonfirmasi",
          },
        },
      },
    });

    // SKRD ikut LUNAS — status dokumen harus mencerminkan kenyataan.
    await tx.lapakSkrd.updateMany({
      where: { orderId: payment.orderId, status: "TERBIT" },
      data: { status: "LUNAS" },
    });
  });

  return getPayment(paymentId, null);
}

/** Admin OPD menolak bukti. Warga boleh unggah ulang; riwayat tetap tersimpan. */
export async function rejectPayment(
  paymentId: string,
  actorId: string,
  scope: string[] | null,
  body: RejectPaymentBody,
) {
  const payment = await prisma.lapakPayment.findUnique({
    where: { id: paymentId },
    include: { order: { select: { id: true, organizationId: true, status: true } } },
  });
  if (!payment) throw new NotFoundError("Pembayaran", paymentId);
  await assertInScope(payment.order.organizationId, scope);

  if (payment.status !== "MENUNGGU_KONFIRMASI") {
    throw new BadRequestError(`Pembayaran berstatus ${payment.status} — tidak bisa ditolak`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.lapakPayment.update({
      where: { id: payment.id },
      data: { status: "DITOLAK", rejectReason: body.reason, confirmedAt: new Date(), confirmedBy: actorId },
    });

    // Pesanan kembali ke MENUNGGU_PEMBAYARAN agar warga bisa unggah ulang.
    await tx.lapakOrder.update({
      where: { id: payment.orderId },
      data: {
        status: "MENUNGGU_PEMBAYARAN",
        statusLogs: {
          create: {
            fromStatus: payment.order.status,
            toStatus: "MENUNGGU_PEMBAYARAN",
            actorId,
            note: `Bukti ditolak: ${body.reason}`,
          },
        },
      },
    });
  });

  return getPayment(paymentId, null);
}

// ─── Daftar untuk CMS ─────────────────────────────────────────────────────────
export async function listPayments(scope: string[] | null, query: ListPaymentsQuery) {
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
    ...(organizationId
      ? { order: { organizationId } }
      : scope !== null ? { order: { organizationId: { in: scope } } } : {}),
  } satisfies Prisma.LapakPaymentWhereInput;

  const [rows, totalItems] = await Promise.all([
    prisma.lapakPayment.findMany({
      where,
      include: PAYMENT_INCLUDE,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.lapakPayment.count({ where }),
  ]);

  const totalPages = Math.ceil(totalItems / query.limit) || 1;
  return {
    data: rows.map(toDto),
    meta: {
      page: query.page, limit: query.limit, totalItems, totalPages,
      hasNextPage: query.page < totalPages,
      hasPreviousPage: query.page > 1,
    },
  };
}

/**
 * Tandai pembayaran & pesanan kedaluwarsa.
 *
 * Dipanggil worker (LJ-2.8). Sengaja TIDAK membebaskan reservasi di sini —
 * itu tanggung jawab worker reservasi agar satu tempat mengatur slot.
 */
export async function expireOverduePayments() {
  const now = new Date();
  const overdue = await prisma.lapakPayment.findMany({
    where: {
      status: { in: ["MENUNGGU_BUKTI", "MENUNGGU_KONFIRMASI"] },
      expiresAt: { lt: now },
    },
    select: { id: true, orderId: true },
    take: 500,
  });

  let count = 0;
  for (const p of overdue) {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.lapakPayment.updateMany({
        where: { id: p.id, status: { in: ["MENUNGGU_BUKTI", "MENUNGGU_KONFIRMASI"] } },
        data: { status: "KEDALUWARSA" },
      });
      if (updated.count === 0) return;

      await tx.lapakOrder.updateMany({
        where: { id: p.orderId, status: { in: ["MENUNGGU_PEMBAYARAN", "MENUNGGU_KONFIRMASI"] } },
        data: { status: "KEDALUWARSA" },
      });
      await tx.lapakSkrd.updateMany({
        where: { orderId: p.orderId, status: "TERBIT" },
        data: { status: "CANCELLED" },
      });
      // Nomor SKRD TIDAK dikembalikan — gapless (lihat skrd.service.ts).
      count += 1;
    });
  }
  return { expired: count };
}
