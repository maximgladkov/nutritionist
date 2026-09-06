-- AlterTable
ALTER TABLE "CatalogProduct" ADD COLUMN "id" TEXT;

UPDATE "CatalogProduct"
SET "id" = 'c' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 24)
WHERE "id" IS NULL;

ALTER TABLE "CatalogProduct" ALTER COLUMN "id" SET NOT NULL;

-- AlterTable
ALTER TABLE "CatalogProductImage" ADD COLUMN "productId" TEXT;

UPDATE "CatalogProductImage" AS image
SET "productId" = product."id"
FROM "CatalogProduct" AS product
WHERE image."barcode" = product."barcode";

DELETE FROM "CatalogProductImage" WHERE "productId" IS NULL;

ALTER TABLE "CatalogProductImage" ALTER COLUMN "productId" SET NOT NULL;

-- DropForeignKey
ALTER TABLE "CatalogProductImage" DROP CONSTRAINT "CatalogProductImage_barcode_fkey";

-- DropIndex
DROP INDEX "CatalogProductImage_barcode_attachmentId_key";

-- DropIndex
DROP INDEX "CatalogProductImage_barcode_sortOrder_idx";

-- DropPrimaryKey
ALTER TABLE "CatalogProduct" DROP CONSTRAINT "CatalogProduct_pkey";

-- AlterTable
ALTER TABLE "CatalogProduct" ALTER COLUMN "barcode" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "CatalogProduct_barcode_key" ON "CatalogProduct"("barcode");

-- AddPrimaryKey
ALTER TABLE "CatalogProduct" ADD CONSTRAINT "CatalogProduct_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "CatalogProductImage" DROP COLUMN "barcode";

-- CreateIndex
CREATE UNIQUE INDEX "CatalogProductImage_productId_attachmentId_key" ON "CatalogProductImage"("productId", "attachmentId");

-- CreateIndex
CREATE INDEX "CatalogProductImage_productId_sortOrder_idx" ON "CatalogProductImage"("productId", "sortOrder");

-- AddForeignKey
ALTER TABLE "CatalogProductImage" ADD CONSTRAINT "CatalogProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "CatalogProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
