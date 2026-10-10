import { prisma } from "~/config/database.js";
import { resolveUserPermissions } from "~/common/guards/permission.guard.js";
import {
  ConflictError,
  NotFoundError,
  BadRequestError,
} from "~/common/errors/index.js";
import { buildPaginatedResult } from "~/common/types/index.js";
import type {
  GetMyMenusQuery,
  ListMenusQuery,
  CreateMenuBody,
  UpdateMenuBody,
  ReorderMenusBody,
  MenuItemNode,
  MenuItemCmsNode,
} from "./menus.schema.js";

// ─── Format Detail Helper ─────────────────────────────────────────────────────
type MenuDetailRow = {
  id: string;
  applicationId: string;
  parentId: string | null;
  code: string;
  label: string;
  icon: string | null;
  path: string | null;
  isExternal: boolean;
  sortOrder: number;
  isActive: boolean;
  permissionId: string | null;
  createdAt: Date;
  updatedAt: Date;
  application: { id: string; code: string; name: string; baseUrl: string | null };
  parent: { id: string; code: string; label: string } | null;
  permission: { id: string; code: string; name: string; module: string } | null;
  menuRoles: Array<{ role: { id: string; name: string } }>;
  children: Array<{
    id: string;
    code: string;
    label: string;
    sortOrder: number;
    isActive: boolean;
  }>;
};

function formatMenuDetail(row: MenuDetailRow) {
  return {
    id: row.id,
    applicationId: row.applicationId,
    application: {
      id: row.application.id,
      code: row.application.code,
      name: row.application.name,
      baseUrl: row.application.baseUrl,
    },
    parentId: row.parentId,
    parent: row.parent ? { id: row.parent.id, code: row.parent.code, label: row.parent.label } : null,
    code: row.code,
    label: row.label,
    icon: row.icon,
    path: row.path,
    isExternal: row.isExternal,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    permissionId: row.permissionId,
    permission: row.permission
      ? {
          id: row.permission.id,
          code: row.permission.code,
          name: row.permission.name,
          module: row.permission.module,
        }
      : null,
    roles: row.menuRoles.map((mr) => ({ id: mr.role.id, name: mr.role.name })),
    children: row.children.map((c) => ({
      id: c.id,
      code: c.code,
      label: c.label,
      sortOrder: c.sortOrder,
      isActive: c.isActive,
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ─── 1. Get My Menus (Sidebar Filtered) ───────────────────────────────────────
export async function getMyMenus(
  userId: string,
  callerAppCode: string,
  isSuperAdmin: boolean,
  query: GetMyMenusQuery,
) {
  // Tentukan aplikasi target: bila dikirim lewat query, pakai itu; default ke appCode pemanggil
  const appWhere = query.applicationId
    ? { id: query.applicationId, isActive: true }
    : { code: query.appCode ?? callerAppCode, isActive: true };

  const application = await prisma.application.findFirst({
    where: appWhere,
    select: {
      id: true,
      code: true,
      name: true,
      baseUrl: true,
      icon: true,
    },
  });

  if (!application) {
    throw new NotFoundError("Aplikasi aktif", query.applicationId ?? query.appCode ?? callerAppCode);
  }

  // Ambil semua menu aktif milik aplikasi ini
  const rawMenus = await prisma.menuItem.findMany({
    where: {
      applicationId: application.id,
      isActive: true,
    },
    include: {
      permission: { select: { code: true } },
      menuRoles: { select: { roleId: true } },
    },
    orderBy: { sortOrder: "asc" },
  });

  // Jika bukan superadmin, ambil permission & role pengguna yang berlaku di aplikasi ini
  let allowedItemIds: Set<string>;

  if (isSuperAdmin) {
    allowedItemIds = new Set(rawMenus.map((m) => m.id));
  } else {
    const userPermissions = await resolveUserPermissions(userId, application.code);

    // Ambil role-role aktif pengguna pada aplikasi ini yang belum kedaluwarsa
    const userRoles = await prisma.userAppRole.findMany({
      where: {
        userId,
        applicationId: application.id,
        role: { isActive: true },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { roleId: true },
    });
    const activeRoleIds = new Set(userRoles.map((r) => r.roleId));

    allowedItemIds = new Set<string>();

    for (const item of rawMenus) {
      // Lapis 2: Permission check
      if (item.permissionId && (!item.permission || !userPermissions.includes(item.permission.code))) {
        continue;
      }

      // Lapis 3: Role check (bila ada batasan role)
      if (item.menuRoles.length > 0) {
        const hasMatchingRole = item.menuRoles.some((mr) => activeRoleIds.has(mr.roleId));
        if (!hasMatchingRole) continue;
      }

      allowedItemIds.add(item.id);
    }
  }

  // Bangun struktur pohon (bottom-up / post-order pruning)
  const itemsByParent = new Map<string | null, typeof rawMenus>();
  for (const item of rawMenus) {
    if (!allowedItemIds.has(item.id)) continue;
    const parentKey = item.parentId ?? null;
    const list = itemsByParent.get(parentKey) ?? [];
    list.push(item);
    itemsByParent.set(parentKey, list);
  }

  function buildSubtree(parentId: string | null): MenuItemNode[] {
    const directChildren = itemsByParent.get(parentId) ?? [];
    const result: MenuItemNode[] = [];

    for (const item of directChildren) {
      const nestedChildren = buildSubtree(item.id);

      // Pruning: Jika menu parent tidak memiliki path (hanya folder grup)
      // dan tidak memiliki anak yang lolos filter, sembunyikan grup ini
      if (!item.path && nestedChildren.length === 0) {
        continue;
      }

      result.push({
        id: item.id,
        code: item.code,
        label: item.label,
        icon: item.icon,
        path: item.path,
        isExternal: item.isExternal,
        sortOrder: item.sortOrder,
        items: nestedChildren,
      });
    }

    return result;
  }

  const menuTree = buildSubtree(null);

  return {
    application: {
      id: application.id,
      code: application.code,
      name: application.name,
      baseUrl: application.baseUrl,
      icon: application.icon,
    },
    menus: menuTree,
  };
}

// ─── 2. List Menus (CMS) ──────────────────────────────────────────────────────
export async function listMenus(query: ListMenusQuery) {
  // Bila diminta dalam bentuk hierarki pohon penuh (tree = true)
  if (query.tree === "true") {
    if (!query.applicationId) {
      throw new BadRequestError("Query parameter applicationId wajib disertakan saat tree=true");
    }

    const items = await prisma.menuItem.findMany({
      where: {
        applicationId: query.applicationId,
        ...(query.isActive !== undefined && { isActive: query.isActive === "true" }),
      },
      include: {
        permission: { select: { id: true, code: true, name: true } },
        menuRoles: {
          select: { role: { select: { id: true, name: true } } },
        },
      },
      orderBy: { sortOrder: "asc" },
    });

    const itemsByParent = new Map<string | null, typeof items>();
    for (const item of items) {
      const p = item.parentId ?? null;
      const list = itemsByParent.get(p) ?? [];
      list.push(item);
      itemsByParent.set(p, list);
    }

    function buildCmsTree(parentId: string | null): MenuItemCmsNode[] {
      const direct = itemsByParent.get(parentId) ?? [];
      return direct.map((item) => ({
        id: item.id,
        applicationId: item.applicationId,
        parentId: item.parentId,
        code: item.code,
        label: item.label,
        icon: item.icon,
        path: item.path,
        isExternal: item.isExternal,
        sortOrder: item.sortOrder,
        isActive: item.isActive,
        permissionId: item.permissionId,
        permission: item.permission
          ? {
              id: item.permission.id,
              code: item.permission.code,
              name: item.permission.name,
            }
          : null,
        roles: item.menuRoles.map((mr) => ({ id: mr.role.id, name: mr.role.name })),
        items: buildCmsTree(item.id),
      }));
    }

    return { data: buildCmsTree(null) };
  }

  // Bentuk tabel flat terpaginasi
  const where = {
    ...(query.applicationId && { applicationId: query.applicationId }),
    ...(query.parentId === "root"
      ? { parentId: null }
      : query.parentId
        ? { parentId: query.parentId }
        : {}),
    ...(query.isActive !== undefined && { isActive: query.isActive === "true" }),
    ...(query.search && {
      OR: [
        { label: { contains: query.search, mode: "insensitive" as const } },
        { code: { contains: query.search, mode: "insensitive" as const } },
      ],
    }),
  };

  const [total, rows] = await Promise.all([
    prisma.menuItem.count({ where }),
    prisma.menuItem.findMany({
      where,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: {
        application: { select: { code: true, name: true } },
        parent: { select: { label: true } },
        permission: { select: { code: true } },
        menuRoles: {
          select: { role: { select: { id: true, name: true } } },
        },
        _count: { select: { children: true } },
      },
      orderBy: [{ applicationId: "asc" }, { sortOrder: "asc" }],
    }),
  ]);

  const data = rows.map((r) => ({
    id: r.id,
    applicationId: r.applicationId,
    applicationCode: r.application.code,
    applicationName: r.application.name,
    parentId: r.parentId,
    parentLabel: r.parent?.label ?? null,
    code: r.code,
    label: r.label,
    icon: r.icon,
    path: r.path,
    isExternal: r.isExternal,
    sortOrder: r.sortOrder,
    isActive: r.isActive,
    permissionId: r.permissionId,
    permissionCode: r.permission?.code ?? null,
    roles: r.menuRoles.map((mr) => ({ id: mr.role.id, name: mr.role.name })),
    childrenCount: r._count.children,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));

  return buildPaginatedResult(data, total, query.page, query.limit);
}

// ─── 3. Get Menu Detail ───────────────────────────────────────────────────────
export async function getMenuById(id: string) {
  const menu = await prisma.menuItem.findUnique({
    where: { id },
    include: {
      application: {
        select: { id: true, code: true, name: true, baseUrl: true },
      },
      parent: {
        select: { id: true, code: true, label: true },
      },
      permission: {
        select: { id: true, code: true, name: true, module: true },
      },
      menuRoles: {
        select: { role: { select: { id: true, name: true } } },
      },
      children: {
        select: {
          id: true,
          code: true,
          label: true,
          sortOrder: true,
          isActive: true,
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!menu) {
    throw new NotFoundError("Menu", id);
  }

  return formatMenuDetail(menu);
}

// ─── 4. Create Menu ───────────────────────────────────────────────────────────
export async function createMenu(body: CreateMenuBody) {
  // 1. Pastikan aplikasi ada
  const app = await prisma.application.findUnique({
    where: { id: body.applicationId },
  });
  if (!app) {
    throw new NotFoundError("Aplikasi", body.applicationId);
  }

  // 2. Cek keunikan kode dalam lingkup aplikasi
  const existingCode = await prisma.menuItem.findUnique({
    where: {
      applicationId_code: {
        applicationId: body.applicationId,
        code: body.code,
      },
    },
  });
  if (existingCode) {
    throw new ConflictError(`Kode menu "${body.code}" sudah digunakan di aplikasi ini`);
  }

  // 3. Validasi parent jika disediakan
  if (body.parentId) {
    const parent = await prisma.menuItem.findUnique({
      where: { id: body.parentId },
    });
    if (!parent) {
      throw new NotFoundError("Parent menu", body.parentId);
    }
    if (parent.applicationId !== body.applicationId) {
      throw new BadRequestError("Parent menu harus berada di aplikasi yang sama");
    }
  }

  // 4. Validasi permission jika disediakan
  if (body.permissionId) {
    const perm = await prisma.permission.findUnique({
      where: { id: body.permissionId },
    });
    if (!perm) {
      throw new NotFoundError("Permission", body.permissionId);
    }
    if (perm.applicationId !== body.applicationId) {
      throw new BadRequestError("Permission harus berada di aplikasi yang sama");
    }
  }

  // 5. Validasi roleIds pembatas jika disediakan
  if (body.roleIds && body.roleIds.length > 0) {
    const roles = await prisma.role.findMany({
      where: { id: { in: body.roleIds } },
    });
    if (roles.length !== body.roleIds.length) {
      throw new BadRequestError("Satu atau lebih Role pembatas tidak ditemukan");
    }
    if (roles.some((r) => r.applicationId !== body.applicationId)) {
      throw new BadRequestError("Role pembatas harus berada di aplikasi yang sama");
    }
  }

  // 6. Simpan dalam transaksi
  const created = await prisma.$transaction(async (tx) => {
    const menu = await tx.menuItem.create({
      data: {
        applicationId: body.applicationId,
        parentId: body.parentId ?? null,
        code: body.code,
        label: body.label,
        icon: body.icon ?? null,
        path: body.path ?? null,
        isExternal: body.isExternal,
        sortOrder: body.sortOrder,
        isActive: body.isActive,
        permissionId: body.permissionId ?? null,
      },
    });

    if (body.roleIds && body.roleIds.length > 0) {
      await tx.menuRole.createMany({
        data: body.roleIds.map((roleId) => ({
          menuItemId: menu.id,
          roleId,
        })),
      });
    }

    return menu;
  });

  return getMenuById(created.id);
}

// ─── 5. Update Menu ───────────────────────────────────────────────────────────
export async function updateMenu(id: string, body: UpdateMenuBody) {
  const current = await prisma.menuItem.findUnique({
    where: { id },
  });
  if (!current) {
    throw new NotFoundError("Menu", id);
  }

  // Validasi parent
  if (body.parentId !== undefined && body.parentId !== null) {
    if (body.parentId === id) {
      throw new BadRequestError("Menu tidak dapat menjadi parent untuk dirinya sendiri");
    }

    const parent = await prisma.menuItem.findUnique({
      where: { id: body.parentId },
    });
    if (!parent) {
      throw new NotFoundError("Parent menu", body.parentId);
    }
    if (parent.applicationId !== current.applicationId) {
      throw new BadRequestError("Parent menu harus berada di aplikasi yang sama");
    }

    // Deteksi circular dependency
    let ancestorId: string | null = parent.parentId;
    while (ancestorId) {
      if (ancestorId === id) {
        throw new BadRequestError(
          "Parent menu tidak boleh merupakan turunan dari menu ini (terdeteksi circular hierarchy)",
        );
      }
      const ancestor = await prisma.menuItem.findUnique({
        where: { id: ancestorId },
        select: { parentId: true },
      });
      ancestorId = ancestor?.parentId ?? null;
    }
  }

  // Validasi permission
  if (body.permissionId !== undefined && body.permissionId !== null) {
    const perm = await prisma.permission.findUnique({
      where: { id: body.permissionId },
    });
    if (!perm) {
      throw new NotFoundError("Permission", body.permissionId);
    }
    if (perm.applicationId !== current.applicationId) {
      throw new BadRequestError("Permission harus berada di aplikasi yang sama");
    }
  }

  // Validasi roleIds
  if (body.roleIds !== undefined && body.roleIds.length > 0) {
    const roles = await prisma.role.findMany({
      where: { id: { in: body.roleIds } },
    });
    if (roles.length !== body.roleIds.length) {
      throw new BadRequestError("Satu atau lebih Role pembatas tidak ditemukan");
    }
    if (roles.some((r) => r.applicationId !== current.applicationId)) {
      throw new BadRequestError("Role pembatas harus berada di aplikasi yang sama");
    }
  }

  // Update dalam transaksi
  await prisma.$transaction(async (tx) => {
    await tx.menuItem.update({
      where: { id },
      data: {
        ...(body.parentId !== undefined && { parentId: body.parentId }),
        ...(body.label !== undefined && { label: body.label }),
        ...(body.icon !== undefined && { icon: body.icon }),
        ...(body.path !== undefined && { path: body.path }),
        ...(body.isExternal !== undefined && { isExternal: body.isExternal }),
        ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        ...(body.permissionId !== undefined && { permissionId: body.permissionId }),
      },
    });

    if (body.roleIds !== undefined) {
      // Sinkronkan tabel pivot menu_roles
      await tx.menuRole.deleteMany({
        where: { menuItemId: id },
      });
      if (body.roleIds.length > 0) {
        await tx.menuRole.createMany({
          data: body.roleIds.map((roleId) => ({
            menuItemId: id,
            roleId,
          })),
        });
      }
    }
  });

  return getMenuById(id);
}

// ─── 6. Set Active / Inactive ─────────────────────────────────────────────────
export async function setMenuActive(id: string, isActive: boolean) {
  const current = await prisma.menuItem.findUnique({
    where: { id },
  });
  if (!current) {
    throw new NotFoundError("Menu", id);
  }

  const updated = await prisma.menuItem.update({
    where: { id },
    data: { isActive },
    select: {
      id: true,
      code: true,
      label: true,
      isActive: true,
    },
  });

  return updated;
}

// ─── 7. Reorder Menus ─────────────────────────────────────────────────────────
export async function reorderMenus(body: ReorderMenusBody) {
  const app = await prisma.application.findUnique({
    where: { id: body.applicationId },
  });
  if (!app) {
    throw new NotFoundError("Aplikasi", body.applicationId);
  }

  const itemIds = body.items.map((i) => i.id);
  const existingItems = await prisma.menuItem.findMany({
    where: {
      id: { in: itemIds },
      applicationId: body.applicationId,
    },
    select: { id: true },
  });

  if (existingItems.length !== itemIds.length) {
    throw new BadRequestError("Satu atau lebih menu tidak ditemukan di aplikasi ini");
  }

  await prisma.$transaction(async (tx) => {
    for (const item of body.items) {
      await tx.menuItem.update({
        where: { id: item.id },
        data: {
          sortOrder: item.sortOrder,
          ...(item.parentId !== undefined && { parentId: item.parentId }),
        },
      });
    }
  });

  return { updatedCount: body.items.length };
}

// ─── 8. Delete Menu ───────────────────────────────────────────────────────────
export async function deleteMenu(id: string) {
  const menu = await prisma.menuItem.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      label: true,
      _count: { select: { children: true } },
    },
  });

  if (!menu) {
    throw new NotFoundError("Menu", id);
  }

  // onDelete: Cascade pada schema akan menghapus sub-menu anak dan menuRoles
  await prisma.menuItem.delete({
    where: { id },
  });

  return {
    id: menu.id,
    code: menu.code,
    label: menu.label,
    deletedChildrenCount: menu._count.children,
  };
}
