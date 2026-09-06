import { Prisma } from "../generated/prisma/client.ts";

export const WORD_SIMILARITY_THRESHOLD = "0.4";
export const MIN_SEARCH_TOKEN_LENGTH = 2;

export function searchTokens(query: string): string[] {
  return query
    .trim()
    .split(/\s+/)
    .filter((token) => token.length >= MIN_SEARCH_TOKEN_LENGTH);
}

export function fuzzyTokenFilters(tokens: string[]): Prisma.Sql[] {
  return tokens.map(
    (token) => Prisma.sql`AND immutable_unaccent(lower(${token})) <% "searchText"`,
  );
}

export function setWordSimilarityThresholdSql(): Prisma.Sql {
  return Prisma.sql`SELECT set_config('pg_trgm.word_similarity_threshold', ${WORD_SIMILARITY_THRESHOLD}, true)`;
}

export function productSearchOrderSql(query: string): Prisma.Sql {
  const trimmed = query.trim();
  return Prisma.sql`(immutable_unaccent(lower(COALESCE("name", ''))) = immutable_unaccent(lower(${trimmed}))) DESC,
      (("nutriments" ->> 'energyKcal100g') IS NOT NULL OR ("nutriments" ->> 'energyKcal100ml') IS NOT NULL) DESC,
      word_similarity(immutable_unaccent(lower(${trimmed})), "searchText") DESC,
      char_length("searchText") ASC`;
}

export function foldSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

export function rankSearchProducts<T extends { hasNutrition: boolean; name?: string | null }>(
  products: readonly T[],
  queries: readonly string[],
): T[] {
  const foldedQueries = [...new Set(queries.map(foldSearchText).filter((query) => query.length > 0))];
  return products
    .map((product, index) => ({ index, key: searchRankKey(product, foldedQueries), product }))
    .sort((left, right) => {
      for (let i = 0; i < left.key.length; i += 1) {
        const delta = left.key[i]! - right.key[i]!;
        if (delta !== 0) {
          return delta;
        }
      }
      return left.index - right.index;
    })
    .map((item) => item.product);
}

function searchRankKey(
  product: { hasNutrition: boolean; name?: string | null },
  foldedQueries: readonly string[],
): readonly [number, number, number] {
  const foldedName = foldSearchText(product.name ?? "");
  const exact = foldedName.length > 0 && foldedQueries.includes(foldedName) ? 0 : 1;
  const nutrition = product.hasNutrition ? 0 : 1;
  return [exact, nutrition, foldedName.length];
}
