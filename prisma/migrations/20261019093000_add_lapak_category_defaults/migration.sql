-- AlterTable
-- Kolom nilai bawaan atribut produk per kategori (PRD 04 §3).
-- Murni aditif: tabel lapak_categories sempat terbentuk dari versi migrasi
-- pertama yang belum memuat kolom ini, sehingga ditambah lewat migrasi
-- terpisah — sesuai aturan migrasi bersifat immutable.
ALTER TABLE "lapak_categories" ADD COLUMN     "default_pricing_unit" VARCHAR(20);
ALTER TABLE "lapak_categories" ADD COLUMN     "default_availability_type" VARCHAR(20);
ALTER TABLE "lapak_categories" ADD COLUMN     "default_fulfillment_type" VARCHAR(20);
