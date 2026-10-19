-- Reservasi rentang waktu + anti double-booking (LJ-2.2, PRD 04 §H).
--
-- `btree_gist` dibutuhkan agar kolom biasa (product_id) bisa dipakai di
-- exclusion constraint bersama kolom range. Tanpa ekstensi ini, PostgreSQL
-- menolak `EXCLUDE USING gist (product_id WITH =, period WITH &&)`.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('HOLD', 'CONFIRMED', 'RELEASED');

-- CreateTable
CREATE TABLE "lapak_reservations" (
    "id" VARCHAR(36) NOT NULL,
    "product_id" VARCHAR(36) NOT NULL,
    "period" tstzrange NOT NULL,
    "start_at" TIMESTAMPTZ NOT NULL,
    "end_at" TIMESTAMPTZ NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "status" "ReservationStatus" NOT NULL DEFAULT 'HOLD',
    "expires_at" TIMESTAMPTZ,
    "user_id" VARCHAR(36),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "lapak_reservations_pkey" PRIMARY KEY ("id")
);

-- INTI ANTI DOUBLE-BOOKING.
-- Dua reservasi untuk produk yang sama dengan rentang beririsan (`&&`) akan
-- DITOLAK PostgreSQL, bukan oleh kode aplikasi. Ini satu-satunya cara yang
-- benar: pengecekan di kode selalu punya jendela race antara SELECT dan INSERT
-- yang bisa dieksploitasi dua request paralel.
--
-- Reservasi berstatus RELEASED dikecualikan lewat partial index (`WHERE`),
-- sehingga slot yang sudah dilepas bisa dipesan ulang tanpa menghapus riwayat.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "lapak_reservations"
  ADD CONSTRAINT "ex_lapak_reservations_no_overlap"
  EXCLUDE USING gist ("product_id" WITH =, "period" WITH &&)
  WHERE ("status" <> 'RELEASED');

-- Rentang `period` diturunkan dari start_at/end_at agar tidak mungkin
-- bertentangan dengan kolom salinannya. Batas atas eksklusif ('[)') supaya
-- 08:00–10:00 dan 10:00–12:00 tidak dianggap bentrok.
ALTER TABLE "lapak_reservations"
  ADD CONSTRAINT "chk_lapak_reservations_period"
  CHECK ("period" = tstzrange("start_at", "end_at", '[)'));

CREATE INDEX "idx_lapak_reservations_product_status" ON "lapak_reservations"("product_id", "status");
CREATE INDEX "idx_lapak_reservations_expires" ON "lapak_reservations"("expires_at");

ALTER TABLE "lapak_reservations" ADD CONSTRAINT "lapak_reservations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "lapak_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
