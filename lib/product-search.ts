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
