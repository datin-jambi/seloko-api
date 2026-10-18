-- CreateTable
CREATE TABLE "lapak_categories" (
    "id" VARCHAR(36) NOT NULL,
    "app_id" VARCHAR(36) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "icon" VARCHAR(50),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "default_pricing_unit" VARCHAR(20),
    "default_availability_type" VARCHAR(20),
    "default_fulfillment_type" VARCHAR(20),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "lapak_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_lapak_categories_app_active" ON "lapak_categories"("app_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "uq_lapak_categories_app_slug" ON "lapak_categories"("app_id", "slug");

-- AddForeignKey
ALTER TABLE "lapak_categories" ADD CONSTRAINT "lapak_categories_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

