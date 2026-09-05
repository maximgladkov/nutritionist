import { countryTagsToIsoCodes, intersectCountryCodes } from "./off-country.ts";
import {
  pickProductName,
  PRODUCT_NAME_FIELDS,
} from "./open-food-facts-name.ts";
import {
  extractProductNutriments,
  isValidBarcode,
  mapProductFields,
  type ProductNutriments,
} from "./open-food-facts-map.ts";

export type SlimOffProduct = {
  allergens: string | null;
  barcode: string;
  brands: string | null;
  countryCodes: string[];
  imageUrl: string | null;
  ingredients: string | null;
  lastModifiedAt: Date | null;
  name: string | null;
  names: Record<string, string>;
  novaGroup: number | null;
  nutriments: ProductNutriments;
  nutriscoreGrade: string | null;
  quantity: string | null;
  searchSource: string;
  servingSize: string | null;
};

const LOCALIZED_NAME_KEYS = PRODUCT_NAME_FIELDS.filter((key) => key !== "product_name");

export function stripNullBytes(value: string): string {
  return value.replaceAll("\u0000", "");
}

export function buildSearchSource(input: {
  brands: string | null;
  name: string | null;
  names: Record<string, string>;
}): string {
  const parts = [input.name, input.brands, ...Object.values(input.names)];
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const trimmed = part?.trim() ?? "";
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(trimmed);
  }
  return unique.join(" ");
}

export function extractLocalizedNames(product: Record<string, unknown>): Record<string, string> {
  const names: Record<string, string> = {};
  for (const key of LOCALIZED_NAME_KEYS) {
    const value = nonemptyString(product[key]);
    if (value) {
      names[key] = value;
    }
  }
  for (const key of Object.keys(product).sort()) {
    if (names[key] || !/^product_name_[a-z]{2}$/.test(key)) {
      continue;
    }
    const value = nonemptyString(product[key]);
    if (value) {
      names[key] = value;
    }
  }
  return names;
}

export function slimOffDocument(
  product: Record<string, unknown>,
  allowlist: string[],
): SlimOffProduct | null {
  const barcode = normalizeCode(product.code);
  if (!barcode || !isValidBarcode(barcode)) {
    return null;
  }
  const countryCodes = intersectCountryCodes(countryTagsToIsoCodes(product.countries_tags), allowlist);
  if (countryCodes.length === 0) {
    return null;
  }
  const names = extractLocalizedNames(product);
  const name = nonemptyString(pickProductName({ ...product, ...names }));
  if (!name) {
    return null;
  }
  const brands = nonemptyString(product.brands);
  const mapped = mapProductFields(product, barcode);
  return {
    allergens: nonemptyString(mapped.allergens),
    barcode,
    brands,
    countryCodes,
    imageUrl: nonemptyString(mapped.imageUrl),
    ingredients: nonemptyString(mapped.ingredients),
    lastModifiedAt: parseLastModified(product),
    name,
    names,
    novaGroup: mapped.novaGroup,
    nutriments: extractProductNutriments(product),
    nutriscoreGrade: nonemptyString(mapped.nutriscoreGrade),
    quantity: nonemptyString(mapped.quantity),
    searchSource: buildSearchSource({ brands, name, names }),
    servingSize: nonemptyString(mapped.servingSize),
  };
}

function normalizeCode(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string") {
    const trimmed = value.replace(/\s+/g, "");
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

function parseLastModified(product: Record<string, unknown>): Date | null {
  const timestamp = product.last_modified_t;
  if (typeof timestamp === "number" && Number.isFinite(timestamp)) {
    return new Date(timestamp * 1000);
  }
  if (typeof timestamp === "string" && timestamp.trim() !== "") {
    const parsed = Number(timestamp);
    if (Number.isFinite(parsed)) {
      return new Date(parsed * 1000);
    }
  }
  return null;
}

function nonemptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = stripNullBytes(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}
