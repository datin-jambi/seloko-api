-- CreateEnum
CREATE TYPE "article_type" AS ENUM ('NEWS', 'ARTICLE');

-- DropIndex
DROP INDEX "article_categories_app_id_is_active_sort_order_idx";

-- DropIndex
DROP INDEX "uq_app_article_category_slug";

-- DropIndex
DROP INDEX "articles_app_id_status_published_at_idx";

-- DropIndex
DROP INDEX "uq_app_article_slug";

-- AlterTable
ALTER TABLE "article_categories" ADD COLUMN     "type" "article_type" NOT NULL;

-- AlterTable
ALTER TABLE "articles" ADD COLUMN     "type" "article_type" NOT NULL;

-- CreateIndex
CREATE INDEX "article_categories_app_id_type_is_active_sort_order_idx" ON "article_categories"("app_id", "type", "is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "uq_app_article_category_slug" ON "article_categories"("app_id", "type", "slug");

-- CreateIndex
CREATE INDEX "articles_app_id_type_status_published_at_idx" ON "articles"("app_id", "type", "status", "published_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_app_article_slug" ON "articles"("app_id", "type", "slug");


-- AlterTable
ALTER TABLE "articles" ALTER COLUMN "excerpt" SET DATA TYPE VARCHAR(1000);
