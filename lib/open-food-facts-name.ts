import { toOpenFoodFactsCountry } from "./countries.ts";

export const PRODUCT_NAME_FIELDS = [
  "product_name",
  "product_name_en",
  "product_name_es",
  "product_name_fr",
  "product_name_de",
  "product_name_it",
  "product_name_pt",
  "product_name_nl",
  "product_name_ru",
  "generic_name",
  "abbreviated_product_name",
] as const;

const LANGUAGE_NAME_KEYS = [
  "product_name_en",
  "product_name_es",
  "product_name_fr",
  "product_name_de",
  "product_name_it",
  "product_name_pt",
  "product_name_nl",
  "product_name_ru",
] as const;

export function preferredLanguageForCountry(country?: string): string | undefined {
  if (!country) {
    return undefined;
  }
  const cc = toOpenFoodFactsCountry(country);
  if (!cc) {
    return undefined;
  }
  return cc === "uk" ? "en" : cc;
}

export function pickProductName(
  product: Record<string, unknown>,
  preferredLanguage?: string,
): string | null {
  const keys = [
    preferredLanguage ? `product_name_${preferredLanguage}` : undefined,
    "product_name",
    ...LANGUAGE_NAME_KEYS,
    preferredLanguage ? `generic_name_${preferredLanguage}` : undefined,
    "generic_name",
    "abbreviated_product_name",
  ];
  const seen = new Set<string>();
  for (const key of keys) {
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    const value = nonemptyString(product[key]);
    if (value) {
      return value;
    }
  }
  for (const key of Object.keys(product).sort()) {
    if (seen.has(key) || !/^product_name_[a-z]{2}$/.test(key)) {
      continue;
    }
    const value = nonemptyString(product[key]);
    if (value) {
      return value;
    }
  }
  return null;
}

export function choosePackagedFoodName(input: {
  barcode: string;
  productName: string | null | undefined;
  providedName?: string;
}): string {
  const provided = input.providedName?.trim() || undefined;
  const product = input.productName?.trim() || undefined;
  if (provided && !isSameBarcode(provided, input.barcode)) {
    return provided;
  }
  return product ?? provided ?? input.barcode;
}

function isSameBarcode(value: string, barcode: string) {
  return value.replace(/\s+/g, "") === barcode.replace(/\s+/g, "");
}

function nonemptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}
