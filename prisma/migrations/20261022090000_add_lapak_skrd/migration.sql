-- Pengaturan & penerbitan SKRD + penomoran gapless (LJ-2.5, PRD 04 §D).

CREATE TYPE "SkrdIssuer" AS ENUM ('BAPENDA', 'OPD');
CREATE TYPE "SkrdDocumentType" AS ENUM ('SKRD', 'DIPERSAMAKAN');
CREATE TYPE "SkrdStatus" AS ENUM ('TERBIT', 'LUNAS', 'CANCELLED');

-- Pengaturan penerbit. organization_id NULL = baris default (Bapenda).
CREATE TABLE "lapak_skrd_settings" (
    "id" VARCHAR(36) NOT NULL,
    "app_id" VARCHAR(36) NOT NULL,
    "organization_id" VARCHAR(36),
    "issuer" "SkrdIssuer" NOT NULL,
    "number_format" VARCHAR(200) NOT NULL,
    "signer_name" VARCHAR(150) NOT NULL,
    "signer_nip" VARCHAR(30),
    "signer_position" VARCHAR(150),
    "bank_name" VARCHAR(100),
    "bank_account" VARCHAR(50),
    "bank_holder" VARCHAR(150),
    "due_days" INTEGER NOT NULL DEFAULT 7,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "lapak_skrd_settings_pkey" PRIMARY KEY ("id")
);

-- Penomoran gapless: last_number HANYA PERNAH NAIK. Nomor yang sudah dipakai
-- tidak pernah dikembalikan meski SKRD-nya CANCELLED (lubang nomor = temuan audit).
CREATE TABLE "lapak_skrd_sequences" (
    "id" VARCHAR(36) NOT NULL,
    "issuer_key" VARCHAR(60) NOT NULL,
    "year" INTEGER NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "lapak_skrd_sequences_pkey" PRIMARY KEY ("id")
);

-- SKRD: seluruh isi disalin sebagai snapshot (penerbit, penandatangan, rekening).
CREATE TABLE "lapak_skrds" (
    "id" VARCHAR(36) NOT NULL,
    "order_id" VARCHAR(36) NOT NULL,
    "number" VARCHAR(100) NOT NULL,
    "document_type" "SkrdDocumentType" NOT NULL DEFAULT 'SKRD',
    "issuer" "SkrdIssuer" NOT NULL,
    "issuer_code" VARCHAR(50) NOT NULL,
    "issuer_name" VARCHAR(150) NOT NULL,
    "signer_name" VARCHAR(150) NOT NULL,
    "signer_nip" VARCHAR(30),
    "signer_position" VARCHAR(150),
    "bank_name" VARCHAR(100),
    "bank_account" VARCHAR(50),
    "bank_holder" VARCHAR(150),
    "amount" INTEGER NOT NULL,
    "issued_at" TIMESTAMPTZ NOT NULL,
    "due_at" TIMESTAMPTZ NOT NULL,
    "status" "SkrdStatus" NOT NULL DEFAULT 'TERBIT',
    "qr_token" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "lapak_skrds_pkey" PRIMARY KEY ("id")
);

-- Satu pengaturan per OPD (termasuk baris default dengan organization_id NULL).
-- NULLS NOT DISTINCT (PG15+) tidak tersedia di PG14, jadi baris default dijaga
-- unique index parsial terpisah di bawah.
CREATE UNIQUE INDEX "uq_lapak_skrd_settings_app_org" ON "lapak_skrd_settings"("app_id", "organization_id");
CREATE UNIQUE INDEX "uq_lapak_skrd_settings_default" ON "lapak_skrd_settings"("app_id") WHERE "organization_id" IS NULL;

CREATE UNIQUE INDEX "uq_lapak_skrd_seq_issuer_year" ON "lapak_skrd_sequences"("issuer_key", "year");

CREATE UNIQUE INDEX "lapak_skrds_order_id_key" ON "lapak_skrds"("order_id");
CREATE UNIQUE INDEX "lapak_skrds_qr_token_key" ON "lapak_skrds"("qr_token");
CREATE UNIQUE INDEX "uq_lapak_skrds_issuer_number" ON "lapak_skrds"("issuer_code", "number");
CREATE INDEX "idx_lapak_skrds_status_due" ON "lapak_skrds"("status", "due_at");

ALTER TABLE "lapak_skrd_settings" ADD CONSTRAINT "lapak_skrd_settings_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lapak_skrd_settings" ADD CONSTRAINT "lapak_skrd_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lapak_skrds" ADD CONSTRAINT "lapak_skrds_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "lapak_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
