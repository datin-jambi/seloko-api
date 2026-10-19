-- CreateTable: jam operasional produk (LJ-2.1)
-- Hari tanpa baris = TUTUP. `open_time`/`close_time` VARCHAR(5) "HH:MM" agar
-- tidak terikat timezone database; close < open = lintas tengah malam.
CREATE TABLE "lapak_operating_hours" (
    "id" VARCHAR(36) NOT NULL,
    "product_id" VARCHAR(36) NOT NULL,
    "weekday" SMALLINT NOT NULL,
    "open_time" VARCHAR(5) NOT NULL,
    "close_time" VARCHAR(5) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "lapak_operating_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable: tanggal tutup / maintenance (LJ-2.1)
CREATE TABLE "lapak_blackout_dates" (
    "id" VARCHAR(36) NOT NULL,
    "product_id" VARCHAR(36) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "reason" VARCHAR(255),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "lapak_blackout_dates_pkey" PRIMARY KEY ("id")
);

-- Satu jadwal per hari per produk: dua baris untuk hari yang sama membuat
-- "jam buka" ambigu dan mustahil divalidasi.
CREATE UNIQUE INDEX "uq_lapak_op_hours_product_weekday" ON "lapak_operating_hours"("product_id", "weekday");

-- Rentang dipakai untuk cek irisan saat validasi booking.
CREATE INDEX "idx_lapak_blackout_product_range" ON "lapak_blackout_dates"("product_id", "start_date", "end_date");

ALTER TABLE "lapak_operating_hours" ADD CONSTRAINT "lapak_operating_hours_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "lapak_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lapak_blackout_dates" ADD CONSTRAINT "lapak_blackout_dates_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "lapak_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
