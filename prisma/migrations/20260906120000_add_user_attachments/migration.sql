-- CreateEnum
CREATE TYPE "CatalogProductImageKind" AS ENUM ('front', 'nutrition', 'other');

-- CreateTable
CREATE TABLE "UserAttachment" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT NOT NULL,
    "turnId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "filename" TEXT,
    "mediaType" TEXT NOT NULL,
    "size" INTEGER,
    "blobUrl" TEXT NOT NULL,
    "blobPath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogProductImage" (
    "id" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "kind" "CatalogProductImageKind" NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserAttachment_blobPath_key" ON "UserAttachment"("blobPath");

-- CreateIndex
CREATE INDEX "UserAttachment_sessionId_turnId_idx" ON "UserAttachment"("sessionId", "turnId");

-- CreateIndex
CREATE INDEX "UserAttachment_userId_idx" ON "UserAttachment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogProductImage_barcode_attachmentId_key" ON "CatalogProductImage"("barcode", "attachmentId");

-- CreateIndex
CREATE INDEX "CatalogProductImage_barcode_sortOrder_idx" ON "CatalogProductImage"("barcode", "sortOrder");

-- AddForeignKey
ALTER TABLE "UserAttachment" ADD CONSTRAINT "UserAttachment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogProductImage" ADD CONSTRAINT "CatalogProductImage_barcode_fkey" FOREIGN KEY ("barcode") REFERENCES "CatalogProduct"("barcode") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogProductImage" ADD CONSTRAINT "CatalogProductImage_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "UserAttachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
