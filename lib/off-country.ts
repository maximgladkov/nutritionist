import { normalizeCountryCode } from "./countries.ts";

const TAG_PREFIX = /^en:/;
const TWO_LETTER = /^[a-z]{2}$/;
const SKIP_SLUGS = new Set(["eu", "world", "en"]);
const SKIP_REGION_CODES = new Set(["ac", "cp", "dg", "ea", "eu", "ez", "fx", "ic", "su", "uk", "un"]);

const ALIASES: Record<string, string> = {
  uk: "gb",
  "united-kingdom": "gb",
  "great-britain": "gb",
  "great-britain-and-northern-ireland": "gb",
  usa: "us",
  "united-states-of-america": "us",
  "united-states": "us",
  russia: "ru",
  "russian-federation": "ru",
  "viet-nam": "vn",
  "czech-republic": "cz",
  "south-korea": "kr",
  "republic-of-korea": "kr",
  "north-korea": "kp",
  "ivory-coast": "ci",
  "cape-verde": "cv",
  "swaziland": "sz",
  "macedonia": "mk",
  "east-timor": "tl",
  "bolivia": "bo",
  "brunei": "bn",
  "iran": "ir",
  "laos": "la",
  "moldova": "md",
  "palestine": "ps",
  "syria": "sy",
  "tanzania": "tz",
  "venezuela": "ve",
};

let slugToIso: Map<string, string> | undefined;

function slugifyName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function countrySlugMap(): Map<string, string> {
  if (slugToIso) {
    return slugToIso;
  }
  const map = new Map<string, string>(Object.entries(ALIASES));
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  for (let first = 65; first <= 90; first += 1) {
    for (let second = 65; second <= 90; second += 1) {
      const code = String.fromCharCode(first, second);
      const name = names.of(code);
      if (!name || name === code) {
        continue;
      }
      const iso = code.toLowerCase();
      if (SKIP_REGION_CODES.has(iso)) {
        continue;
      }
      const slug = slugifyName(name);
      if (!map.has(slug)) {
        map.set(slug, iso);
      }
    }
  }
  slugToIso = map;
  return map;
}

export function countryTagToIso(tag: string): string | null {
  const slug = tag.trim().toLowerCase().replace(TAG_PREFIX, "");
  if (!slug || SKIP_SLUGS.has(slug)) {
    return null;
  }
  if (TWO_LETTER.test(slug)) {
    if (slug === "uk") {
      return "gb";
    }
    return normalizeCountryCode(slug);
  }
  return countrySlugMap().get(slug) ?? null;
}

export function countryTagsToIsoCodes(tags: unknown): string[] {
  if (!Array.isArray(tags)) {
    return [];
  }
  const codes = new Set<string>();
  for (const tag of tags) {
    if (typeof tag !== "string") {
      continue;
    }
    const iso = countryTagToIso(tag);
    if (iso) {
      codes.add(iso);
    }
  }
  return [...codes].sort();
}

export function parseCountryList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  const codes = new Set<string>();
  for (const part of value.split(",")) {
    const iso = normalizeCountryCode(part);
    if (iso) {
      codes.add(iso);
    }
  }
  return [...codes].sort();
}

export function intersectCountryCodes(productCodes: string[], allowlist: string[]): string[] {
  if (allowlist.length === 0) {
    return [];
  }
  const allowed = new Set(allowlist);
  return productCodes.filter((code) => allowed.has(code));
}
