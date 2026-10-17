-- AlterTable
ALTER TABLE "users" ADD COLUMN     "nik" VARCHAR(16);

-- CreateIndex
CREATE UNIQUE INDEX "users_nik_key" ON "users"("nik");

