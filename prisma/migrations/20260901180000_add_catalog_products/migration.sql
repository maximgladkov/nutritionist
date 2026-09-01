-- CreateTable
CREATE TABLE "CatalogProduct" (
    "barcode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brands" TEXT,
    "quantity" TEXT,
    "servingSize" TEXT,
    "nutriments" JSONB NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogProduct_pkey" PRIMARY KEY ("barcode")
);

-- CreateIndex
CREATE INDEX "CatalogProduct_createdByUserId_idx" ON "CatalogProduct"("createdByUserId");

-- CreateIndex
CREATE INDEX "CatalogProduct_name_idx" ON "CatalogProduct"("name");

-- AddForeignKey
ALTER TABLE "CatalogProduct" ADD CONSTRAINT "CatalogProduct_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
