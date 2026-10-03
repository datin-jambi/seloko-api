-- CreateEnum
CREATE TYPE "audience" AS ENUM ('INTERNAL', 'PUBLIC');

-- DropIndex
DROP INDEX "users_email_key";

-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "audience" "audience" NOT NULL DEFAULT 'INTERNAL',
ADD COLUMN     "logo_url" VARCHAR(255),
ADD COLUMN     "settings" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "roles" ADD COLUMN     "audience" "audience" NOT NULL DEFAULT 'INTERNAL';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "account_type" "audience" NOT NULL DEFAULT 'INTERNAL',
ALTER COLUMN "username" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "uq_users_account_email" ON "users"("account_type", "email");


-- Pegawai login dengan email ATAU username, jadi akun INTERNAL wajib punya
-- username. Akun PUBLIC login dengan email saja. Ditegakkan di DB, bukan hanya
-- di Zod, supaya seeder atau skrip impor tidak bisa melahirkan pegawai tanpa
-- username yang kemudian tidak bisa login lewat username.
ALTER TABLE "users" ADD CONSTRAINT "chk_users_internal_username"
  CHECK ("account_type" <> 'INTERNAL' OR "username" IS NOT NULL);
