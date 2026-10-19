-- Pembayaran transfer manual + kolom gateway (LJ-2.6, PRD 04 §E).

CREATE TYPE "PaymentMethod" AS ENUM ('MANUAL_TRANSFER', 'VIRTUAL_ACCOUNT', 'QRIS');
CREATE TYPE "PaymentStatus" AS ENUM ('MENUNGGU_BUKTI', 'MENUNGGU_KONFIRMASI', 'LUNAS', 'DITOLAK', 'KEDALUWARSA');

-- Satu pesanan boleh punya beberapa baris pembayaran: bukti yang ditolak
-- membuat warga mengunggah ulang, dan riwayatnya harus utuh untuk audit.
CREATE TABLE "lapak_payments" (
    "id" VARCHAR(36) NOT NULL,
    "order_id" VARCHAR(36) NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'MANUAL_TRANSFER',
    "status" "PaymentStatus" NOT NULL DEFAULT 'MENUNGGU_BUKTI',
    "amount" INTEGER NOT NULL,
    -- Bukti transfer di ImageKit.
    "proof_url" VARCHAR(500),
    "proof_file_id" VARCHAR(200),
    "note" VARCHAR(500),
    "reject_reason" VARCHAR(500),
    "sender_name" VARCHAR(150),
    "sender_bank" VARCHAR(100),
    "paid_at" TIMESTAMPTZ,
    "confirmed_by" VARCHAR(36),
    "confirmed_at" TIMESTAMPTZ,
    -- Kolom gateway: disiapkan sejak awal (PRD 04 §E) agar integrasi Bank Jambi
    -- nanti hanya menambah adapter, bukan migrasi besar.
    "provider" VARCHAR(50),
    "va_number" VARCHAR(50),
    "qris_payload" TEXT,
    "external_ref" VARCHAR(120),
    "raw_callback" JSONB,
    "expires_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "lapak_payments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_lapak_payments_order_status" ON "lapak_payments"("order_id", "status");
CREATE INDEX "idx_lapak_payments_status_expires" ON "lapak_payments"("status", "expires_at");

ALTER TABLE "lapak_payments" ADD CONSTRAINT "lapak_payments_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "lapak_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
