-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "favicon_file_id" VARCHAR(100),
ADD COLUMN     "favicon_url" VARCHAR(255),
ADD COLUMN     "logo_dark_file_id" VARCHAR(100),
ADD COLUMN     "logo_dark_url" VARCHAR(255),
ADD COLUMN     "logo_file_id" VARCHAR(100),
ADD COLUMN     "og_image_file_id" VARCHAR(100),
ADD COLUMN     "og_image_url" VARCHAR(255),
ADD COLUMN     "tagline" VARCHAR(150);
