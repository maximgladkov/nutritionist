import { foldSearchText } from "./product-search.ts";

// Decides which catalog product, if any, stands for a food the AI recognized. A product is only
// used when its name matches and its calories agree with the AI's own estimate; otherwise the
// estimate is kept and the closest products are offered as alternatives.

export type GroundingCandidate = {
  kcalPer100: number | null;
  name: string;
  unit: "g" | "ml";
};

export type GroundingTarget = {
  // The AI's estimate per 100 g or ml, when it gave one.
  kcalPer100?: number;
  name: string;
  searchQueries: readonly string[];
};

// Small words that say nothing about which food it is.
const STOPWORDS = new Set([
  "a", "an", "and", "of", "the", "with", "in",
  "de", "del", "la", "el", "los", "las", "con", "y", "en", "al",
  "le", "les", "des", "du", "et", "au", "aux",
  "di", "e", "il", "lo",
  "и", "с", "в",
]);

const MIN_NAME_MATCH = 0.6;
// Calories within ±25% of the estimate, or within 40 kcal for light foods, count as agreeing.
const KCAL_RATIO_TOLERANCE = 0.25;
const KCAL_ABSOLUTE_TOLERANCE = 40;

function tokens(value: string): string[] {
  return foldSearchText(value)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

// Share of the query's words found in the product name (prefix matches count, so "tostado"
// matches "tostadas").
export function nameMatch(query: string, productName: string): number {
  const wanted = tokens(query);
  if (wanted.length === 0) return 0;
  const have = tokens(productName);
  const found = wanted.filter((word) =>
    have.some((token) => token.startsWith(word.slice(0, Math.max(4, word.length - 2))) || word.startsWith(token)),
  ).length;
  return found / wanted.length;
}

export function kcalAgrees(estimate: number | undefined, actual: number | null): boolean {
  if (estimate === undefined || actual === null) return actual !== null;
  const difference = Math.abs(actual - estimate);
  return difference <= KCAL_ABSOLUTE_TOLERANCE || difference <= estimate * KCAL_RATIO_TOLERANCE;
}

// Looser check for a product the AI chose as the same food: it only rules out a clear mix-up
// (the estimate is a guess; the label is usually closer to the truth).
const PICK_RATIO_TOLERANCE = 0.35;
const PICK_ABSOLUTE_TOLERANCE = 60;

export function kcalPlausible(estimate: number | undefined, actual: number | null): boolean {
  if (actual === null) return false;
  if (estimate === undefined) return true;
  const difference = Math.abs(actual - estimate);
  return difference <= PICK_ABSOLUTE_TOLERANCE || difference <= estimate * PICK_RATIO_TOLERANCE;
}

export type GroundingResult<T> = { alternatives: T[]; match: T | null };

export function chooseCatalogMatch<T extends GroundingCandidate>(target: GroundingTarget, candidates: readonly T[]): GroundingResult<T> {
  const queries = [target.name, ...target.searchQueries];
  const scored = candidates
    .filter((candidate) => candidate.kcalPer100 !== null)
    .map((candidate, index) => ({
      agrees: kcalAgrees(target.kcalPer100, candidate.kcalPer100),
      candidate,
      index,
      kcalGap:
        target.kcalPer100 === undefined || candidate.kcalPer100 === null ? 0 : Math.abs(candidate.kcalPer100 - target.kcalPer100),
      name: Math.max(...queries.map((query) => nameMatch(query, candidate.name))),
    }))
    .filter((entry) => entry.name > 0)
    // Best name match first, then the closest calories, then the catalog's own ranking.
    .sort((a, b) => b.name - a.name || a.kcalGap - b.kcalGap || a.index - b.index);
  const match = scored.find((entry) => entry.name >= MIN_NAME_MATCH && entry.agrees)?.candidate ?? null;
  const alternatives = scored.map((entry) => entry.candidate).filter((candidate) => candidate !== match);
  return { alternatives, match };
}
