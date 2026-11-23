-- Meaning-based product search: one embedding per product (name in every language + brand),
-- so "chicken", "pollo" and "курица" find the same foods.
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "OffProduct" ADD COLUMN "embedding" vector(768);
ALTER TABLE "CatalogProduct" ADD COLUMN "embedding" vector(768);

CREATE INDEX "OffProduct_embedding_idx" ON "OffProduct" USING hnsw ("embedding" vector_cosine_ops);
CREATE INDEX "CatalogProduct_embedding_idx" ON "CatalogProduct" USING hnsw ("embedding" vector_cosine_ops);
