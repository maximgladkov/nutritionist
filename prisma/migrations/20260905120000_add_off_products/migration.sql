CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION immutable_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
AS $$
  SELECT public.unaccent('public.unaccent', $1)
$$;

CREATE TABLE "OffProduct" (
    "barcode" TEXT NOT NULL,
    "name" TEXT,
    "names" JSONB NOT NULL,
    "brands" TEXT,
    "quantity" TEXT,
    "servingSize" TEXT,
    "nutriscoreGrade" TEXT,
    "novaGroup" INTEGER,
    "ingredients" TEXT,
    "allergens" TEXT,
    "nutriments" JSONB NOT NULL,
    "imageUrl" TEXT,
    "countryCodes" TEXT[] NOT NULL,
    "searchSource" TEXT NOT NULL,
    "searchText" TEXT GENERATED ALWAYS AS (lower(immutable_unaccent(COALESCE("searchSource", '')))) STORED,
    "lastModifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OffProduct_pkey" PRIMARY KEY ("barcode")
);

CREATE INDEX "OffProduct_countryCodes_idx" ON "OffProduct" USING GIN ("countryCodes");
CREATE INDEX "OffProduct_searchText_idx" ON "OffProduct" USING GIN ("searchText" gin_trgm_ops);

CREATE TABLE "OffImportState" (
    "id" TEXT NOT NULL,
    "lastDeltaFile" TEXT,
    "lastFullImportAt" TIMESTAMP(3),
    "countryCodes" TEXT[] NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OffImportState_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CatalogProduct"
ADD COLUMN "searchText" TEXT GENERATED ALWAYS AS (
    lower(immutable_unaccent(TRIM(BOTH FROM COALESCE("name", '') || ' ' || COALESCE("brands", ''))))
) STORED;

CREATE INDEX "CatalogProduct_searchText_idx" ON "CatalogProduct" USING GIN ("searchText" gin_trgm_ops);
