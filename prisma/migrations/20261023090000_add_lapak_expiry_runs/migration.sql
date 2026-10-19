-- Catatan run worker kedaluwarsa (LJ-2.8, PRD 04 §5).
-- Worker mengubah status pesanan/SKRD dan memutuskan slot jadi tidak tersedia;
-- tanpa catatan, kesalahan tidak bisa ditelusuri.

CREATE TYPE "ExpiryJobStatus" AS ENUM ('RUNNING', 'SUKSES', 'GAGAL', 'TERPUTUS');

CREATE TABLE "lapak_expiry_runs" (
    "id" VARCHAR(36) NOT NULL,
    "job" VARCHAR(60) NOT NULL,
    "lock_key" VARCHAR(80),
    "status" "ExpiryJobStatus" NOT NULL DEFAULT 'RUNNING',
    -- Jumlah baris yang BENAR-BENAR diubah, per jenis.
    "released_holds" INTEGER NOT NULL DEFAULT 0,
    "expired_payments" INTEGER NOT NULL DEFAULT 0,
    "expired_tickets" INTEGER NOT NULL DEFAULT 0,
    -- "scheduler" atau id user (pemicuan manual).
    "triggered_by" VARCHAR(36),
    "error" VARCHAR(500),
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ,
    "duration_ms" INTEGER,

    CONSTRAINT "lapak_expiry_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_lapak_expiry_runs_job_time" ON "lapak_expiry_runs"("job", "started_at");

-- HANYA SATU worker boleh berjalan per job pada satu waktu, bahkan lintas
-- proses/instance. Unique index parsial pada baris ber-status RUNNING membuat
-- INSERT kedua gagal (P2002) alih-alih menjalankan dua worker bersamaan yang
-- bisa saling menimpa perubahan.
CREATE UNIQUE INDEX "uq_lapak_expiry_runs_running"
  ON "lapak_expiry_runs"("lock_key")
  WHERE "status" = 'RUNNING';
