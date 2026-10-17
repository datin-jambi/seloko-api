-- CreateEnum
CREATE TYPE "organization_type" AS ENUM ('OPD', 'UPTD', 'BIRO', 'LAINNYA');

-- CreateTable
CREATE TABLE "organizations" (
    "id" VARCHAR(36) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "short_name" VARCHAR(100),
    "type" "organization_type" NOT NULL DEFAULT 'OPD',
    "parent_id" VARCHAR(36),
    "description" TEXT,
    "address" TEXT,
    "phone" VARCHAR(30),
    "email" VARCHAR(100),
    "website" VARCHAR(255),
    "logo_url" VARCHAR(500),
    "logo_file_id" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_app_role_organizations" (
    "user_app_role_id" VARCHAR(36) NOT NULL,
    "organization_id" VARCHAR(36) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_app_role_organizations_pkey" PRIMARY KEY ("user_app_role_id","organization_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_code_key" ON "organizations"("code");

-- CreateIndex
CREATE INDEX "organizations_parent_id_idx" ON "organizations"("parent_id");

-- CreateIndex
CREATE INDEX "organizations_type_is_active_idx" ON "organizations"("type", "is_active");

-- CreateIndex
CREATE INDEX "user_app_role_organizations_organization_id_idx" ON "user_app_role_organizations"("organization_id");

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_app_role_organizations" ADD CONSTRAINT "user_app_role_organizations_user_app_role_id_fkey" FOREIGN KEY ("user_app_role_id") REFERENCES "user_app_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_app_role_organizations" ADD CONSTRAINT "user_app_role_organizations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

