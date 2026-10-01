-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN     "code" VARCHAR(100) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "uq_app_menu_code" ON "menu_items"("app_id", "code");

