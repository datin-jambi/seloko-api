-- CreateTable
CREATE TABLE "lapak_products" (
    "id" VARCHAR(36) NOT NULL,
    "app_id" VARCHAR(36) NOT NULL,
    "organization_id" VARCHAR(36) NOT NULL,
    "category_id" VARCHAR(36) NOT NULL,
    "retribution_object_id" VARCHAR(36),
    "name" VARCHAR(150) NOT NULL,
    "slug" VARCHAR(180) NOT NULL,
    "excerpt" VARCHAR(1000),
    "description" TEXT NOT NULL,
    "address" VARCHAR(255),
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "capacity" INTEGER,
    "area_m2" INTEGER,
    "pricingUnit" VARCHAR(20) NOT NULL,
    "availability_type" VARCHAR(20) NOT NULL,
    "fulfillment_type" VARCHAR(20) NOT NULL,
    "status" "content_status" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMPTZ,
    "cover_url" TEXT,
    "cover_file_id" VARCHAR(100),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "lapak_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lapak_product_rates" (
    "id" VARCHAR(36) NOT NULL,
    "product_id" VARCHAR(36) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "unit" VARCHAR(20) NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "min_qty" INTEGER NOT NULL DEFAULT 1,
    "max_qty" INTEGER,
    "start_time" VARCHAR(5),
    "end_time" VARCHAR(5),
    "status" "content_status" NOT NULL DEFAULT 'DRAFT',
    "effective_from" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "lapak_product_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lapak_product_addons" (
    "id" VARCHAR(36) NOT NULL,
    "product_id" VARCHAR(36) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "unit" VARCHAR(20) NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "lapak_product_addons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lapak_product_requirements" (
    "id" VARCHAR(36) NOT NULL,
    "product_id" VARCHAR(36) NOT NULL,
    "label" VARCHAR(150) NOT NULL,
    "field_type" VARCHAR(20) NOT NULL,
    "options" JSONB,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "lapak_product_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lapak_product_images" (
    "id" VARCHAR(36) NOT NULL,
    "product_id" VARCHAR(36) NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "file_id" VARCHAR(100),
    "alt_text" VARCHAR(150),
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "lapak_product_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lapak_product_facilities" (
    "id" VARCHAR(36) NOT NULL,
    "product_id" VARCHAR(36) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "icon" VARCHAR(50),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "lapak_product_facilities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_lapak_products_app_status" ON "lapak_products"("app_id", "status");

-- CreateIndex
CREATE INDEX "idx_lapak_products_org_status" ON "lapak_products"("organization_id", "status");

-- CreateIndex
CREATE INDEX "idx_lapak_products_category" ON "lapak_products"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_lapak_products_app_slug" ON "lapak_products"("app_id", "slug");

-- CreateIndex
CREATE INDEX "idx_lapak_product_rates_product_status" ON "lapak_product_rates"("product_id", "status");

-- CreateIndex
CREATE INDEX "idx_lapak_product_addons_product" ON "lapak_product_addons"("product_id");

-- CreateIndex
CREATE INDEX "idx_lapak_product_reqs_product" ON "lapak_product_requirements"("product_id");

-- CreateIndex
CREATE INDEX "idx_lapak_product_images_product" ON "lapak_product_images"("product_id");

-- CreateIndex
CREATE INDEX "idx_lapak_product_facilities_product" ON "lapak_product_facilities"("product_id");

-- AddForeignKey
ALTER TABLE "lapak_products" ADD CONSTRAINT "lapak_products_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lapak_products" ADD CONSTRAINT "lapak_products_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lapak_products" ADD CONSTRAINT "lapak_products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "lapak_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lapak_product_rates" ADD CONSTRAINT "lapak_product_rates_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "lapak_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lapak_product_addons" ADD CONSTRAINT "lapak_product_addons_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "lapak_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lapak_product_requirements" ADD CONSTRAINT "lapak_product_requirements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "lapak_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lapak_product_images" ADD CONSTRAINT "lapak_product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "lapak_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lapak_product_facilities" ADD CONSTRAINT "lapak_product_facilities_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "lapak_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

