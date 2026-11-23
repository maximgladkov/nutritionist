-- Generic foods from reference tables (USDA SR Legacy) for plain foods the packaged-product
-- catalog doesn't cover. Searched by spelling (trigram) and by meaning (embedding).
CREATE TABLE "GenericFood" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "nutriments" JSONB NOT NULL,
    "portions" JSONB NOT NULL,
    "searchText" TEXT GENERATED ALWAYS AS (
        lower(immutable_unaccent(TRIM(BOTH FROM COALESCE("name", '') || ' ' || COALESCE("category", ''))))
    ) STORED,
    "embedding" vector(768),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GenericFood_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GenericFood_source_sourceId_key" ON "GenericFood"("source", "sourceId");
CREATE INDEX "GenericFood_searchText_idx" ON "GenericFood" USING GIN ("searchText" gin_trgm_ops);
CREATE INDEX "GenericFood_embedding_idx" ON "GenericFood" USING hnsw ("embedding" vector_cosine_ops);
