import { Prisma, type ContentStatus } from "@prisma/client";
import { prisma } from "~/config/database.js";
import { NotFoundError, BadRequestError, ConflictError } from "~/common/errors/index.js";
import { APP_CODES } from "~/common/constants/index.js";
import type {
  CheckoutBody,
  QuoteDto,
  OrderDetailDto,
  ListOrdersQuery,
  Applicant,
} from "./orders.schema.js";

/**
 * Quote & checkout → pesanan (LJ-2.4, PRD 04 §4.F & §5).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DUA PRINSIP YANG DIJAGA DI SINI:
 *
 * 1. SNAPSHOT, BUKAN REFERENSI HIDUP.
 *    Checkout menyalin nama produk, nama tarif, satuan, dan harga ke baris
 *    pesanan. Bila Bapenda menaikkan tarif besok, pesanan kemarin TIDAK boleh
 *    berubah — ia bukti transaksi pada harga saat itu.
 *
 * 2. PII TIDAK PERNAH KELUAR UTUH.
 *    `applicant` disimpan lengkap untuk keperluan SKRD, tetapi setiap respons
 *    memakai versi TERMASKING (NIK & telepon disamarkan).
 *
 * Transaksi checkout bersifat atomik: pesanan, baris, log status, dan
 * konfirmasi reservasi semua berhasil atau semua batal.
 * ─────────────────────────────────────────────────────────────────────────────
 */

async function getLapakAppId(): Promise<string> {
  const app = await prisma.application.findUniqueOrThrow({
    where: { code: APP_CODES.LAPAK_JAMBI_WEB },
    select: { id: true },
  });
  return app.id;
}

/** Tarif yang sah untuk publik — fungsi, bukan konstanta (new Date() beku). */
function publicRateWhere() {
  return {
    deletedAt: null,
    isActive: true,
    status: { in: ["APPROVED", "PUBLISHED"] as ContentStatus[] },
    effectiveFrom: { lte: new Date() },
  };
}

// ─── Masking PII ──────────────────────────────────────────────────────────────
/**
 * Samarkan NIK/telepon untuk tampilan. Menyisakan 4 digit depan & belakang
 * supaya pemilik tetap bisa mengenali datanya sendiri tanpa membocorkan utuh.
 */
function maskDigits(value: string | null | undefined): string | null {
  if (!value) return null;
  const clean = value.replace(/\s+/g, "");
  if (clean.length <= 8) return "*".repeat(clean.length);
  return `${clean.slice(0, 4)}${"*".repeat(clean.length - 8)}${clean.slice(-4)}`;
}

function maskApplicant(raw: unknown) {
  const a = (raw ?? {}) as Partial<Applicant>;
  return {
    name: a.name ?? "-",
    nik: maskDigits(a.nik),
    npwp: maskDigits(a.npwp),
    phone: maskDigits(a.phone),
    email: a.email ?? null,
    institution: a.institution ?? null,
    address: a.address ?? null,
  };
}

// ─── Quote ────────────────────────────────────────────────────────────────────
/**
 * Hitung harga final keranjang TANPA menyimpan apa pun.
 *
 * `ready: false` menandakan ada baris yang tidak bisa di-checkout (produk
 * tidak terbit, tarif belum disetujui, reservasi kedaluwarsa). Frontend bisa
 * menampilkan peringatan tanpa harus mencoba checkout dulu.
 */
export async function quoteCart(cartId: string, userId: string): Promise<QuoteDto> {
  const cart = await prisma.lapakCart.findFirst({
    where: { id: cartId, userId },
    include: {
      organization: { select: { code: true, name: true } },
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          product: { select: { id: true, name: true, status: true, pricingUnit: true, deletedAt: true } },
          rate: { select: { id: true, name: true, unit: true, price: true } },
          reservation: { select: { id: true, status: true, expiresAt: true } },
        },
      },
    },
  });
  if (!cart) throw new NotFoundError("Keranjang", cartId);

  const warnings: string[] = [];
  const lines = await Promise.all(cart.items.map(async (item) => {
    let warning: string | null = null;

    if (item.product.deletedAt !== null || item.product.status !== "PUBLISHED") {
      warning = `Produk "${item.product.name}" tidak lagi tersedia`;
    }

    // Tarif dipilih → pakai itu; belum dipilih → pakai termurah yang aktif.
    let rateName = item.rate?.name ?? null;
    let unit = item.rate?.unit ?? item.product.pricingUnit;
    let unitPrice = item.rate ? Number(item.rate.price) : null;

    if (unitPrice === null) {
      const cheapest = await prisma.lapakProductRate.findFirst({
        where: { productId: item.productId, ...publicRateWhere() },
        orderBy: { price: "asc" },
        select: { name: true, unit: true, price: true },
      });
      if (cheapest) {
        rateName = cheapest.name;
        unit = cheapest.unit;
        unitPrice = Number(cheapest.price);
      } else if (!warning) {
        warning = `Tidak ada tarif aktif untuk "${item.product.name}"`;
      }
    }

    if (item.reservation) {
      if (item.reservation.status !== "HOLD") {
        warning = "Slot yang dipegang sudah tidak aktif — pegang ulang";
      } else if (item.reservation.expiresAt && item.reservation.expiresAt.getTime() < Date.now()) {
        warning = "Slot yang dipegang sudah kedaluwarsa — pegang ulang";
      }
    }

    if (warning) warnings.push(warning);

    const price = unitPrice ?? 0;
    return {
      cartItemId: item.id,
      productId: item.productId,
      productName: item.product.name,
      rateId: item.rateId,
      rateName,
      unit,
      price,
      qty: item.qty,
      lineTotal: price * item.qty,
      startAt: item.startAt?.toISOString() ?? null,
      endAt: item.endAt?.toISOString() ?? null,
      warning,
    };
  }));

  const subtotal = lines.reduce((n, l) => n + l.lineTotal, 0);
  return {
    organization: cart.organization,
    lines,
    subtotal,
    total: subtotal,
    ready: warnings.length === 0 && lines.length > 0,
    warnings,
  };
}

// ─── Kode pesanan ─────────────────────────────────────────────────────────────
/**
 * Kode pesanan: `LJK-YYMMDD-XXXX` (X = huruf/angka acak).
 *
 * Bukan berurutan: kode dipakai warga untuk melacak pesanan di halaman publik,
 * jadi nomor urut yang mudah ditebak akan membocorkan volume transaksi ke
 * siapa pun yang mencoba beberapa angka.
 */
function generateOrderCode(): string {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // tanpa I/O/0/1 agar tak salah baca
  let suffix = "";
  for (let i = 0; i < 5; i++) suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `LJK-${ymd}-${suffix}`;
}

// ─── Checkout ─────────────────────────────────────────────────────────────────
/**
 * Checkout keranjang menjadi pesanan.
 *
 * Atomik: pesanan + baris + log + konfirmasi reservasi dalam satu transaksi.
 * Bila satu reservasi gagal dikonfirmasi (mis. sudah kedaluwarsa), seluruh
 * checkout dibatalkan — lebih baik gagal bersih daripada pesanan setengah jadi
 * yang menahan slot tanpa bukti.
 */
export async function checkoutCart(
  cartId: string,
  userId: string,
  body: CheckoutBody,
): Promise<OrderDetailDto> {
  const applicationId = await getLapakAppId();

  const cart = await prisma.lapakCart.findFirst({
    where: { id: cartId, userId, applicationId },
    include: {
      organization: { select: { id: true, code: true, name: true } },
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          product: { select: { id: true, name: true, status: true, pricingUnit: true, deletedAt: true } },
          rate: { select: { id: true, name: true, unit: true, price: true } },
          reservation: { select: { id: true, status: true, expiresAt: true } },
        },
      },
    },
  });
  if (!cart) throw new NotFoundError("Keranjang", cartId);
  if (cart.items.length === 0) throw new BadRequestError("Keranjang kosong — tidak ada yang bisa dipesan");

  // Hitung ulang di server. Harga dari klien TIDAK pernah dipercaya.
  const quoted = await quoteCart(cartId, userId);
  if (!quoted.ready) {
    throw new BadRequestError(`Keranjang belum siap di-checkout: ${quoted.warnings.join("; ")}`);
  }

  // Siapkan snapshot baris.
  const itemRows = await Promise.all(cart.items.map(async (item) => {
    let rateName = item.rate?.name;
    let unit = item.rate?.unit;
    let price = item.rate ? Number(item.rate.price) : null;

    if (price === null) {
      const cheapest = await prisma.lapakProductRate.findFirst({
        where: { productId: item.productId, ...publicRateWhere() },
        orderBy: { price: "asc" },
        select: { name: true, unit: true, price: true },
      });
      if (!cheapest) throw new BadRequestError(`Tidak ada tarif aktif untuk "${item.product.name}"`);
      rateName = cheapest.name;
      unit = cheapest.unit;
      price = Number(cheapest.price);
    }

    return {
      productId: item.productId,
      rateId: item.rateId,
      reservationId: item.reservationId,
      productName: item.product.name,
      rateName: rateName ?? "Tarif",
      unit: unit ?? item.product.pricingUnit,
      price,
      qty: item.qty,
      lineTotal: price * item.qty,
      startAt: item.startAt,
      endAt: item.endAt,
      note: item.note,
    };
  }));

  const subtotal = itemRows.reduce((n, r) => n + r.lineTotal, 0);
  // Total = subtotal untuk sekarang; penyesuaian (pajak/addon) menyusul.
  const total = subtotal;
  const expiresAt = new Date(Date.now() + body.dueHours * 3_600_000);

  try {
    const order = await prisma.$transaction(async (tx) => {
      // Kode unik: ulangi bila kebetulan bentrok (peluang sangat kecil).
      let code = generateOrderCode();
      for (let attempt = 0; attempt < 5; attempt++) {
        const exists = await tx.lapakOrder.findFirst({
          where: { applicationId, code }, select: { id: true },
        });
        if (!exists) break;
        code = generateOrderCode();
      }

      const created = await tx.lapakOrder.create({
        data: {
          code,
          applicationId,
          userId,
          organizationId: cart.organization.id,
          status: "MENUNGGU_PEMBAYARAN",
          applicant: body.applicant as unknown as Prisma.InputJsonValue,
          purpose: body.purpose ?? null,
          subtotal,
          total,
          expiresAt,
          items: { create: itemRows },
          statusLogs: {
            create: {
              fromStatus: "DRAFT",
              toStatus: "MENUNGGU_PEMBAYARAN",
              actorId: userId,
              note: "Checkout dari keranjang",
            },
          },
        },
        include: ORDER_INCLUDE,
      });

      // HOLD → CONFIRMED. `status: 'HOLD'` di WHERE membuat operasi ini
      // idempoten: bila sudah dikonfirmasi/dilepas, jangan ubah apa pun.
      for (const row of itemRows) {
        if (!row.reservationId) continue;
        const updated = await tx.$executeRaw`
          UPDATE lapak_reservations
          SET status = 'CONFIRMED', expires_at = NULL, updated_at = now()
          WHERE id = ${row.reservationId} AND status = 'HOLD'
        `;
        if (updated === 0) {
          throw new ConflictError(
            "Slot sudah tidak tersedia saat checkout. Muat ulang keranjang dan pegang slot kembali.",
          );
        }
      }

      return created;
    });

    // Keranjang dikosongkan setelah pesanan terbentuk — isinya sudah
    // dipindahkan sebagai snapshot ke pesanan.
    await prisma.lapakCartItem.deleteMany({ where: { cartId: cart.id } });

    return toDetailDto(order);
  } catch (err) {
    // Pelanggaran exclusion constraint saat konfirmasi ulang slot.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2010") {
      const meta = err.meta as { code?: string } | undefined;
      if (meta?.code === "23P01") {
        throw new ConflictError("Slot waktu tersebut sudah dipesan. Pilih waktu lain.");
      }
    }
    throw err;
  }
}

// ─── Baca pesanan ─────────────────────────────────────────────────────────────
const ORDER_INCLUDE = {
  organization: { select: { code: true, name: true } },
  items: { orderBy: { createdAt: "asc" as const } },
} as const;

type OrderRow = Prisma.LapakOrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

function toBaseDto(row: OrderRow) {
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    organization: row.organization,
    items: row.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      productName: i.productName,
      rateName: i.rateName,
      unit: i.unit,
      price: i.price,
      qty: i.qty,
      lineTotal: i.lineTotal,
      startAt: i.startAt?.toISOString() ?? null,
      endAt: i.endAt?.toISOString() ?? null,
      note: i.note,
    })),
    subtotal: row.subtotal,
    total: row.total,
    purpose: row.purpose,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toDetailDto(row: OrderRow): OrderDetailDto {
  return { ...toBaseDto(row), applicant: maskApplicant(row.applicant) };
}

export async function getOrder(orderId: string, userId: string): Promise<OrderDetailDto> {
  const row = await prisma.lapakOrder.findFirst({
    where: { id: orderId, userId },
    include: ORDER_INCLUDE,
  });
  // 404 (bukan 403): pesanan orang lain tidak boleh diketahui keberadaannya.
  if (!row) throw new NotFoundError("Pesanan", orderId);
  return toDetailDto(row);
}

/** Pesanan milik warga yang login. */
export async function listMyOrders(userId: string, query: ListOrdersQuery) {
  const where = {
    userId,
    ...(query.status && { status: query.status }),
  } satisfies Prisma.LapakOrderWhereInput;

  const [rows, totalItems] = await Promise.all([
    prisma.lapakOrder.findMany({
      where,
      include: ORDER_INCLUDE,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.lapakOrder.count({ where }),
  ]);

  const totalPages = Math.ceil(totalItems / query.limit) || 1;
  return {
    data: rows.map(toDetailDto),
    meta: {
      page: query.page, limit: query.limit, totalItems, totalPages,
      hasNextPage: query.page < totalPages, hasPreviousPage: query.page > 1,
    },
  };
}

/**
 * Daftar pesanan untuk CMS — disaring lingkup OPD.
 *
 * `scope === null` berarti Bapenda/superadmin: melihat semua OPD.
 */
export async function listOrdersForCms(
  scope: string[] | null,
  query: ListOrdersQuery,
) {
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
    ...(scope !== null && { organizationId: organizationId ?? { in: scope } }),
    ...(scope === null && organizationId && { organizationId }),
    ...(query.status && { status: query.status }),
  } satisfies Prisma.LapakOrderWhereInput;

  const [rows, totalItems] = await Promise.all([
    prisma.lapakOrder.findMany({
      where,
      include: ORDER_INCLUDE,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.lapakOrder.count({ where }),
  ]);

  const totalPages = Math.ceil(totalItems / query.limit) || 1;
  return {
    data: rows.map(toDetailDto),
    meta: {
      page: query.page, limit: query.limit, totalItems, totalPages,
      hasNextPage: query.page < totalPages, hasPreviousPage: query.page > 1,
    },
  };
}
