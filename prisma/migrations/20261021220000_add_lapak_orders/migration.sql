-- Pesanan & snapshot harga (LJ-2.4, PRD 04 §5).
-- Satu pesanan = satu OPD; baris pesanan menyimpan SALINAN harga saat checkout.

CREATE TYPE "OrderStatus" AS ENUM (
  'DRAFT', 'MENUNGGU_VERIFIKASI', 'MENUNGGU_PEMBAYARAN', 'MENUNGGU_KONFIRMASI',
  'LUNAS', 'AKTIF', 'SELESAI', 'DITOLAK', 'DIBATALKAN', 'KEDALUWARSA', 'REFUND'
);

CREATE TABLE "lapak_orders" (
    "id" VARCHAR(36) NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "app_id" VARCHAR(36) NOT NULL,
    "user_id" VARCHAR(36) NOT NULL,
    "organization_id" VARCHAR(36) NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    -- Snapshot PII pemohon. JANGAN dikirim utuh ke publik; masking di list/log.
    "applicant" JSONB NOT NULL,
    "purpose" VARCHAR(500),
    -- Rupiah utuh (integer), bukan desimal: retribusi tanpa pecahan dan
    -- integer menghindari galat pembulatan saat penjumlahan.
    "subtotal" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "expires_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "lapak_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lapak_order_items" (
    "id" VARCHAR(36) NOT NULL,
    "order_id" VARCHAR(36) NOT NULL,
    "product_id" VARCHAR(36) NOT NULL,
    "rate_id" VARCHAR(36),
    "reservation_id" VARCHAR(36),
    -- Salinan saat checkout: produk/tarif bisa berganti nama atau dihapus nanti,
    -- tetapi pesanan lama harus tetap menampilkan apa yang dibeli.
    "product_name" VARCHAR(150) NOT NULL,
    "rate_name" VARCHAR(100) NOT NULL,
    "unit" VARCHAR(20) NOT NULL,
    "price" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL,
    "line_total" INTEGER NOT NULL,
    "start_at" TIMESTAMPTZ,
    "end_at" TIMESTAMPTZ,
    "note" VARCHAR(500),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lapak_order_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lapak_order_status_logs" (
    "id" VARCHAR(36) NOT NULL,
    "order_id" VARCHAR(36) NOT NULL,
    "from_status" "OrderStatus",
    "to_status" "OrderStatus" NOT NULL,
    "actor_id" VARCHAR(36),
    "note" VARCHAR(500),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lapak_order_status_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_lapak_orders_app_code" ON "lapak_orders"("app_id", "code");
CREATE INDEX "idx_lapak_orders_user_status" ON "lapak_orders"("user_id", "status");
CREATE INDEX "idx_lapak_orders_org_status" ON "lapak_orders"("organization_id", "status");
CREATE INDEX "idx_lapak_orders_expires" ON "lapak_orders"("expires_at");
CREATE UNIQUE INDEX "lapak_order_items_reservation_id_key" ON "lapak_order_items"("reservation_id");
CREATE INDEX "idx_lapak_order_items_order" ON "lapak_order_items"("order_id");
CREATE INDEX "idx_lapak_order_logs_order_time" ON "lapak_order_status_logs"("order_id", "created_at");

ALTER TABLE "lapak_orders" ADD CONSTRAINT "lapak_orders_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lapak_orders" ADD CONSTRAINT "lapak_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lapak_orders" ADD CONSTRAINT "lapak_orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lapak_order_items" ADD CONSTRAINT "lapak_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "lapak_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lapak_order_items" ADD CONSTRAINT "lapak_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "lapak_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lapak_order_items" ADD CONSTRAINT "lapak_order_items_rate_id_fkey" FOREIGN KEY ("rate_id") REFERENCES "lapak_product_rates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "lapak_order_items" ADD CONSTRAINT "lapak_order_items_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "lapak_reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "lapak_order_status_logs" ADD CONSTRAINT "lapak_order_status_logs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "lapak_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
