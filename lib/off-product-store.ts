import { Prisma } from "../generated/prisma/client.ts";
import { pickNutriments } from "./catalog-product-query.ts";
import {
  pickProductName,
  preferredLanguageForCountry,
} from "./open-food-facts-name.ts";
import type { Product } from "./open-food-facts-map.ts";
import { prisma, usingAccelerate } from "./prisma.ts";
import {
  fuzzyTokenFilters,
  productSearchOrderSql,
  searchTokens,
  setWordSimilarityThresholdSql,
  WORD_SIMILARITY_THRESHOLD,
} from "./product-search.ts";

type OffProductRow = {
  allergens: string | null;
  barcode: string;
  brands: string | null;
  countryCodes: string[];
  imageUrl: string | null;
  ingredients: string | null;
  name: string | null;
  names: Prisma.JsonValue;
  novaGroup: number | null;
  nutriments: Prisma.JsonValue;
  nutriscoreGrade: string | null;
  quantity: string | null;
  servingSize: string | null;
};

type CatalogProductRow = {
  barcode: string | null;
  brands: string | null;
  id: string;
  name: string;
  nutriments: Prisma.JsonValue;
  quantity: string | null;
  servingSize: string | null;
};

export async function findOffProductByBarcode(
  barcode: string,
  country?: string,
): Promise<Product | null> {
  const row = await prisma.offProduct.findUnique({
    where: { barcode },
    ...(usingAccelerate
      ? { cacheStrategy: { swr: 3600, tags: ["off_product"], ttl: 300 } }
      : {}),
  } as Parameters<typeof prisma.offProduct.findUnique>[0]);
  if (!row) {
    return null;
  }
  return offRowToProduct(row, country);
}

// Searches run in a transaction only to set the similarity threshold the trigram index needs.
// Grounding a meal runs many at once, so wait for a free connection instead of Prisma's default
// 2 s, which failed busy requests outright.
const SEARCH_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 10_000 };

export async function searchOffProductsByName(
  query: string,
  options: { country?: string; pageSize: number },
): Promise<Product[]> {
  const tokens = searchTokens(query);
  if (tokens.length === 0) {
    return [];
  }
  const rows = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(setWordSimilarityThresholdSql());
    return tx.$queryRaw<OffProductRow[]>`
      SELECT
        "barcode", "name", "names", "brands", "quantity", "servingSize",
        "nutriscoreGrade", "novaGroup", "ingredients", "allergens",
        "nutriments", "imageUrl", "countryCodes"
      FROM "OffProduct"
      WHERE 1=1
      ${Prisma.join(fuzzyTokenFilters(tokens), " ")}
      ORDER BY ${countryFirstSql(options.country)} ${productSearchOrderSql(query, { branded: true })}
      LIMIT ${options.pageSize}
    `;
  }, SEARCH_TRANSACTION_OPTIONS);
  return rows.map((row) => offRowToProduct(row, options.country));
}

export async function searchCatalogProductsFuzzy(
  query: string,
  pageSize: number,
): Promise<Product[]> {
  const tokens = searchTokens(query);
  if (tokens.length === 0) {
    return [];
  }
  const rows = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(setWordSimilarityThresholdSql());
    return tx.$queryRaw<CatalogProductRow[]>`
      SELECT "id", "barcode", "name", "brands", "quantity", "servingSize", "nutriments"
      FROM "CatalogProduct"
      WHERE 1=1
      ${Prisma.join(fuzzyTokenFilters(tokens), " ")}
      ORDER BY ${productSearchOrderSql(query, { branded: true })}
      LIMIT ${pageSize}
    `;
  }, SEARCH_TRANSACTION_OPTIONS);
  return rows.map(catalogRowToProduct);
}

// Search covers every product we have; ones sold in the user's country come first, so
// imported or travel foods are still found.
function countryFirstSql(country: string | undefined): Prisma.Sql {
  const iso = country?.trim().toLowerCase();
  if (!iso || !/^[a-z]{2}$/.test(iso)) {
    return Prisma.empty;
  }
  return Prisma.sql`(${iso} = ANY("countryCodes")) DESC,`;
}

function offRowToProduct(row: OffProductRow, country?: string): Product {
  const names = asRecord(row.names);
  return {
    allergens: row.allergens,
    barcode: row.barcode,
    brands: row.brands,
    countries: row.countryCodes,
    imageUrl: row.imageUrl,
    ingredients: row.ingredients,
    name: pickProductName(
      { product_name: row.name, ...names },
      preferredLanguageForCountry(country),
    ),
    names: [row.name, ...Object.values(names)].filter(
      (value): value is string => typeof value === "string" && value.trim().length > 0,
    ),
    novaGroup: row.novaGroup,
    nutriments: pickNutriments(asRecord(row.nutriments)),
    nutriscoreGrade: row.nutriscoreGrade,
    quantity: row.quantity,
    servingSize: row.servingSize,
  };
}

function catalogRowToProduct(row: CatalogProductRow): Product {
  return {
    allergens: null,
    barcode: row.barcode,
    brands: row.brands,
    countries: [],
    id: row.id,
    imageUrl: null,
    ingredients: null,
    name: row.name,
    novaGroup: null,
    nutriments: pickNutriments(asRecord(row.nutriments)),
    nutriscoreGrade: null,
    quantity: row.quantity,
    servingSize: row.servingSize,
  };
}

function asRecord(value: Prisma.JsonValue | Record<string, unknown>): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

const HAS_NUTRITION_SQL = Prisma.sql`(("nutriments" ->> 'energyKcal100g') IS NOT NULL OR ("nutriments" ->> 'energyKcal100ml') IS NOT NULL)`;
// Cosine distance past which a product is about something else (Gemini Embedding: good matches
// sit around 0.30-0.36, unrelated text from 0.40).
const MAX_EMBEDDING_DISTANCE = 0.38;

export type EmbeddingMatch = { distance: number; product: Product; source: "custom-catalog" | "generic" | "open-food-facts" };

// Products closest in meaning to `embedding` (a pgvector literal), from our own catalog and the
// Open Food Facts import, nearest first. Only products with nutrition are returned.
export async function searchProductsByEmbedding(
  embedding: string,
  options: { country?: string; limit: number },
): Promise<EmbeddingMatch[]> {
  const [off, catalog, generic] = await Promise.all([
    prisma.$queryRaw<(OffProductRow & { distance: number })[]>`
      SELECT
        "barcode", "name", "names", "brands", "quantity", "servingSize",
        "nutriscoreGrade", "novaGroup", "ingredients", "allergens",
        "nutriments", "imageUrl", "countryCodes",
        ("embedding" <=> ${embedding}::vector) AS distance
      FROM "OffProduct"
      WHERE "embedding" IS NOT NULL AND ${HAS_NUTRITION_SQL}
      ORDER BY "embedding" <=> ${embedding}::vector
      LIMIT ${options.limit}
    `,
    prisma.$queryRaw<(CatalogProductRow & { distance: number })[]>`
      SELECT "id", "barcode", "name", "brands", "quantity", "servingSize", "nutriments",
        ("embedding" <=> ${embedding}::vector) AS distance
      FROM "CatalogProduct"
      WHERE "embedding" IS NOT NULL AND ${HAS_NUTRITION_SQL}
      ORDER BY "embedding" <=> ${embedding}::vector
      LIMIT ${options.limit}
    `,
    genericByEmbedding(embedding, options.limit),
  ]);
  return [
    ...generic,
    ...catalog.map((row) => ({ distance: Number(row.distance), product: catalogRowToProduct(row), source: "custom-catalog" as const })),
    ...off.map((row) => ({ distance: Number(row.distance), product: offRowToProduct(row, options.country), source: "open-food-facts" as const })),
  ]
    .filter((match) => match.distance <= MAX_EMBEDDING_DISTANCE)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, options.limit);
}

type GenericFoodRow = {
  category: string | null;
  id: string;
  name: string;
  nutriments: Prisma.JsonValue;
  portions: Prisma.JsonValue;
};

export const GENERIC_ID_PREFIX = "usda:";

export function isGenericFoodId(id: string): boolean {
  return id.startsWith(GENERIC_ID_PREFIX);
}

// A generic food in the shape of a product: no brand or barcode, its first household portion
// as the serving (so "1 large egg" becomes a one-tap amount).
function genericRowToProduct(row: GenericFoodRow): Product {
  const portions = Array.isArray(row.portions) ? (row.portions as { grams?: number; label?: string }[]) : [];
  const first = portions.find((portion) => typeof portion.grams === "number" && portion.grams > 0);
  return {
    allergens: null,
    barcode: null,
    brands: null,
    countries: [],
    id: row.id,
    imageUrl: null,
    ingredients: null,
    name: row.name,
    novaGroup: null,
    nutriments: pickNutriments(asRecord(row.nutriments)),
    nutriscoreGrade: null,
    quantity: null,
    servingSize: first ? `${first.grams} g` : null,
  };
}

export async function findGenericFood(id: string): Promise<Product | null> {
  const [row] = await prisma.$queryRaw<GenericFoodRow[]>`
    SELECT "id", "name", "category", "nutriments", "portions" FROM "GenericFood" WHERE "id" = ${id}
  `;
  return row ? genericRowToProduct(row) : null;
}

// Generic foods by spelling, closest first.
export async function searchGenericFoodsByName(query: string, limit: number): Promise<Product[]> {
  const tokens = searchTokens(query);
  if (tokens.length === 0) {
    return [];
  }
  // The table is small enough to scan, so compare similarity directly instead of setting the
  // threshold in a transaction: a meal photo runs dozens of these at once, and transactions
  // waiting for a connection were failing the whole request.
  const rows = await prisma.$queryRaw<GenericFoodRow[]>`
    SELECT "id", "name", "category", "nutriments", "portions"
    FROM "GenericFood"
    WHERE 1=1
    ${Prisma.join(
      tokens.map(
        (token) =>
          Prisma.sql`AND word_similarity(immutable_unaccent(lower(${token})), "searchText") >= ${Number(WORD_SIMILARITY_THRESHOLD)}`,
      ),
      " ",
    )}
    ORDER BY ${productSearchOrderSql(query)}
    LIMIT ${limit}
  `;
  return rows.map(genericRowToProduct);
}

export async function genericByEmbedding(embedding: string, limit: number): Promise<EmbeddingMatch[]> {
  const rows = await prisma.$queryRaw<(GenericFoodRow & { distance: number })[]>`
    SELECT "id", "name", "category", "nutriments", "portions",
      ("embedding" <=> ${embedding}::vector) AS distance
    FROM "GenericFood"
    WHERE "embedding" IS NOT NULL
    ORDER BY "embedding" <=> ${embedding}::vector
    LIMIT ${limit}
  `;
  return rows.map((row) => ({ distance: Number(row.distance), product: genericRowToProduct(row), source: "generic" as const }));
}
