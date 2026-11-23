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

// `branded`: for tables with a "brands" column, branded products rank above unbranded ones.
export function productSearchOrderSql(query: string, options: { branded?: boolean } = {}): Prisma.Sql {
  const trimmed = query.trim();
  const brandOrder = options.branded ? Prisma.sql`(COALESCE("brands", '') <> '') DESC,` : Prisma.empty;
  return Prisma.sql`(immutable_unaccent(lower(COALESCE("name", ''))) = immutable_unaccent(lower(${trimmed}))) DESC,
      (("nutriments" ->> 'energyKcal100g') IS NOT NULL OR ("nutriments" ->> 'energyKcal100ml') IS NOT NULL) DESC,
      ${brandOrder}
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

type RankedProduct = {
  brands?: string | null;
  countries?: readonly string[];
  hasNutrition: boolean;
  name?: string | null;
  nutriments?: { energyKcal100g?: number | null; energyKcal100ml?: number | null } | null;
};

export function rankSearchProducts<T extends RankedProduct>(
  products: readonly T[],
  queries: readonly string[],
  country?: string,
): T[] {
  const foldedQueries = [...new Set(queries.map(foldSearchText).filter((query) => query.length > 0))];
  const iso = country?.trim().toLowerCase() || undefined;
  return products
    .map((product, index) => ({ index, key: searchRankKey(product, foldedQueries, iso), product }))
    .sort((left, right) => {
      for (let i = 0; i < left.key.length; i += 1) {
        const delta = left.key[i]! - right.key[i]!;
        if (delta !== 0) {
          return delta;
        }
      }
      return left.index - right.index;
    })
    .map((item) => item.product)
    .filter(firstUnbrandedOfEachName());
}

// Open Food Facts holds many entries with just a name and no brand ("Arándanos" dozens of times);
// shown together they look the same and crowd out branded products, so only the best-ranked one
// of each name stays. Branded products are all kept.
function firstUnbrandedOfEachName(): (product: RankedProduct) => boolean {
  const seen = new Set<string>();
  return (product) => {
    if ((product.brands ?? "").trim()) return true;
    const name = foldSearchText(product.name ?? "");
    if (!name) return true;
    if (seen.has(name)) return false;
    seen.add(name);
    return true;
  };
}

function hasCalories(product: RankedProduct): boolean {
  const kcal = product.nutriments?.energyKcal100g ?? product.nutriments?.energyKcal100ml ?? null;
  return product.hasNutrition && kcal !== null && kcal > 0;
}

// Real nutrition first (entries without it, or listing 0 kcal, can't be logged usefully), then the
// exact name, then foods sold where the user lives, then names that start with what was searched
// ("Arándanos enteros" before "Mermelada de arándanos"), then branded ones, then the shortest.
function searchRankKey(
  product: RankedProduct,
  foldedQueries: readonly string[],
  country: string | undefined,
): readonly number[] {
  const foldedName = foldSearchText(product.name ?? "");
  const exact = foldedName.length > 0 && foldedQueries.includes(foldedName) ? 0 : 1;
  const local = country && product.countries?.includes(country) ? 0 : 1;
  const nutrition = hasCalories(product) ? 0 : product.hasNutrition ? 1 : 2;
  const leads = foldedQueries.some((query) => query.length > 0 && foldedName.startsWith(query.split(/\s+/)[0] ?? query)) ? 0 : 1;
  const branded = (product.brands ?? "").trim() ? 0 : 1;
  return [nutrition, exact, local, leads, branded, foldedName.length];
}
