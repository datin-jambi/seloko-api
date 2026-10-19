-- Konten per OPD (LJ-4.1, PRD 04 §G).
--
-- Berita/artikel/galeri/banner OPD memakai tabel universal yang sudah ada.
-- Kolom `organization_id` NULLABLE dan ADDITIF: baris lama (milik Bapenda)
-- tetap bernilai NULL dan tidak terpengaruh sama sekali.
--
-- Nullable adalah kunci non-breaking: query Bapenda tidak memfilter kolom ini,
-- sedangkan query Lapak memfilter `organization_id = <opd>`.

ALTER TABLE "articles" ADD COLUMN "organization_id" VARCHAR(36);
ALTER TABLE "banners" ADD COLUMN "organization_id" VARCHAR(36);
ALTER TABLE "galleries" ADD COLUMN "organization_id" VARCHAR(36);

-- Index komposit: pola query publik Lapak selalu
-- (app + OPD + jenis + status), jadi index ini yang dipakai.
CREATE INDEX "idx_articles_app_org_type_status"
  ON "articles"("app_id", "organization_id", "type", "status");
CREATE INDEX "idx_banners_app_org_active"
  ON "banners"("app_id", "organization_id", "is_active");
CREATE INDEX "idx_galleries_app_org_status"
  ON "galleries"("app_id", "organization_id", "status");

-- ON DELETE CASCADE: bila OPD dihapus, kontennya ikut — konten OPD tidak punya
-- makna tanpa OPD pemiliknya. Baris Bapenda (NULL) tidak terkena aturan ini.
ALTER TABLE "articles" ADD CONSTRAINT "articles_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "banners" ADD CONSTRAINT "banners_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "galleries" ADD CONSTRAINT "galleries_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
