import { embedMany, gateway } from "ai";

// Meaning-based product search. Each catalog product gets one embedding of its names (every
// language Open Food Facts has) and brand, so a search for "chicken" also finds "pollo asado".
// Benchmarked 2026-11-23 on Spanish products with Russian, English and Spanish queries: Gemini
// Embedding found "курица", "сыр" and "молоко" where OpenAI's small and large models and Cohere's
// returned unrelated products. 768 dimensions keep the index moderate for a country import.

export const EMBEDDING_DIMENSIONS = 768;
const DEFAULT_EMBEDDING_MODEL = "google/gemini-embedding-001";
// Longer text adds cost without helping a product match.
const MAX_TEXT_LENGTH = 400;

export function embeddingModelId(): string {
  return process.env.PRODUCT_EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL;
}

// The AI Gateway authenticates with an API key or, on Vercel, the deployment's OIDC token.
export function canEmbed(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY?.trim() || process.env.VERCEL_OIDC_TOKEN?.trim());
}

export function productEmbeddingText(input: { brands?: string | null; name?: string | null; searchSource?: string | null }): string {
  const text = (input.searchSource?.trim() || [input.name, input.brands].filter(Boolean).join(" ")).replace(/\s+/g, " ");
  return text.slice(0, MAX_TEXT_LENGTH);
}

// Products are embedded as documents and searches as queries, which Gemini tunes for retrieval.
export async function embedTexts(
  texts: readonly string[],
  options: { purpose: "document" | "query"; signal?: AbortSignal },
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const { embeddings } = await embedMany({
    abortSignal: options.signal,
    maxParallelCalls: 4,
    model: gateway.embeddingModel(embeddingModelId()),
    providerOptions: {
      google: { outputDimensionality: EMBEDDING_DIMENSIONS, taskType: options.purpose === "query" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT" },
      openai: { dimensions: EMBEDDING_DIMENSIONS },
    },
    values: [...texts],
  });
  for (const embedding of embeddings) {
    if (embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(`Expected ${EMBEDDING_DIMENSIONS}-dimension embeddings, got ${embedding.length}.`);
    }
  }
  return embeddings;
}

// pgvector's text form: "[0.1,0.2,...]".
export function toVectorLiteral(embedding: readonly number[]): string {
  return `[${embedding.join(",")}]`;
}

type Query = (sql: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;

const BACKFILL_BATCH = 250;

const HAS_NUTRITION = `(("nutriments" ->> 'energyKcal100g') IS NOT NULL OR ("nutriments" ->> 'energyKcal100ml') IS NOT NULL)`;

// Embeds every product with nutrition that has no embedding yet (new imports, or rows whose
// names changed). Safe to stop and rerun: each batch is written before the next one starts.
export async function embedMissingProducts(query: Query, log: (message: string) => void = () => undefined): Promise<number> {
  let total = 0;
  for (const table of [
    { key: "barcode", name: "OffProduct", text: `"searchSource"` },
    { key: "id", name: "CatalogProduct", text: `concat_ws(' ', "name", "brands")` },
  ]) {
    for (;;) {
      const { rows } = await query(
        `SELECT "${table.key}" AS key, ${table.text} AS text FROM "${table.name}"
         WHERE "embedding" IS NULL AND ${HAS_NUTRITION}
         LIMIT ${BACKFILL_BATCH}`,
        [],
      );
      if (rows.length === 0) break;
      const embeddings = await embedTexts(
        rows.map((row) => productEmbeddingText({ searchSource: String(row.text ?? "") })),
        { purpose: "document" },
      );
      await query(
        `UPDATE "${table.name}" AS p SET "embedding" = v.embedding::vector
         FROM (SELECT unnest($1::text[]) AS key, unnest($2::text[]) AS embedding) AS v
         WHERE p."${table.key}" = v.key`,
        [rows.map((row) => String(row.key)), embeddings.map(toVectorLiteral)],
      );
      total += rows.length;
      log(`Embedded ${total.toLocaleString()} products (${table.name})`);
    }
  }
  return total;
}

// Gives one of our own catalog products (a food a user saved) its embedding right away, instead
// of waiting for the next import's embedding pass.
export async function embedCatalogProduct(
  product: { brands: string | null; id: string; name: string },
  embedDocuments: (texts: readonly string[]) => Promise<number[][]>,
  execute: (sql: string, ...params: unknown[]) => Promise<unknown>,
): Promise<boolean> {
  const [embedding] = await embedDocuments([productEmbeddingText({ brands: product.brands, name: product.name })]);
  if (!embedding) return false;
  await execute(`UPDATE "CatalogProduct" SET "embedding" = $1::vector WHERE "id" = $2`, toVectorLiteral(embedding), product.id);
  return true;
}
