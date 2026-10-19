-- Keranjang per OPD (LJ-2.3, PRD 04 §4.F).
-- Satu keranjang per (user, OPD) ditegakkan unique index — bukan dicek manual.

-- CreateTable
CREATE TABLE "lapak_carts" (
    "id" VARCHAR(36) NOT NULL,
    "user_id" VARCHAR(36) NOT NULL,
    "organization_id" VARCHAR(36) NOT NULL,
    "app_id" VARCHAR(36) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "lapak_carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lapak_cart_items" (
    "id" VARCHAR(36) NOT NULL,
    "cart_id" VARCHAR(36) NOT NULL,
    "product_id" VARCHAR(36) NOT NULL,
    "rate_id" VARCHAR(36),
    "reservation_id" VARCHAR(36),
    "qty" INTEGER NOT NULL DEFAULT 1,
    "start_at" TIMESTAMPTZ,
    "end_at" TIMESTAMPTZ,
    "note" VARCHAR(500),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "lapak_cart_items_pkey" PRIMARY KEY ("id")
);

-- ATURAN §4.F: satu keranjang per user per OPD. Memasukkan produk OPD lain ke
-- keranjang yang sudah ada akan ditolak di lapisan aplikasi; index ini yang
-- menjaminnya tetap benar walau ada jalur kode yang lupa mengecek.
CREATE UNIQUE INDEX "uq_lapak_carts_user_org" ON "lapak_carts"("user_id", "organization_id");
CREATE INDEX "idx_lapak_carts_user" ON "lapak_carts"("user_id");

-- Satu reservasi hanya boleh ditautkan ke satu baris keranjang.
CREATE UNIQUE INDEX "lapak_cart_items_reservation_id_key" ON "lapak_cart_items"("reservation_id");
CREATE INDEX "idx_lapak_cart_items_cart" ON "lapak_cart_items"("cart_id");
CREATE INDEX "idx_lapak_cart_items_product" ON "lapak_cart_items"("product_id");

ALTER TABLE "lapak_carts" ADD CONSTRAINT "lapak_carts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lapak_carts" ADD CONSTRAINT "lapak_carts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lapak_carts" ADD CONSTRAINT "lapak_carts_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lapak_cart_items" ADD CONSTRAINT "lapak_cart_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "lapak_carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lapak_cart_items" ADD CONSTRAINT "lapak_cart_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "lapak_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lapak_cart_items" ADD CONSTRAINT "lapak_cart_items_rate_id_fkey" FOREIGN KEY ("rate_id") REFERENCES "lapak_product_rates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "lapak_cart_items" ADD CONSTRAINT "lapak_cart_items_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "lapak_reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
