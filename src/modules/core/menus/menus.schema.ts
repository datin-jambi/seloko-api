import { z } from "zod";

// ─── Recursive Node Types ─────────────────────────────────────────────────────
export interface MenuItemNode {
  id: string;
  code: string;
  label: string;
  icon: string | null;
  path: string | null;
  isExternal: boolean;
  sortOrder: number;
  items: MenuItemNode[];
}

export interface MenuItemCmsNode {
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
  permission: { id: string; code: string; name: string } | null;
  roles: Array<{ id: string; name: string }>;
  items: MenuItemCmsNode[];
}

// ─── Zod Shapes: User Sidebar Node ────────────────────────────────────────────
export const MenuItemNodeSchema: z.ZodType<MenuItemNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    code: z.string(),
    label: z.string(),
    icon: z.string().nullable(),
    path: z.string().nullable(),
    isExternal: z.boolean(),
    sortOrder: z.number(),
    items: z.array(MenuItemNodeSchema),
  }),
);

// ─── Zod Shapes: CMS Tree Node ────────────────────────────────────────────────
export const MenuItemCmsNodeSchema: z.ZodType<MenuItemCmsNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    applicationId: z.string(),
    parentId: z.string().nullable(),
    code: z.string(),
    label: z.string(),
    icon: z.string().nullable(),
    path: z.string().nullable(),
    isExternal: z.boolean(),
    sortOrder: z.number(),
    isActive: z.boolean(),
    permissionId: z.string().nullable(),
    permission: z
      .object({
        id: z.string(),
        code: z.string(),
        name: z.string(),
      })
      .nullable(),
    roles: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
      }),
    ),
    items: z.array(MenuItemCmsNodeSchema),
  }),
);

// ─── Zod Shapes: CMS Flat List Item ───────────────────────────────────────────
export const MenuListItemShape = z.object({
  id: z.string(),
  application: z.object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
  }),
  parent: z
    .object({
      id: z.string(),
      code: z.string(),
      label: z.string(),
    })
    .nullable(),
  code: z.string(),
  label: z.string(),
  icon: z.string().nullable(),
  path: z.string().nullable(),
  isExternal: z.boolean(),
  sortOrder: z.number(),
  isActive: z.boolean(),
  permission: z
    .object({
      id: z.string(),
      code: z.string(),
      name: z.string(),
      module: z.string(),
    })
    .nullable(),
  rolesCount: z.number(),
  childrenCount: z.number(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ─── Zod Shapes: CMS Detail ───────────────────────────────────────────────────
export const MenuDetailShape = z.object({
  id: z.string(),
  applicationId: z.string(),
  application: z.object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
    baseUrl: z.string().nullable(),
  }),
  parentId: z.string().nullable(),
  parent: z
    .object({
      id: z.string(),
      code: z.string(),
      label: z.string(),
    })
    .nullable(),
  code: z.string(),
  label: z.string(),
  icon: z.string().nullable(),
  path: z.string().nullable(),
  isExternal: z.boolean(),
  sortOrder: z.number(),
  isActive: z.boolean(),
  permissionId: z.string().nullable(),
  permission: z
    .object({
      id: z.string(),
      code: z.string(),
      name: z.string(),
      module: z.string(),
    })
    .nullable(),
  roles: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
    }),
  ),
  children: z.array(
    z.object({
      id: z.string(),
      code: z.string(),
      label: z.string(),
      sortOrder: z.number(),
      isActive: z.boolean(),
    }),
  ),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ─── Field Rules ──────────────────────────────────────────────────────────────
const codeField = z
  .string()
  .min(2, "Kode menu minimal 2 karakter")
  .max(100)
  .regex(
    /^[a-z0-9][a-z0-9_.-]*$/,
    "Kode hanya boleh huruf kecil, angka, titik, strip, atau underscore, mis. 'pengguna.daftar'",
  )
  .describe("Kunci unik menu dalam lingkup satu aplikasi");

const labelField = z.string().min(1, "Label menu wajib diisi").max(100);

// ─── 1. GET /menus/me ─────────────────────────────────────────────────────────
export const GetMyMenusQuerySchema = z.object({
  applicationId: z.string().uuid("Application ID harus berformat UUID").optional(),
  appCode: z.string().optional().describe("Kode aplikasi target, default ke X-App-Code pemanggil"),
});

export const GetMyMenusResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.object({
    application: z.object({
      id: z.string(),
      code: z.string(),
      name: z.string(),
      baseUrl: z.string().nullable(),
      icon: z.string().nullable(),
    }),
    menus: z.array(MenuItemNodeSchema),
  }),
});

// ─── 2. GET /menus (CMS List) ────────────────────────────────────────────────
export const ListMenusQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  applicationId: z.string().uuid("Application ID harus berformat UUID").optional(),
  parentId: z.string().optional().describe("ID parent, atau 'root' untuk menu tingkat atas"),
  isActive: z.enum(["true", "false"]).optional(),
  search: z.string().trim().optional().describe("Cari berdasarkan label atau kode"),
  tree: z.enum(["true", "false"]).optional().describe("Jika 'true', mengembalikan pohon hierarki penuh"),
});

export const ListMenusResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.union([z.array(MenuListItemShape), z.array(MenuItemCmsNodeSchema)]),
  meta: z
    .object({
      page: z.number(),
      limit: z.number(),
      total: z.number(),
      totalPages: z.number(),
      hasNextPage: z.boolean(),
      hasPreviousPage: z.boolean(),
    })
    .optional(),
});

// ─── 3. Params :id ───────────────────────────────────────────────────────────
export const MenuParamsSchema = z.object({
  id: z.string().uuid("ID menu harus berformat UUID"),
});

export const GetMenuResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: MenuDetailShape,
});

// ─── 4. POST /menus (Create) ─────────────────────────────────────────────────
export const CreateMenuBodySchema = z.object({
  applicationId: z.string().uuid("Application ID harus berformat UUID"),
  parentId: z.string().uuid("Parent ID harus berformat UUID").nullable().optional(),
  code: codeField,
  label: labelField,
  icon: z.string().max(50).nullable().optional(),
  path: z.string().max(255).nullable().optional(),
  isExternal: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
  permissionId: z.string().uuid("Permission ID harus berformat UUID").nullable().optional(),
  roleIds: z
    .array(z.string().uuid("Role ID harus berformat UUID"))
    .default([])
    .describe("Daftar role pembatas — kosong berarti terbuka untuk semua role di aplikasinya"),
});

export const CreateMenuResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: MenuDetailShape,
});

// ─── 5. PATCH /menus/:id (Update) ────────────────────────────────────────────
export const UpdateMenuBodySchema = z.object({
  parentId: z.string().uuid("Parent ID harus berformat UUID").nullable().optional(),
  label: labelField.optional(),
  icon: z.string().max(50).nullable().optional(),
  path: z.string().max(255).nullable().optional(),
  isExternal: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  permissionId: z.string().uuid("Permission ID harus berformat UUID").nullable().optional(),
  roleIds: z
    .array(z.string().uuid("Role ID harus berformat UUID"))
    .optional()
    .describe("Daftar role pembatas jika ingin disinkronkan"),
});

export const UpdateMenuResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: MenuDetailShape,
});

// ─── 6. PATCH /menus/:id/activate ────────────────────────────────────────────
export const SetMenuActiveBodySchema = z.object({
  isActive: z.boolean(),
});

export const SetMenuActiveResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.object({
    id: z.string(),
    code: z.string(),
    label: z.string(),
    isActive: z.boolean(),
  }),
});

// ─── 7. PATCH /menus/reorder ─────────────────────────────────────────────────
export const ReorderMenusBodySchema = z.object({
  applicationId: z.string().uuid("Application ID harus berformat UUID"),
  items: z
    .array(
      z.object({
        id: z.string().uuid("ID menu harus berformat UUID"),
        sortOrder: z.number().int(),
        parentId: z.string().uuid("Parent ID harus berformat UUID").nullable().optional(),
      }),
    )
    .min(1, "Minimal satu item untuk di-reorder"),
});

export const ReorderMenusResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.object({
    updatedCount: z.number(),
  }),
});

// ─── 8. DELETE /menus/:id ────────────────────────────────────────────────────
export const DeleteMenuResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.object({
    id: z.string(),
    code: z.string(),
    label: z.string(),
    deletedChildrenCount: z.number(),
  }),
});

// ─── Type Exports ─────────────────────────────────────────────────────────────
export type GetMyMenusQuery = z.infer<typeof GetMyMenusQuerySchema>;
export type ListMenusQuery = z.infer<typeof ListMenusQuerySchema>;
export type MenuParams = z.infer<typeof MenuParamsSchema>;
export type CreateMenuBody = z.infer<typeof CreateMenuBodySchema>;
export type UpdateMenuBody = z.infer<typeof UpdateMenuBodySchema>;
export type SetMenuActiveBody = z.infer<typeof SetMenuActiveBodySchema>;
export type ReorderMenusBody = z.infer<typeof ReorderMenusBodySchema>;
