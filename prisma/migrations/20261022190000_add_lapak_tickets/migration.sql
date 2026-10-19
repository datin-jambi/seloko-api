-- Tiket / bukti pemenuhan per baris pesanan (LJ-2.7, PRD 04 §3 & §5).

CREATE TYPE "TicketKind" AS ENUM ('TICKET', 'BOOKING', 'CONTRACT', 'HANDOVER', 'RESULT', 'SCHEDULE');
CREATE TYPE "TicketStatus" AS ENUM ('AKTIF', 'DIGUNAKAN', 'KEDALUWARSA', 'DIBATALKAN');

-- Tiket terbit SAAT LUNAS (bukan saat checkout): tiket = bukti hak pakai, dan
-- hak itu baru sah setelah dibayar.
CREATE TABLE "lapak_tickets" (
    "id" VARCHAR(36) NOT NULL,
    "order_item_id" VARCHAR(36) NOT NULL,
    "kind" "TicketKind" NOT NULL,
    -- Kode pendek untuk dibacakan manual bila QR rusak.
    "code" VARCHAR(40) NOT NULL,
    -- Token QR acak, tidak bisa diturunkan dari kode.
    "qr_token" VARCHAR(64) NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'AKTIF',
    "valid_from" TIMESTAMPTZ,
    "valid_until" TIMESTAMPTZ,
    "used_at" TIMESTAMPTZ,
    "checked_in_by" VARCHAR(36),
    -- Snapshot: perubahan produk/pesanan tidak mengubah tiket terbit.
    "product_name" VARCHAR(150) NOT NULL,
    "rate_name" VARCHAR(100) NOT NULL,
    "organization_id" VARCHAR(36) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "lapak_tickets_pkey" PRIMARY KEY ("id")
);

-- Satu baris pesanan = satu tiket.
CREATE UNIQUE INDEX "lapak_tickets_order_item_id_key" ON "lapak_tickets"("order_item_id");
CREATE UNIQUE INDEX "lapak_tickets_qr_token_key" ON "lapak_tickets"("qr_token");
CREATE UNIQUE INDEX "uq_lapak_tickets_org_code" ON "lapak_tickets"("organization_id", "code");
CREATE INDEX "idx_lapak_tickets_status_valid" ON "lapak_tickets"("status", "valid_until");

ALTER TABLE "lapak_tickets" ADD CONSTRAINT "lapak_tickets_order_item_id_fkey"
  FOREIGN KEY ("order_item_id") REFERENCES "lapak_order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
