import { Prisma, type SkrdIssuer, type SkrdDocumentType } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { prisma } from "~/config/database.js";
import { NotFoundError, BadRequestError, ConflictError } from "~/common/errors/index.js";
import { APP_CODES } from "~/common/constants/index.js";
import type {
  UpsertSkrdSettingBody,
  IssueSkrdBody,
  ListSkrdQuery,
  SkrdSettingDto,
  SkrdDto,
} from "./skrd.schema.js";

/**
 * Pengaturan & penerbitan SKRD (LJ-2.5, PRD 04 §D).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PENOMORAN GAPLESS — bagian paling sensitif modul ini.
 *
 * Aturan yang dijaga:
 *   1. Nomor berurutan tanpa lompat, per (penerbit, tahun).
 *   2. Nomor yang sudah dipakai TIDAK PERNAH dipakai ulang — meski SKRD-nya
 *      dibatalkan. Karena itu `last_number` hanya pernah NAIK.
 *   3. Dua checkout bersamaan tidak boleh memperoleh nomor sama.
 *
 * Cara mencapainya: `SELECT ... FOR UPDATE` pada baris sequence DI DALAM
 * transaksi penerbitan SKRD. Request kedua menunggu sampai yang pertama commit,
 * lalu membaca angka terbaru. Tanpa row lock, dua request bisa membaca
 * `last_number` yang sama dan menghasilkan nomor kembar.
 *
 * Konsumsi nomor terjadi dalam transaksi yang SAMA dengan pembuatan SKRD:
 * bila pembuatan SKRD gagal, seluruh transaksi rollback sehingga nomor tidak
 * terbuang. Lubang nomor adalah temuan audit.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const BAPENDA_KEY = "BAPENDA";

async function getLapakAppId(): Promise<string> {
  const app = await prisma.application.findUniqueOrThrow({
    where: { code: APP_CODES.LAPAK_JAMBI_WEB },
    select: { id: true },
  });
  return app.id;
}

// ─── Format nomor ─────────────────────────────────────────────────────────────
const ROMAN = [
  "I", "II", "III", "IV", "V", "VI",
  "VII", "VIII", "IX", "X", "XI", "XII",
];

/**
 * Terapkan template nomor. Seluruh penggantian memakai satu regex sekali jalan
 * agar token yang sudah tersubstitusi tidak ikut diproses ulang.
 */
function formatNumber(
  template: string,
  vars: { seq: number; issuer: string; orgCode: string; date: Date },
): string {
  const romanMonth = ROMAN[vars.date.getMonth()] ?? "I";
  const map: Record<string, string> = {
    "{seq}": String(vars.seq),
    "{seq6}": String(vars.seq).padStart(6, "0"),
    "{issuer}": vars.issuer,
    "{romanMonth}": romanMonth,
    "{month}": String(vars.date.getMonth() + 1).padStart(2, "0"),
    "{year}": String(vars.date.getFullYear()),
    "{orgCode}": vars.orgCode,
  };
  return template.replace(/\{[a-zA-Z0-9]+\}/g, (t) => map[t] ?? t);
}

// ─── Pengaturan ───────────────────────────────────────────────────────────────
function toSettingDto(row: {
  id: string;
  organization: { code: string; name: string } | null;
  issuer: SkrdIssuer;
  numberFormat: string;
  signerName: string;
  signerNip: string | null;
  signerPosition: string | null;
  bankName: string | null;
  bankAccount: string | null;
  bankHolder: string | null;
  dueDays: number;
  isActive: boolean;
}): SkrdSettingDto {
  return {
    id: row.id,
    organizationCode: row.organization?.code ?? null,
    organizationName: row.organization?.name ?? null,
    issuer: row.issuer,
    numberFormat: row.numberFormat,
    signerName: row.signerName,
    signerNip: row.signerNip,
    signerPosition: row.signerPosition,
    bankName: row.bankName,
    bankAccount: row.bankAccount,
    bankHolder: row.bankHolder,
    dueDays: row.dueDays,
    isActive: row.isActive,
  };
}

const SETTING_INCLUDE = {
  organization: { select: { code: true, name: true } },
} as const;

export async function listSkrdSettings() {
  const applicationId = await getLapakAppId();
  const rows = await prisma.lapakSkrdSetting.findMany({
    where: { applicationId },
    include: SETTING_INCLUDE,
    orderBy: [{ organizationId: "asc" }],
  });
  return rows.map(toSettingDto);
}

/**
 * Simpan pengaturan (upsert per OPD, atau baris default bila kode kosong).
 *
 * Pengaturan bersifat SNAPSHOT saat SKRD terbit — mengubahnya sekarang tidak
 * mengubah dokumen yang sudah terbit.
 */
export async function upsertSkrdSetting(body: UpsertSkrdSettingBody) {
  const applicationId = await getLapakAppId();

  let organizationId: string | null = null;
  if (body.organizationCode) {
    const org = await prisma.organization.findFirst({
      where: { code: body.organizationCode, deletedAt: null },
      select: { id: true },
    });
    if (!org) throw new NotFoundError("Organisasi", body.organizationCode);
    organizationId = org.id;
  }

  const data = {
    issuer: body.issuer,
    numberFormat: body.numberFormat,
    signerName: body.signerName,
    signerNip: body.signerNip ?? null,
    signerPosition: body.signerPosition ?? null,
    bankName: body.bankName ?? null,
    bankAccount: body.bankAccount ?? null,
    bankHolder: body.bankHolder ?? null,
    dueDays: body.dueDays,
    isActive: body.isActive,
  };

  // Upsert manual: Prisma tidak bisa memakai compound unique dengan NULL
  // (`organizationId = null`), jadi cari dulu lalu create/update.
  const existing = await prisma.lapakSkrdSetting.findFirst({
    where: { applicationId, organizationId },
    select: { id: true },
  });

  const row = existing
    ? await prisma.lapakSkrdSetting.update({
        where: { id: existing.id },
        data,
        include: SETTING_INCLUDE,
      })
    : await prisma.lapakSkrdSetting.create({
        data: { applicationId, organizationId, ...data },
        include: SETTING_INCLUDE,
      });

  return toSettingDto(row);
}

export async function deleteSkrdSetting(id: string) {
  const existing = await prisma.lapakSkrdSetting.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError("Pengaturan SKRD", id);
  await prisma.lapakSkrdSetting.delete({ where: { id } });
  return { id, deleted: true as const };
}

/**
 * Pengaturan efektif untuk sebuah OPD.
 *
 * Urutan kekhususan: pengaturan OPD → pengaturan default (Bapenda).
 * Bila keduanya tidak ada, penerbitan SKRD ditolak — lebih baik gagal jelas
 * daripada menerbitkan dokumen negara tanpa penandatangan & rekening.
 */
async function resolveSetting(organizationId: string, organizationCode: string) {
  const applicationId = await getLapakAppId();
  const specific = await prisma.lapakSkrdSetting.findFirst({
    where: { applicationId, organizationId, isActive: true },
  });
  if (specific) return { setting: specific, organizationCode };

  const fallback = await prisma.lapakSkrdSetting.findFirst({
    where: { applicationId, organizationId: null, isActive: true },
  });
  if (fallback) return { setting: fallback, organizationCode };

  throw new BadRequestError(
    "Pengaturan SKRD belum ada. Bapenda harus mengatur penerbit, penandatangan, dan rekening terlebih dahulu.",
  );
}

// ─── Terbitkan SKRD ───────────────────────────────────────────────────────────
/**
 * Terbitkan SKRD untuk sebuah pesanan.
 *
 * WAJIB dipanggil di dalam transaksi yang sama dengan pembuatan pesanan
 * (checkout) agar nomor tidak terbuang bila pesanan gagal dibuat. Fungsi ini
 * menerima `tx` supaya pemanggil mengendalikan batas transaksi.
 */
export async function issueSkrdInTx(
  tx: Prisma.TransactionClient,
  params: { orderId: string; organizationId: string; amount: number },
  options: IssueSkrdBody,
): Promise<SkrdDto> {
  // Idempoten: pesanan sudah punya SKRD → kembalikan yang ada.
  const existing = await tx.lapakSkrd.findUnique({
    where: { orderId: params.orderId },
    include: { order: { select: { code: true } } },
  });
  if (existing) return toSkrdDto(existing);

  const org = await tx.organization.findUniqueOrThrow({
    where: { id: params.organizationId },
    select: { code: true, name: true },
  });

  const applicationId = await getLapakAppId();
  const specific = await tx.lapakSkrdSetting.findFirst({
    where: { applicationId, organizationId: params.organizationId, isActive: true },
  });
  const setting = specific ?? await tx.lapakSkrdSetting.findFirst({
    where: { applicationId, organizationId: null, isActive: true },
  });
  if (!setting) {
    throw new BadRequestError(
      "Pengaturan SKRD belum ada. Bapenda harus mengatur penerbit, penandatangan, dan rekening terlebih dahulu.",
    );
  }

  const issuedAt = options.issuedAt ? new Date(options.issuedAt) : new Date();
  const dueAt = new Date(issuedAt.getTime() + setting.dueDays * 86_400_000);
  const year = issuedAt.getFullYear();

  // Penerbit menentukan kunci sequence: BAPENDA (global) atau kode OPD.
  const issuerKey = setting.issuer === "BAPENDA" ? BAPENDA_KEY : org.code;

  // ── KUNCI GAUNTLESS ────────────────────────────────────────────────────────
  // Baris sequence dibaca dengan FOR UPDATE. Request paralel untuk penerbit &
  // tahun yang sama akan MENGANTRE di sini sampai transaksi pertama commit,
  // sehingga tidak mungkin dua SKRD mendapat nomor yang sama.
  const locked = await tx.$queryRaw<Array<{ last_number: number }>>`
    SELECT last_number FROM lapak_skrd_sequences
    WHERE issuer_key = ${issuerKey} AND year = ${year}
    FOR UPDATE
  `;

  let seq: number;
  if (locked.length === 0) {
    // Baris pertama tahun ini. INSERT bisa bentrok bila dua request datang
    // bersamaan pada saat yang sama — unique index yang menjamin hanya satu
    // menang, dan yang kalah mencoba lagi setelah baris itu ada.
    try {
      await tx.$executeRaw`
        INSERT INTO lapak_skrd_sequences (id, issuer_key, year, last_number, updated_at)
        VALUES (gen_random_uuid()::text, ${issuerKey}, ${year}, 1, now())
      `;
      seq = 1;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2010") {
        throw new ConflictError("Gagal mengambil nomor SKRD — coba ulangi");
      }
      throw err;
    }
  } else {
    seq = (locked[0]?.last_number ?? 0) + 1;
    await tx.$executeRaw`
      UPDATE lapak_skrd_sequences
      SET last_number = ${seq}, updated_at = now()
      WHERE issuer_key = ${issuerKey} AND year = ${year}
    `;
  }

  const number = formatNumber(setting.numberFormat, {
    seq,
    issuer: setting.issuer === "BAPENDA" ? "BAPENDA" : org.code,
    orgCode: org.code,
    date: issuedAt,
  });

  const issuerCode = setting.issuer === "BAPENDA" ? "BAPENDA" : org.code;
  const issuerName = setting.issuer === "BAPENDA" ? "Badan Pengelolaan Keuangan dan Pendapatan Daerah Provinsi Jambi" : org.name;

  const created = await tx.lapakSkrd.create({
    data: {
      orderId: params.orderId,
      number,
      documentType: options.documentType as SkrdDocumentType,
      issuer: setting.issuer,
      issuerCode,
      issuerName,
      // Snapshot: perubahan pengaturan besok tidak mengubah dokumen ini.
      signerName: setting.signerName,
      signerNip: setting.signerNip,
      signerPosition: setting.signerPosition,
      bankName: setting.bankName,
      bankAccount: setting.bankAccount,
      bankHolder: setting.bankHolder,
      amount: params.amount,
      issuedAt,
      dueAt,
      status: "TERBIT",
      // Token verifikasi: 32 byte acak — tidak bisa diturunkan dari nomor.
      qrToken: randomBytes(24).toString("base64url"),
    },
    include: { order: { select: { code: true } } },
  });

  return toSkrdDto(created);
}

/** Terbitkan SKRD untuk pesanan yang belum punya (mis. setelah migrasi data). */
export async function issueSkrdForOrder(orderId: string, options: IssueSkrdBody) {
  const order = await prisma.lapakOrder.findUnique({
    where: { id: orderId },
    select: { id: true, organizationId: true, total: true, status: true },
  });
  if (!order) throw new NotFoundError("Pesanan", orderId);
  if (order.status === "DIBATALKAN" || order.status === "KEDALUWARSA") {
    throw new BadRequestError("Pesanan sudah dibatalkan/kedaluwarsa — SKRD tidak bisa diterbitkan");
  }

  return prisma.$transaction((tx) =>
    issueSkrdInTx(tx, { orderId: order.id, organizationId: order.organizationId, amount: order.total }, options),
  );
}

// ─── Baca ─────────────────────────────────────────────────────────────────────
type SkrdRow = Prisma.LapakSkrdGetPayload<{ include: { order: { select: { code: true } } } }>;

function toSkrdDto(row: SkrdRow): SkrdDto {
  return {
    id: row.id,
    orderId: row.orderId,
    orderCode: row.order.code,
    number: row.number,
    documentType: row.documentType,
    issuer: row.issuer,
    issuerCode: row.issuerCode,
    issuerName: row.issuerName,
    signerName: row.signerName,
    signerNip: row.signerNip,
    signerPosition: row.signerPosition,
    bankName: row.bankName,
    bankAccount: row.bankAccount,
    bankHolder: row.bankHolder,
    amount: row.amount,
    issuedAt: row.issuedAt.toISOString(),
    dueAt: row.dueAt.toISOString(),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

const SKRD_INCLUDE = { order: { select: { code: true } } } as const;

export async function getSkrd(id: string): Promise<SkrdDto> {
  const row = await prisma.lapakSkrd.findUnique({ where: { id }, include: SKRD_INCLUDE });
  if (!row) throw new NotFoundError("SKRD", id);
  return toSkrdDto(row);
}

export async function getSkrdByOrder(orderId: string): Promise<SkrdDto> {
  const row = await prisma.lapakSkrd.findUnique({ where: { orderId }, include: SKRD_INCLUDE });
  if (!row) throw new NotFoundError("SKRD untuk pesanan ini", orderId);
  return toSkrdDto(row);
}

/**
 * Verifikasi publik lewat token QR.
 *
 * Sengaja TIDAK mengembalikan PII: tujuan verifikasi hanya membuktikan dokumen
 * asli, bukan menampilkan identitas pemohon. Nama pemohon pun dimasking.
 */
export async function verifySkrdByToken(token: string) {
  const row = await prisma.lapakSkrd.findUnique({
    where: { qrToken: token },
    include: {
      order: { select: { code: true, applicant: true } },
    },
  });
  if (!row) throw new NotFoundError("Dokumen", token);

  const applicant = (row.order.applicant ?? {}) as { name?: string };
  const name = applicant.name ?? "-";
  // Masking nama: tampilkan 2 kata pertama, sisanya inisial.
  const maskedName = name.length <= 3 ? name : `${name.slice(0, 2)}${"*".repeat(Math.max(2, name.length - 3))}${name.slice(-1)}`;

  return {
    number: row.number,
    documentType: row.documentType,
    issuerCode: row.issuerCode,
    issuerName: row.issuerName,
    amount: row.amount,
    issuedAt: row.issuedAt.toISOString(),
    dueAt: row.dueAt.toISOString(),
    status: row.status,
    orderCode: row.order.code,
    applicantName: maskedName,
    valid: row.status !== "CANCELLED",
  };
}

export async function listSkrds(scope: string[] | null, query: ListSkrdQuery) {
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

  // SKRD disaring lewat relasi order → organizationId.
  const where = {
    ...(query.status && { status: query.status }),
    ...(organizationId
      ? { order: { organizationId } }
      : scope !== null ? { order: { organizationId: { in: scope } } } : {}),
  } satisfies Prisma.LapakSkrdWhereInput;

  const [rows, totalItems] = await Promise.all([
    prisma.lapakSkrd.findMany({
      where,
      include: SKRD_INCLUDE,
      orderBy: { issuedAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.lapakSkrd.count({ where }),
  ]);

  const totalPages = Math.ceil(totalItems / query.limit) || 1;
  return {
    data: rows.map(toSkrdDto),
    meta: {
      page: query.page, limit: query.limit, totalItems, totalPages,
      hasNextPage: query.page < totalPages, hasPreviousPage: query.page > 1,
    },
  };
}

/** Batalkan SKRD — nomor TIDAK dikembalikan (gapless: nomor tidak dipakai ulang). */
export async function cancelSkrd(id: string) {
  const row = await prisma.lapakSkrd.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!row) throw new NotFoundError("SKRD", id);
  if (row.status === "CANCELLED") throw new BadRequestError("SKRD sudah dibatalkan");

  const updated = await prisma.lapakSkrd.update({
    where: { id },
    data: { status: "CANCELLED" },
    include: SKRD_INCLUDE,
  });
  return toSkrdDto(updated);
}

/** Cek pratinjau nomor berikutnya tanpa memakainya (untuk UI pengaturan). */
export async function previewNextNumber(organizationCode: string) {
  const org = await prisma.organization.findFirst({
    where: { code: organizationCode, deletedAt: null },
    select: { id: true, code: true },
  });
  if (!org) throw new NotFoundError("Organisasi", organizationCode);

  const { setting, organizationCode: code } = await resolveSetting(org.id, org.code);
  const issuerKey = setting.issuer === "BAPENDA" ? BAPENDA_KEY : code;
  const year = new Date().getFullYear();

  const seq = await prisma.lapakSkrdSequence.findUnique({
    where: { issuerKey_year: { issuerKey, year } },
    select: { lastNumber: true },
  });

  const nextSeq = (seq?.lastNumber ?? 0) + 1;
  return {
    issuer: setting.issuer,
    issuerKey,
    year,
    nextSeq,
    preview: formatNumber(setting.numberFormat, {
      seq: nextSeq,
      issuer: setting.issuer === "BAPENDA" ? "BAPENDA" : code,
      orgCode: code,
      date: new Date(),
    }),
  };
}
