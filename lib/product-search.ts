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
  names?: readonly string[];
  nutriments?: { energyKcal100g?: number | null; energyKcal100ml?: number | null } | null;
};

export function rankSearchProducts<T extends RankedProduct>(
  products: readonly T[],
  queries: readonly string[],
  country?: string,
): T[] {
  const foldedQueries = [...new Set(queries.map(foldSearchText).filter((query) => query.length > 0))];
  const iso = country?.trim().toLowerCase() || undefined;
  const words = [...new Set(foldedQueries.flatMap((query) => query.split(/\s+/)).filter((word) => word.length >= 2))];
  return products
    .map((product) => withMatchingName(product, words))
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

// A product is shown under the name we'd normally pick (the user's language first). When that name
// has none of the searched words, though, it looks unrelated: Open Food Facts lists a Hacendado
// "Cheesecake" whose Spanish name is "Cheesecake con arándanos". Then the name with the most of
// the searched words is shown instead, and ranked by. The other names are dropped either way.
function withMatchingName<T extends RankedProduct>(product: T, words: readonly string[]): T {
  const { names, ...rest } = product;
  const matches = (name: string | null | undefined) => {
    const folded = foldSearchText(name ?? "");
    return words.filter((word) => folded.includes(word)).length;
  };
  if (!names || names.length === 0 || words.length === 0 || matches(product.name) > 0) {
    return rest as T;
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const name of names) {
    const count = matches(name);
    if (count > bestCount) {
      best = name;
      bestCount = count;
    }
  }
  return (best ? { ...rest, name: best } : rest) as T;
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
// exact name, then how many searched words really appear in the name or brand, then foods sold
// where the user lives, then names that start with what was searched ("Arándanos enteros" before
// "Mermelada de arándanos"), then branded ones, then the shortest.
// The word count keeps typo-tolerant lookalikes below real matches: for "arandanos hac", "Habitas ·
// Aranca" is let in by fuzzy matching ("aranca" is close to "arandanos") but has neither word, so
// "Barritas arándanos · Hacendado" comes first even though its name is longer.
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
  const missing = missingWords(`${foldedName} ${foldSearchText(product.brands ?? "")}`, foldedQueries);
  return [nutrition, exact, missing, local, leads, branded, foldedName.length];
}

// How many words of the closest query don't appear in `text`. Several queries are the same search
// in other languages, so the best of them counts. Words appear when they're part of a word, so
// "hac" counts for "Hacendado".
function missingWords(text: string, foldedQueries: readonly string[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (const query of foldedQueries) {
    const words = query.split(/\s+/).filter((word) => word.length > 0);
    if (words.length === 0) continue;
    best = Math.min(best, words.filter((word) => !text.includes(word)).length);
  }
  return Number.isFinite(best) ? best : 0;
}
