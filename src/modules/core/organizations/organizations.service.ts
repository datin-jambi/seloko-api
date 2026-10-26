import { prisma } from "~/config/database.js";
import { BadRequestError, ConflictError, NotFoundError } from "~/common/errors/index.js";
import { buildPaginatedResult } from "~/common/types/index.js";
import type { Prisma } from "@prisma/client";
import type {
  CreateOrganizationBody,
  ListOrganizationsQuery,
  PublicListOrganizationsQuery,
  UpdateOrganizationBody,
} from "./organizations.schema.js";

const ORG_SELECT = {
  id: true,
  code: true,
  name: true,
  shortName: true,
  type: true,
  parentId: true,
  description: true,
  address: true,
  phone: true,
  email: true,
  website: true,
  logoUrl: true,
  logoFileId: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Tanggal DB → string ISO, supaya bentuk respons sama dengan modul lain. */
const iso = <T extends { createdAt: Date; updatedAt: Date }>(row: T) => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

/** Induk wajib ada; sekaligus menolak organisasi menjadi induk dirinya sendiri. */
async function assertParentExists(parentId: string | null | undefined, selfId?: string): Promise<void> {
  if (!parentId) return;
  if (parentId === selfId) {
    throw new BadRequestError("Organisasi tidak boleh menjadi induk dirinya sendiri");
  }
  const parent = await prisma.organization.findFirst({
    where: { id: parentId, deletedAt: null },
    select: { id: true },
  });
  if (!parent) throw new BadRequestError(`Organisasi induk dengan ID "${parentId}" tidak ditemukan`);
}

/**
 * Tolak pemindahan induk yang membentuk siklus (A → B → A).
 *
 * Ditelusuri ke atas dari calon induk: bila bertemu `selfId`, rantainya
 * memutar. Kedalaman dibatasi agar data lama yang sudah cacat tidak membuat
 * request menggantung.
 */
async function assertNoCycle(selfId: string, parentId: string | null | undefined): Promise<void> {
  if (!parentId) return;
  let cursor: string | null = parentId;
  for (let depth = 0; cursor && depth < 50; depth++) {
    if (cursor === selfId) {
      throw new BadRequestError("Hierarki organisasi tidak boleh memutar (induk berada di bawah organisasi ini)");
    }
    const row: { parentId: string | null } | null = await prisma.organization.findUnique({
      where: { id: cursor },
      select: { parentId: true },
    });
    cursor = row?.parentId ?? null;
  }
}

// ─── List (CMS) ───────────────────────────────────────────────────────────────
export async function listOrganizations(query: ListOrganizationsQuery) {
  const { page, limit, search, type, isActive, parentId, rootsOnly, sortBy, sortOrder } = query;

  const where: Prisma.OrganizationWhereInput = {
    deletedAt: null,
    ...(type !== undefined && { type }),
    ...(isActive !== undefined && { isActive: isActive === "true" }),
    ...(parentId !== undefined && { parentId }),
    ...(rootsOnly === "true" && { parentId: null }),
    ...(search && {
      OR: [
        { code: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
        { shortName: { contains: search, mode: "insensitive" } },
      ],
    }),
  };

  const [rows, total] = await Promise.all([
    prisma.organization.findMany({
      where,
      // `_count.children` dipakai kolom "Bagian" di daftar CMS supaya jumlah
      // sub-unit tidak perlu satu request per baris.
      select: { ...ORG_SELECT, _count: { select: { children: true } } },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
    }),
    prisma.organization.count({ where }),
  ]);

  const result = buildPaginatedResult(
    rows.map(({ _count, ...rest }) => ({ ...iso(rest), counts: { children: _count.children } })),
    total,
    page,
    limit,
  );
  return result;
}

/** Daftar OPD aktif untuk filter katalog publik — tanpa paginasi. */
export async function listPublicOrganizations(query: PublicListOrganizationsQuery) {
  const { type, search } = query;
  const rows = await prisma.organization.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      ...(type !== undefined && { type }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { shortName: { contains: search, mode: "insensitive" } },
        ],
      }),
    },
    select: ORG_SELECT,
    orderBy: { name: "asc" },
  });
  return rows.map(iso);
}

// ─── Detail ───────────────────────────────────────────────────────────────────
export async function getOrganizationById(id: string) {
  const org = await prisma.organization.findFirst({
    where: { id, deletedAt: null },
    select: {
      ...ORG_SELECT,
      parent: { select: { id: true, code: true, name: true } },
      _count: { select: { children: true, userAppRoleScopes: true } },
    },
  });
  if (!org) throw new NotFoundError("Organisasi", id);

  const { _count, ...rest } = org;
  return {
    ...iso(rest),
    counts: { children: _count.children, userAppRoleScopes: _count.userAppRoleScopes },
  };
}

/** Profil OPD publik berdasarkan kode — dipakai halaman `/lapak/opd/<code>`. */
export async function getPublicOrganizationByCode(code: string) {
  const org = await prisma.organization.findFirst({
    where: { code, isActive: true, deletedAt: null },
    select: ORG_SELECT,
  });
  if (!org) throw new NotFoundError("Organisasi", code);
  return iso(org);
}

// ─── Create / Update ──────────────────────────────────────────────────────────
export async function createOrganization(body: CreateOrganizationBody) {
  const exists = await prisma.organization.findUnique({
    where: { code: body.code },
    select: { id: true },
  });
  // Kode unik global (bukan per tenant): satu OPD adalah entitas pemerintah
  // yang sama di semua aplikasi.
  if (exists) throw new ConflictError(`Kode organisasi "${body.code}" sudah digunakan`);

  await assertParentExists(body.parentId);

  const created = await prisma.organization.create({
    data: {
      code: body.code,
      name: body.name,
      shortName: body.shortName ?? null,
      type: body.type,
      parentId: body.parentId ?? null,
      description: body.description ?? null,
      address: body.address ?? null,
      phone: body.phone ?? null,
      email: body.email ?? null,
      website: body.website ?? null,
      logoUrl: body.logoUrl ?? null,
      logoFileId: body.logoFileId ?? null,
      isActive: body.isActive,
    },
    select: ORG_SELECT,
  });
  return iso(created);
}

export async function updateOrganization(id: string, body: UpdateOrganizationBody) {
  const existing = await prisma.organization.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError("Organisasi", id);

  if (body.parentId !== undefined) {
    await assertParentExists(body.parentId, id);
    await assertNoCycle(id, body.parentId);
  }

  const data: Prisma.OrganizationUpdateInput = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.shortName !== undefined) data.shortName = body.shortName ?? null;
  if (body.type !== undefined) data.type = body.type;
  if (body.parentId !== undefined) data.parent = body.parentId ? { connect: { id: body.parentId } } : { disconnect: true };
  if (body.description !== undefined) data.description = body.description ?? null;
  if (body.address !== undefined) data.address = body.address ?? null;
  if (body.phone !== undefined) data.phone = body.phone ?? null;
  if (body.email !== undefined) data.email = body.email ?? null;
  if (body.website !== undefined) data.website = body.website ?? null;
  if (body.logoUrl !== undefined) data.logoUrl = body.logoUrl ?? null;
  if (body.logoFileId !== undefined) data.logoFileId = body.logoFileId ?? null;
  if (body.isActive !== undefined) data.isActive = body.isActive;

  const updated = await prisma.organization.update({ where: { id }, data, select: ORG_SELECT });
  return iso(updated);
}

export async function setOrganizationActiveStatus(id: string, isActive: boolean) {
  const existing = await prisma.organization.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, code: true },
  });
  if (!existing) throw new NotFoundError("Organisasi", id);

  // Menonaktifkan induk tanpa menonaktifkan turunannya meninggalkan UPTD yang
  // masih tampil padahal OPD-nya sudah mati — matikan sekalian.
  if (!isActive) {
    const descendants = await collectDescendants(id);
    if (descendants.length > 0) {
      await prisma.organization.updateMany({
        where: { id: { in: descendants } },
        data: { isActive: false },
      });
    }
  }

  const updated = await prisma.organization.update({
    where: { id },
    data: { isActive },
    select: ORG_SELECT,
  });
  return iso(updated);
}

/** Seluruh ID turunan (anak, cucu, …) — BFS dengan batas kedalaman. */
async function collectDescendants(rootId: string): Promise<string[]> {
  const seen: string[] = [];
  let frontier = [rootId];
  for (let depth = 0; frontier.length > 0 && depth < 20; depth++) {
    const children = await prisma.organization.findMany({
      where: { parentId: { in: frontier }, deletedAt: null },
      select: { id: true },
    });
    const ids = children.map((c) => c.id).filter((cid) => cid !== rootId && !seen.includes(cid));
    if (ids.length === 0) break;
    seen.push(...ids);
    frontier = ids;
  }
  return seen;
}

/** Soft-delete. Ditolak bila masih punya turunan atau penugasan role. */
export async function deleteOrganization(id: string) {
  const org = await prisma.organization.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });
  if (!org) throw new NotFoundError("Organisasi", id);

  // Turunan & penugasan dihitung TANPA baris ter-soft-delete: anak yang sudah
  // dihapus tidak boleh menahan penghapusan induknya.
  const [children, scopes] = await Promise.all([
    prisma.organization.count({ where: { parentId: id, deletedAt: null } }),
    prisma.userAppRoleOrganization.count({ where: { organizationId: id } }),
  ]);

  if (children > 0) {
    throw new ConflictError("Organisasi masih memiliki sub-unit; pindahkan atau hapus sub-unitnya lebih dulu");
  }
  if (scopes > 0) {
    throw new ConflictError("Organisasi masih dipakai pada penugasan role; cabut penugasannya lebih dulu");
  }

  await prisma.organization.update({ where: { id }, data: { deletedAt: new Date() } });
  return null;
}
