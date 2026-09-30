/**
 * utils/index.ts — helper normalisasi & format data untuk lapisan respons.
 *
 * Aturan:
 * - Format (rupiah, tanggal) dipakai saat menyusun respons API agar klien
 *   tidak mengulang logika lokal Indonesia di tiap aplikasi.
 * - Parse dipakai saat menerima input dari form/import — mengembalikan null
 *   bila tidak valid, TIDAK melempar. Validasi wajib/tidaknya milik Zod.
 * - Semua tanggal diformat pada zona Asia/Jakarta, bukan zona server, agar
 *   output stabil di mana pun API dijalankan (container biasanya UTC).
 */

// ─── Konstanta ────────────────────────────────────────────────────────────────
export const TIMEZONE = "Asia/Jakarta";
const LOCALE = "id-ID";

// ─── Tanggal: Formatter ───────────────────────────────────────────────────────
// Intl.DateTimeFormat mahal untuk dibuat berulang — dibuat sekali di sini.
const dateFmt = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIMEZONE,
  day: "2-digit",
  month: "long",
  year: "numeric",
});

const timeFmt = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
});

// en-CA memberi urutan YYYY-MM-DD, cara termurah mendapat tanggal kalender
// Jakarta tanpa menggeser objek Date secara manual.
const isoDateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Menerima Date, ISO string, atau epoch ms. null bila tidak valid. */
export function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "28 September 2026" */
export function formatDate(value: Date | string | number | null | undefined): string | null {
  const date = toDate(value);
  return date ? dateFmt.format(date) : null;
}

/**
 * "28 September 2026, 14.30"
 *
 * Disusun manual dari dua formatter, bukan satu DateTimeFormat dengan
 * dateStyle+timeStyle: ICU id-ID menyisipkan kata "pukul" ("… 2026 pukul
 * 14.30") dan kata itu berbeda antar versi ICU/Node, sehingga output API
 * ikut berubah saat runtime diperbarui.
 */
export function formatDateTime(value: Date | string | number | null | undefined): string | null {
  const date = toDate(value);
  return date ? `${dateFmt.format(date)}, ${timeFmt.format(date)}` : null;
}

/** "14.30" */
export function formatTime(value: Date | string | number | null | undefined): string | null {
  const date = toDate(value);
  return date ? timeFmt.format(date) : null;
}

/** "2026-09-28" — tanggal kalender di Jakarta, untuk input date / kunci grup. */
export function formatDateOnly(value: Date | string | number | null | undefined): string | null {
  const date = toDate(value);
  return date ? isoDateFmt.format(date) : null;
}

/** ISO 8601 UTC — bentuk kanonik untuk field mentah di respons API. */
export function toISO(value: Date | string | number | null | undefined): string | null {
  return toDate(value)?.toISOString() ?? null;
}

/**
 * Bentuk gabungan: satu field tanggal → mentah (untuk mesin) + terbaca
 * (untuk tampilan), sehingga klien tidak perlu memformat ulang.
 */
export function describeDate(
  value: Date | string | number | null | undefined,
): { iso: string; date: string; dateTime: string; relative: string } | null {
  const date = toDate(value);
  if (!date) return null;
  return {
    iso: date.toISOString(),
    date: dateFmt.format(date),
    dateTime: `${dateFmt.format(date)}, ${timeFmt.format(date)}`,
    relative: formatRelativeTime(date) ?? "",
  };
}

// ─── Tanggal: Relatif ─────────────────────────────────────────────────────────
const relativeFmt = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000_000],
  ["month", 2_592_000_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
  ["second", 1000],
];

/** "3 hari lalu", "dalam 2 jam", "sekarang" — untuk lastLoginAt dsb. */
export function formatRelativeTime(
  value: Date | string | number | null | undefined,
  now: Date = new Date(),
): string | null {
  const date = toDate(value);
  if (!date) return null;

  const diffMs = date.getTime() - now.getTime();

  for (const [unit, ms] of RELATIVE_UNITS) {
    if (Math.abs(diffMs) >= ms) {
      return relativeFmt.format(Math.round(diffMs / ms), unit);
    }
  }
  return "sekarang";
}

// ─── Tanggal: Rentang Hari ────────────────────────────────────────────────────
/**
 * Batas awal & akhir satu hari kalender Jakarta sebagai Date UTC —
 * untuk filter `createdAt: { gte, lte }` pada query harian.
 * Offset dipatok +07.00: Jambi/WIB tidak memakai DST.
 */
export function jakartaDayRange(
  value: Date | string | number,
): { start: Date; end: Date } | null {
  const dateOnly = formatDateOnly(value);
  if (!dateOnly) return null;
  return {
    start: new Date(`${dateOnly}T00:00:00.000+07:00`),
    end: new Date(`${dateOnly}T23:59:59.999+07:00`),
  };
}

// ─── Uang ─────────────────────────────────────────────────────────────────────
const rupiahFmt = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const numberFmt = new Intl.NumberFormat(LOCALE);

/** Normalisasi apa pun yang menyerupai angka → number, atau null. */
function toNumber(value: number | string | bigint | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * "Rp1.250.000" — pecahan dibuang karena rupiah dalam konteks pajak/retribusi
 * tidak pernah memakai sen.
 */
export function formatRupiah(value: number | string | bigint | null | undefined): string | null {
  const n = toNumber(value);
  return n === null ? null : rupiahFmt.format(Math.round(n));
}

/** "1.250.000" — angka dengan pemisah ribuan, tanpa simbol mata uang. */
export function formatNumber(
  value: number | string | bigint | null | undefined,
  fractionDigits?: number,
): string | null {
  const n = toNumber(value);
  if (n === null) return null;
  if (fractionDigits === undefined) return numberFmt.format(n);
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(n);
}

/**
 * Parse input rupiah dari form/import: "Rp 1.250.000", "1.250.000,50",
 * "1250000" → number. null bila bukan angka.
 *
 * Titik = pemisah ribuan, koma = desimal (konvensi Indonesia). Dibuat
 * eksplisit karena Number("1.250.000") menghasilkan NaN dan
 * Number("1.250") menghasilkan 1.25 — dua-duanya salah di sini.
 */
export function parseRupiah(value: string | number | null | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (!value) return null;

  const cleaned = value
    .replace(/rp/gi, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

/** "Rp1.250.000" + nilai mentah, untuk field uang di respons API. */
export function describeRupiah(
  value: number | string | bigint | null | undefined,
): { value: number; formatted: string } | null {
  const n = toNumber(value);
  if (n === null) return null;
  return { value: n, formatted: rupiahFmt.format(Math.round(n)) };
}

// ─── Persen & Ukuran File ─────────────────────────────────────────────────────
/** 0.1234 → "12,34%" (rasio) ; pakai isRatio=false bila nilainya sudah 12.34 */
export function formatPercent(
  value: number | string | null | undefined,
  isRatio = true,
): string | null {
  const n = toNumber(value);
  if (n === null) return null;
  return new Intl.NumberFormat(LOCALE, {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(isRatio ? n : n / 100);
}

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/** 1536 → "1,5 KB" — untuk metadata upload. */
export function formatBytes(value: number | string | null | undefined): string | null {
  const n = toNumber(value);
  if (n === null || n < 0) return null;
  if (n === 0) return "0 B";

  const exp = Math.min(Math.floor(Math.log(n) / Math.log(1024)), BYTE_UNITS.length - 1);
  const size = n / 1024 ** exp;
  const digits = exp === 0 ? 0 : 1;
  return `${formatNumber(size, digits)} ${BYTE_UNITS[exp]}`;
}

// ─── Teks ─────────────────────────────────────────────────────────────────────
/** Rapikan input teks: trim + runtuhkan spasi ganda. null bila jadi kosong. */
export function normalizeText(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned.length > 0 ? cleaned : null;
}

/** Lowercase + trim — untuk username/email/kode aplikasi. */
export function normalizeLower(value: string | null | undefined): string | null {
  return normalizeText(value)?.toLowerCase() ?? null;
}

/** "Budi Santoso" dari "  budi   SANTOSO " — untuk nama & alamat. */
export function toTitleCase(value: string | null | undefined): string | null {
  const cleaned = normalizeText(value);
  if (!cleaned) return null;
  return cleaned
    .toLowerCase()
    .replace(/(^|[\s'-])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** "profil-bapenda-jambi" — slug URL-safe. */
export function slugify(value: string | null | undefined): string | null {
  const cleaned = normalizeText(value);
  if (!cleaned) return null;
  const slug = cleaned
    .toLowerCase()
    // Pisahkan diakritik lalu buang — "Café" → "Cafe".
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : null;
}

/** Potong teks pada batas kata + "…" — untuk ringkasan daftar. */
export function truncate(
  value: string | null | undefined,
  maxLength = 120,
  suffix = "…",
): string | null {
  const cleaned = normalizeText(value);
  if (!cleaned || cleaned.length <= maxLength) return cleaned;
  const cut = cleaned.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + suffix;
}

/** "Bu***" — sensor nilai sensitif sebelum masuk log/audit. */
export function maskString(value: string | null | undefined, visible = 2): string | null {
  const cleaned = normalizeText(value);
  if (!cleaned) return null;
  if (cleaned.length <= visible) return "*".repeat(cleaned.length);
  return cleaned.slice(0, visible) + "*".repeat(Math.min(cleaned.length - visible, 6));
}

/** "bu***@jambiprov.go.id" — untuk log & tampilan daftar. */
export function maskEmail(value: string | null | undefined): string | null {
  const email = normalizeLower(value);
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at <= 0) return maskString(email);
  return `${maskString(email.slice(0, at))}${email.slice(at)}`;
}

// ─── Nomor Telepon ────────────────────────────────────────────────────────────
/**
 * Normalisasi nomor Indonesia ke bentuk E.164: "0812-3456-789",
 * "+62 812 3456 789", "62812..." → "+628123456789". null bila tidak masuk akal.
 */
export function normalizePhone(value: string | null | undefined): string | null {
  if (!value) return null;
  let digits = value.replace(/[^\d+]/g, "");

  if (digits.startsWith("+62")) digits = digits.slice(3);
  else if (digits.startsWith("62")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = digits.slice(1);
  else digits = digits.replace(/^\+/, "");

  // Nomor Indonesia tanpa kode negara: 8–13 digit.
  if (!/^\d{8,13}$/.test(digits)) return null;
  return `+62${digits}`;
}

/** "+62 812-3456-789" — bentuk tampilan. */
export function formatPhone(value: string | null | undefined): string | null {
  const normalized = normalizePhone(value);
  if (!normalized) return null;
  const digits = normalized.slice(3);
  const head = digits.slice(0, 3);
  const rest = digits.slice(3).replace(/(\d{4})(?=\d)/g, "$1-");
  return `+62 ${head}-${rest}`;
}

// ─── Boolean ──────────────────────────────────────────────────────────────────
/**
 * Parse boolean dari query string / CSV: "true", "1", "ya", "y", "on".
 * undefined bila tidak dikenali — pemanggil memutuskan default, sehingga
 * "filter tidak dikirim" tidak tertukar dengan "filter = false".
 */
export function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value !== "string") return undefined;

  const v = value.trim().toLowerCase();
  if (["true", "1", "ya", "y", "yes", "on"].includes(v)) return true;
  if (["false", "0", "tidak", "n", "no", "off"].includes(v)) return false;
  return undefined;
}
