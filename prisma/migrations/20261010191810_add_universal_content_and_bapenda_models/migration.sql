-- CreateEnum
CREATE TYPE "content_status" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "media_type" AS ENUM ('IMAGE', 'VIDEO', 'PDF');

-- CreateTable
CREATE TABLE "article_categories" (
    "id" VARCHAR(36) NOT NULL,
    "app_id" VARCHAR(36) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "article_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "articles" (
    "id" VARCHAR(36) NOT NULL,
    "app_id" VARCHAR(36) NOT NULL,
    "category_id" VARCHAR(36) NOT NULL,
    "author_id" VARCHAR(36) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "excerpt" VARCHAR(500),
    "content" TEXT NOT NULL,
    "thumbnail_url" TEXT,
    "thumbnail_file_id" VARCHAR(100),
    "status" "content_status" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMPTZ,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "seo_title" VARCHAR(255),
    "seo_description" VARCHAR(500),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banners" (
    "id" VARCHAR(36) NOT NULL,
    "app_id" VARCHAR(36) NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "image_url" TEXT NOT NULL,
    "image_file_id" VARCHAR(100),
    "button_text" VARCHAR(50),
    "button_url" VARCHAR(255),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "banners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "galleries" (
    "id" VARCHAR(36) NOT NULL,
    "app_id" VARCHAR(36) NOT NULL,
    "author_id" VARCHAR(36) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(220) NOT NULL,
    "description" TEXT,
    "cover_image_url" TEXT,
    "cover_image_file_id" VARCHAR(100),
    "status" "content_status" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "galleries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gallery_items" (
    "id" VARCHAR(36) NOT NULL,
    "gallery_id" VARCHAR(36) NOT NULL,
    "media_type" "media_type" NOT NULL DEFAULT 'IMAGE',
    "file_url" TEXT NOT NULL,
    "file_id" VARCHAR(100),
    "title" VARCHAR(150),
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "gallery_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pages" (
    "id" VARCHAR(36) NOT NULL,
    "app_id" VARCHAR(36) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(220) NOT NULL,
    "content" TEXT NOT NULL,
    "seo_title" VARCHAR(255),
    "seo_description" VARCHAR(500),
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regulations" (
    "id" VARCHAR(36) NOT NULL,
    "app_id" VARCHAR(36) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "file_url" TEXT NOT NULL,
    "file_id" VARCHAR(100),
    "file_name" VARCHAR(255),
    "file_size" INTEGER,
    "status" "content_status" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "regulations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faq_categories" (
    "id" VARCHAR(36) NOT NULL,
    "app_id" VARCHAR(36) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "faq_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faqs" (
    "id" VARCHAR(36) NOT NULL,
    "app_id" VARCHAR(36) NOT NULL,
    "category_id" VARCHAR(36) NOT NULL,
    "author_id" VARCHAR(36) NOT NULL,
    "updated_by_id" VARCHAR(36),
    "question" VARCHAR(500) NOT NULL,
    "slug" VARCHAR(500) NOT NULL,
    "answer" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "faqs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bapenda_uptds" (
    "id" VARCHAR(36) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "address" TEXT,
    "phone" VARCHAR(30),
    "email" VARCHAR(100),
    "head_name" VARCHAR(150),
    "province" VARCHAR(50) DEFAULT 'Jambi',
    "city" VARCHAR(100),
    "district" VARCHAR(100),
    "sub_district" VARCHAR(100),
    "postal_code" VARCHAR(10),
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "google_maps_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "show_on_public_map" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "bapenda_uptds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_tax_check_logs" (
    "id" VARCHAR(36) NOT NULL,
    "user_id" VARCHAR(36),
    "license_plate" VARCHAR(20) NOT NULL,
    "status" VARCHAR(50) NOT NULL,
    "notes" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "location_name" VARCHAR(255),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_tax_check_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "article_categories_app_id_is_active_sort_order_idx" ON "article_categories"("app_id", "is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "uq_app_article_category_slug" ON "article_categories"("app_id", "slug");

-- CreateIndex
CREATE INDEX "articles_app_id_status_published_at_idx" ON "articles"("app_id", "status", "published_at");

-- CreateIndex
CREATE INDEX "articles_category_id_idx" ON "articles"("category_id");

-- CreateIndex
CREATE INDEX "articles_author_id_idx" ON "articles"("author_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_app_article_slug" ON "articles"("app_id", "slug");

-- CreateIndex
CREATE INDEX "banners_app_id_is_active_sort_order_idx" ON "banners"("app_id", "is_active", "sort_order");

-- CreateIndex
CREATE INDEX "galleries_app_id_status_idx" ON "galleries"("app_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_app_gallery_slug" ON "galleries"("app_id", "slug");

-- CreateIndex
CREATE INDEX "gallery_items_gallery_id_sort_order_idx" ON "gallery_items"("gallery_id", "sort_order");

-- CreateIndex
CREATE INDEX "pages_app_id_is_published_idx" ON "pages"("app_id", "is_published");

-- CreateIndex
CREATE UNIQUE INDEX "uq_app_page_slug" ON "pages"("app_id", "slug");

-- CreateIndex
CREATE INDEX "regulations_app_id_status_idx" ON "regulations"("app_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_app_regulation_slug" ON "regulations"("app_id", "slug");

-- CreateIndex
CREATE INDEX "faq_categories_app_id_is_active_sort_order_idx" ON "faq_categories"("app_id", "is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "uq_app_faq_category_slug" ON "faq_categories"("app_id", "slug");

-- CreateIndex
CREATE INDEX "faqs_app_id_category_id_is_published_idx" ON "faqs"("app_id", "category_id", "is_published");

-- CreateIndex
CREATE UNIQUE INDEX "uq_app_faq_slug" ON "faqs"("app_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "bapenda_uptds_code_key" ON "bapenda_uptds"("code");

-- CreateIndex
CREATE INDEX "idx_vehicle_tax_license_plate" ON "vehicle_tax_check_logs"("license_plate");

-- CreateIndex
CREATE INDEX "idx_vehicle_tax_user_id" ON "vehicle_tax_check_logs"("user_id");

-- CreateIndex
CREATE INDEX "idx_vehicle_tax_created_at" ON "vehicle_tax_check_logs"("created_at");

-- AddForeignKey
ALTER TABLE "article_categories" ADD CONSTRAINT "article_categories_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "article_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "banners" ADD CONSTRAINT "banners_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "galleries" ADD CONSTRAINT "galleries_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "galleries" ADD CONSTRAINT "galleries_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gallery_items" ADD CONSTRAINT "gallery_items_gallery_id_fkey" FOREIGN KEY ("gallery_id") REFERENCES "galleries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pages" ADD CONSTRAINT "pages_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regulations" ADD CONSTRAINT "regulations_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faq_categories" ADD CONSTRAINT "faq_categories_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faqs" ADD CONSTRAINT "faqs_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faqs" ADD CONSTRAINT "faqs_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "faq_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faqs" ADD CONSTRAINT "faqs_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faqs" ADD CONSTRAINT "faqs_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_tax_check_logs" ADD CONSTRAINT "vehicle_tax_check_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
