-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "base_url" VARCHAR(255),
ADD COLUMN     "icon" VARCHAR(50);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" VARCHAR(36) NOT NULL,
    "app_id" VARCHAR(36) NOT NULL,
    "parent_id" VARCHAR(36),
    "label" VARCHAR(100) NOT NULL,
    "icon" VARCHAR(50),
    "path" VARCHAR(255),
    "is_external" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "permission_id" VARCHAR(36),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_roles" (
    "menu_item_id" VARCHAR(36) NOT NULL,
    "role_id" VARCHAR(36) NOT NULL,

    CONSTRAINT "menu_roles_pkey" PRIMARY KEY ("menu_item_id","role_id")
);

-- CreateIndex
CREATE INDEX "idx_menu_items_app_parent_order" ON "menu_items"("app_id", "parent_id", "sort_order");

-- CreateIndex
CREATE INDEX "idx_menu_items_parent" ON "menu_items"("parent_id");

-- CreateIndex
CREATE INDEX "idx_menu_items_permission" ON "menu_items"("permission_id");

-- CreateIndex
CREATE INDEX "idx_menu_roles_role" ON "menu_roles"("role_id");

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_roles" ADD CONSTRAINT "menu_roles_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_roles" ADD CONSTRAINT "menu_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
