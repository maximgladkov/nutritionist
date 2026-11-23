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

export type EmbedBackfillOptions = {
  batchSize?: number;
  // Batches embedded and written at the same time. Each needs its own database connection, so a
  // single pg Client should use 1 (the import does); the backfill script uses a pool.
  concurrency?: number;
  embed?: (texts: readonly string[]) => Promise<number[][]>;
  log?: (message: string) => void;
};

const DEFAULT_BATCH = 250;

const HAS_NUTRITION = `(("nutriments" ->> 'energyKcal100g') IS NOT NULL OR ("nutriments" ->> 'energyKcal100ml') IS NOT NULL)`;

const TABLES = [
  { key: "barcode", name: "OffProduct", text: `"searchSource"` },
  { key: "id", name: "CatalogProduct", text: `concat_ws(' ', "name", "brands")` },
  { key: "id", name: "GenericFood", text: `concat_ws(' · ', "name", "category")` },
] as const;

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "?";
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

// Embeds every product with nutrition that has no embedding yet (new imports, or rows whose
// names changed). It walks each table in key order, so finding the next batch never rescans
// rows it already passed, and keeps several batches in flight at once. Safe to stop and rerun:
// each batch is written as soon as it's embedded, and the next run skips what's done.
export async function embedMissingProducts(query: Query, options: EmbedBackfillOptions = {}): Promise<number> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH;
  const concurrency = Math.max(1, options.concurrency ?? 1);
  const embed = options.embed ?? ((texts: readonly string[]) => embedTexts(texts, { purpose: "document" }));
  const log = options.log ?? (() => undefined);
  let total = 0;
  for (const table of TABLES) {
    const missingSql = `"embedding" IS NULL AND ${HAS_NUTRITION}`;
    const { rows: counted } = await query(`SELECT count(*)::int AS left FROM "${table.name}" WHERE ${missingSql}`, []);
    const remaining = Number(counted[0]?.left ?? 0);
    if (remaining === 0) continue;
    log(`${table.name}: ${remaining.toLocaleString()} products to embed`);

    const started = Date.now();
    let done = 0;
    let cursor = "";
    const inFlight = new Set<Promise<void>>();
    const writeBatch = async (rows: Record<string, unknown>[]) => {
      const embeddings = await embed(rows.map((row) => productEmbeddingText({ searchSource: String(row.text ?? "") })));
      if (embeddings.length !== rows.length) throw new Error(`Got ${embeddings.length} embeddings for ${rows.length} products.`);
      await query(
        `UPDATE "${table.name}" AS p SET "embedding" = v.embedding::vector
         FROM (SELECT unnest($1::text[]) AS key, unnest($2::text[]) AS embedding) AS v
         WHERE p."${table.key}" = v.key`,
        [rows.map((row) => String(row.key)), embeddings.map(toVectorLiteral)],
      );
      done += rows.length;
      const perMinute = (done / Math.max(1, Date.now() - started)) * 60_000;
      const left = Math.max(0, remaining - done);
      log(
        `${table.name}: ${done.toLocaleString()} / ${remaining.toLocaleString()} · ${Math.round(perMinute).toLocaleString()}/min · about ${formatDuration((left / perMinute) * 60)} left`,
      );
    };

    for (;;) {
      const { rows } = await query(
        `SELECT "${table.key}" AS key, ${table.text} AS text FROM "${table.name}"
         WHERE "${table.key}" > $1 AND ${missingSql}
         ORDER BY "${table.key}"
         LIMIT ${batchSize}`,
        [cursor],
      );
      if (rows.length === 0) break;
      cursor = String(rows[rows.length - 1]!.key);
      const task: Promise<void> = writeBatch(rows).finally(() => inFlight.delete(task));
      inFlight.add(task);
      if (inFlight.size >= concurrency) await Promise.race(inFlight);
    }
    await Promise.all(inFlight);
    total += done;
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
