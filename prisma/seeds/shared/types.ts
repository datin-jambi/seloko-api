/**
 * types.ts — Bentuk berkas JSON di prisma/seed-data/.
 *
 * Satu-satunya tempat bentuk data seed didefinisikan. Mengubah JSON tanpa
 * memperbarui berkas ini akan lolos tanpa peringatan, jadi keduanya harus
 * berubah bersamaan.
 */

// ─── applications.json ────────────────────────────────────────────────────────
export type Audience = "INTERNAL" | "PUBLIC";

export interface PermissionDef {
  module: string;
  entity: string;
  label: string;
  /** Aksi tunggal ("read") atau nama grup dari roles.json ("content"). */
  actions: string[];
}

export interface ApplicationDef {
  code: string;
  name: string;
  tagline?: string;
  description?: string;
  isActive?: boolean;
  /** Absen = INTERNAL. */
  audience?: Audience;
  logoUrl?: string;
  /** { branding, contact, seo, features, legal } — bentuknya divalidasi ApplicationSettingsSchema di API. */
  settings?: Record<string, unknown>;
  permissions: PermissionDef[];
}

export interface ApplicationsFile {
  applications: ApplicationDef[];
}

// ─── roles.json ───────────────────────────────────────────────────────────────
export interface RoleDef {
  name: string;
  description: string;
  /** null = seluruh permission aplikasi. */
  allowedActions: string[] | null;
  /**
   * Batasi ke entity tertentu (mis. `["product", "order", "ticket"]`).
   * Absen/null = semua entity. Dipakai memisahkan wewenang master (Bapenda)
   * dari wewenang operasional OPD saat aksi keduanya sama.
   */
  allowedEntities?: string[] | null;
  /** Kode aplikasi tempat role dibuat. Absen = semua aplikasi. */
  apps?: string[];
  isActive?: boolean;
  /** Absen = INTERNAL. Role PUBLIC hanya dibuat di aplikasi PUBLIC. */
  audience?: Audience;
}

export interface RolesFile {
  actionLabels: Record<string, string>;
  actionGroups: Record<string, string[]>;
  roles: RoleDef[];
}

// ─── lapak/categories.json ────────────────────────────────────────────────────
/** Atribut bawaan yang diwarisi produk baru pada kategori ini (LJ-1.2). */
export type PricingUnit =
  | "SESSION" | "HOUR" | "DAY" | "NIGHT" | "MONTH" | "YEAR"
  | "PERSON" | "UNIT" | "M2" | "TEST" | "TRIP";

export type AvailabilityType = "SLOT" | "DATE_RANGE" | "CONTRACT" | "STOCK" | "SCHEDULE";
export type FulfillmentType = "TICKET_QR" | "BOOKING" | "CONTRACT" | "SCHEDULE" | "RESULT" | "DOCUMENT_SKRD";

export interface LapakCategoryDef {
  name: string;
  /** Stabil di URL publik; unik per aplikasi. */
  slug: string;
  description?: string;
  /** Nama ikon lucide untuk kartu kategori. */
  icon?: string;
  sortOrder?: number;
  isActive?: boolean;
  defaultPricingUnit?: PricingUnit;
  defaultAvailabilityType?: AvailabilityType;
  defaultFulfillmentType?: FulfillmentType;
}

export interface LapakCategoriesFile {
  $comment?: string;
  categories: LapakCategoryDef[];
}

// ─── lapak/products.json — produk & tarif contoh (Perda Jambi 5/2024) ─────────
export interface LapakSeedRate {
  name: string;
  unit: string;
  price: number;
  minQty?: number;
}

export interface LapakSeedProduct {
  /** Kode OPD pengelola; `null` = belum ada di seed organisasi, dilewati. */
  opd: string | null;
  /** Slug kategori layanan (lihat lapak/categories.json). */
  kategori: string;
  nama: string;
  deskripsi: string;
  pricingUnit: string;
  rates: LapakSeedRate[];
}

export interface LapakProductsFile {
  /** Metadata sumber hukum — tidak dibaca seeder, hanya jejak riset. */
  _sumber?: Record<string, string>;
  produk: LapakSeedProduct[];
}

// ─── users.json ───────────────────────────────────────────────────────────────
export interface RoleAssignmentDef {
  app: string;
  role: string;
  /** null/absen = permanen, "expired", "+30d", atau ISO date. */
  expiresAt?: string | null;
  /**
   * Kode OPD yang membatasi penugasan (dari organizations.json).
   * Absen/kosong = berlaku untuk SELURUH OPD (level Bapenda).
   */
  organizationCodes?: string[];
}

export interface UserDef {
  /** Absen = INTERNAL (pegawai). */
  accountType?: Audience;
  /** Wajib untuk INTERNAL; akun PUBLIC tidak punya username. */
  username?: string;
  email: string;
  fullName: string;
  nip?: string;
  phoneNumber?: string;
  isSuperAdmin?: boolean;
  isActive?: boolean;
  emailVerified?: boolean;
  softDeleted?: boolean;
  /** Password khusus; bila absen memakai defaultPassword. */
  password?: string;
  /** Nama env var yang menimpa password bila diset. */
  passwordEnv?: string;
  roles: RoleAssignmentDef[];
}

export interface BulkDef {
  count: number;
  usernamePrefix: string;
  emailDomain: string;
  app: string;
  role: string;
  firstNames: string[];
  lastNames: string[];
}

export interface UsersFile {
  defaultPassword: string;
  users: UserDef[];
  bulk: BulkDef;
}

// ─── menus.json ───────────────────────────────────────────────────────────────
/** Satu baris sidebar; `items` membuat anak secara rekursif. */
export interface MenuDef {
  code: string;
  label: string;
  icon?: string;
  path?: string;
  isExternal?: boolean;
  isActive?: boolean;
  /** Kode permission di aplikasi yang sama. Absen = bebas izin. */
  permission?: string;
  /** Nama role yang boleh melihat. Absen/kosong = semua role. */
  roles?: string[];
  items?: MenuDef[];
}

export interface AppMenuDef {
  code: string;
  baseUrl?: string;
  icon?: string;
  items: MenuDef[];
}

export interface MenusFile {
  applications: AppMenuDef[];
}

// ─── Indeks lookup ────────────────────────────────────────────────────────────
/** Penunjuk role berikut aplikasinya, dikunci "<appCode>/<roleName>". */
export interface RoleRef {
  roleId: string;
  applicationId: string;
}

// ─── bapenda-uptds.json ───────────────────────────────────────────────────────
export interface BapendaUptdDef {
  code: string;
  name: string;
  description?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  headName?: string | null;
  province?: string | null;
  city?: string | null;
  district?: string | null;
  subDistrict?: string | null;
  postalCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  googleMapsUrl?: string | null;
  isActive?: boolean;
  showOnPublicMap?: boolean;
}

export interface BapendaUptdsFile {
  uptds: BapendaUptdDef[];
}

// ─── banners.json ─────────────────────────────────────────────────────────────
export interface BannerDef {
  title: string;
  description?: string | null;
  imageUrl: string;
  imageFileId?: string | null;
  mobileImageUrl?: string | null;
  mobileImageFileId?: string | null;
  buttonText?: string | null;
  buttonUrl?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
  deletedAt?: string | null;
}

export interface BannersFile {
  banners: BannerDef[];
}

// ─── news.json ────────────────────────────────────────────────────────────────
export interface NewsCategoryDef {
  name: string;
  slug: string;
  description?: string | null;
  isActive?: boolean;
  sortOrder?: number;
  createdAt?: string | null;
  updatedAt?: string | null;
  deletedAt?: string | null;
}

export interface NewsDef {
  categorySlug: string;
  /** Username user SELOKO yang menjadi penulis. */
  authorUsername: string;
  title: string;
  slug: string;
  excerpt?: string | null;
  content: string;
  thumbnailUrl?: string | null;
  status: "DRAFT" | "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "PUBLISHED";
  publishedAt?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  deletedAt?: string | null;
}

export interface NewsFile {
  categories: NewsCategoryDef[];
  news: NewsDef[];
}

// ─── galleries.json ───────────────────────────────────────────────────────────
export interface GalleryItemDef {
  mediaType: "IMAGE" | "VIDEO" | "PDF";
  fileUrl: string;
  title?: string | null;
  description?: string | null;
  sortOrder: number;
  createdAt?: string | null;
  deletedAt?: string | null;
}

export interface GalleryDef {
  slug: string;
  title: string;
  description?: string | null;
  coverImageUrl?: string | null;
  status: "DRAFT" | "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "PUBLISHED";
  publishedAt?: string | null;
  authorUsername: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  deletedAt?: string | null;
  items: GalleryItemDef[];
}

export interface GalleriesFile {
  galleries: GalleryDef[];
}

// ─── faqs.json ────────────────────────────────────────────────────────────────
export interface FaqCategoryDef {
  slug: string;
  name: string;
  description?: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
  deletedAt?: string | null;
}

export interface FaqDef {
  categorySlug: string;
  slug: string;
  question: string;
  answer: string;
  sortOrder: number;
  isPublished: boolean;
  viewCount?: number;
  publishedAt?: string | null;
  authorUsername: string;
  updatedByUsername?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  deletedAt?: string | null;
}

export interface FaqsFile {
  categories: FaqCategoryDef[];
  faqs: FaqDef[];
}

// ─── organizations.json ───────────────────────────────────────────────────────
export type OrganizationTypeDef = "OPD" | "UPTD" | "BIRO" | "LAINNYA";

export interface OrganizationDef {
  code: string;
  name: string;
  shortName?: string;
  /** Absen = OPD. */
  type?: OrganizationTypeDef;
  /** Kode organisasi induk. */
  parent?: string;
  isActive?: boolean;
}

export interface OrganizationsFile {
  organizations: OrganizationDef[];
}

// ─── pages.json ───────────────────────────────────────────────────────────────
export interface PageDef {
  title: string;
  slug: string;
  content: string;
  seoTitle?: string | null;
  seoDescription?: string | null;
  isPublished?: boolean;
  publishedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  deletedAt?: string | null;
}

export interface PagesFile {
  pages: PageDef[];
}


