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
  description?: string;
  isActive?: boolean;
  /** Absen = INTERNAL. */
  audience?: Audience;
  logoUrl?: string;
  /** { branding, seo } — bentuknya divalidasi ApplicationSettingsSchema di API. */
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

// ─── users.json ───────────────────────────────────────────────────────────────
export interface RoleAssignmentDef {
  app: string;
  role: string;
  /** null/absen = permanen, "expired", "+30d", atau ISO date. */
  expiresAt?: string | null;
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
}

export interface BannersFile {
  banners: BannerDef[];
}


