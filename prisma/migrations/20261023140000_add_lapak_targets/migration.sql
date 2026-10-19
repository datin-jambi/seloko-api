-- Target penerimaan retribusi per OPD per tahun (LJ-3.1).
-- Mengikuti model TargetOPD backend Bapenda sebelumnya (opd_id, tahun, total,
-- achieve). Bedanya: `achieve` TIDAK disimpan — realisasi selalu dihitung dari
-- transaksi yang benar-benar lunas, agar capaian tidak mungkin menyimpang dari
-- data pesanan.

CREATE TABLE "lapak_targets" (
    "id" VARCHAR(36) NOT NULL,
    "app_id" VARCHAR(36) NOT NULL,
    -- NULL = target default seluruh aplikasi.
    "organization_id" VARCHAR(36),
    "year" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "note" VARCHAR(255),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "lapak_targets_pkey" PRIMARY KEY ("id")
);

-- Satu target per OPD per tahun. Baris default (organization_id NULL) dijaga
-- unique index parsial terpisah karena PG14 belum punya NULLS NOT DISTINCT.
CREATE UNIQUE INDEX "uq_lapak_targets_app_org_year" ON "lapak_targets"("app_id", "organization_id", "year");
CREATE UNIQUE INDEX "uq_lapak_targets_default" ON "lapak_targets"("app_id", "year") WHERE "organization_id" IS NULL;
CREATE INDEX "idx_lapak_targets_year" ON "lapak_targets"("year");

ALTER TABLE "lapak_targets" ADD CONSTRAINT "lapak_targets_app_id_fkey"
  FOREIGN KEY ("app_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lapak_targets" ADD CONSTRAINT "lapak_targets_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
