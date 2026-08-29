import { toOpenFoodFactsCountry } from "./countries.ts";

const BASE_URL = "https://world.openfoodfacts.org";
const PRODUCT_FIELDS = [
  "code",
  "product_name",
  "brands",
  "quantity",
  "serving_size",
  "nutriscore_grade",
  "nova_group",
  "ingredients_text",
  "allergens",
  "nutriments",
  "image_url",
  "countries_tags",
].join(",");
const MAX_SEARCH_PAGE_SIZE = 10;
const BARCODE_PATTERN = /^\d{8,14}$/;

export type ProductNutriments = {
  energyKcal100g?: number;
  proteins100g?: number;
  carbohydrates100g?: number;
  sugars100g?: number;
  fat100g?: number;
  saturatedFat100g?: number;
  fiber100g?: number;
  salt100g?: number;
  energyKcal100ml?: number;
  proteins100ml?: number;
  carbohydrates100ml?: number;
  sugars100ml?: number;
  fat100ml?: number;
  saturatedFat100ml?: number;
  fiber100ml?: number;
  salt100ml?: number;
};

export type Product = {
  barcode: string;
  name: string | null;
  brands: string | null;
  quantity: string | null;
  servingSize: string | null;
  nutriscoreGrade: string | null;
  novaGroup: number | null;
  ingredients: string | null;
  allergens: string | null;
  nutriments: ProductNutriments;
  imageUrl: string | null;
  countries: string[];
};

export type ProductLookupResult =
  | { found: true; product: Product }
  | { found: false; barcode: string };

export type ProductSearchResult = {
  count: number;
  page: number;
  products: Product[];
};

export class InvalidBarcodeError extends Error {
  constructor(barcode: string) {
    super(`Invalid barcode: ${barcode}`);
    this.name = "InvalidBarcodeError";
  }
}

type LookupOptions = {
  country?: string;
  signal?: AbortSignal;
};

type SearchOptions = LookupOptions & {
  pageSize?: number;
};

type OffNutriments = Record<string, unknown>;

type OffProduct = {
  allergens?: unknown;
  brands?: unknown;
  code?: unknown;
  countries_tags?: unknown;
  image_url?: unknown;
  ingredients_text?: unknown;
  nova_group?: unknown;
  nutriments?: OffNutriments;
  nutriscore_grade?: unknown;
  product_name?: unknown;
  quantity?: unknown;
  serving_size?: unknown;
};

export async function getProductByBarcode(
  barcode: string,
  options: LookupOptions = {},
): Promise<ProductLookupResult> {
  const normalizedBarcode = normalizeBarcode(barcode);
  if (!BARCODE_PATTERN.test(normalizedBarcode)) {
    throw new InvalidBarcodeError(barcode);
  }

  const url = new URL(`${BASE_URL}/api/v3/product/${normalizedBarcode}`);
  url.searchParams.set("fields", PRODUCT_FIELDS);
  applyCountry(url, options.country);

  const response = await offFetch(url, options.signal);
  if (response.status === 404) {
    return { found: false, barcode: normalizedBarcode };
  }
  if (!response.ok) {
    throw new Error(`Open Food Facts product lookup failed (${response.status})`);
  }

  const body = (await response.json()) as { product?: OffProduct };
  if (!body.product) {
    return { found: false, barcode: normalizedBarcode };
  }
  return { found: true, product: mapProduct(body.product, normalizedBarcode) };
}

export async function searchProductsByName(
  query: string,
  options: SearchOptions = {},
): Promise<ProductSearchResult> {
  const searchTerms = query.trim();
  if (!searchTerms) {
    return { count: 0, page: 1, products: [] };
  }

  const pageSize = Math.min(
    Math.max(options.pageSize ?? MAX_SEARCH_PAGE_SIZE, 1),
    MAX_SEARCH_PAGE_SIZE,
  );
  const url = new URL(`${BASE_URL}/cgi/search.pl`);
  url.searchParams.set("search_terms", searchTerms);
  url.searchParams.set("search_simple", "1");
  url.searchParams.set("action", "process");
  url.searchParams.set("json", "1");
  url.searchParams.set("page_size", String(pageSize));
  url.searchParams.set("fields", PRODUCT_FIELDS);
  const cc = applyCountry(url, options.country);
  if (cc) {
    url.searchParams.set("tagtype_0", "countries");
    url.searchParams.set("tag_contains_0", "contains");
    url.searchParams.set("tag_0", cc);
  }

  const response = await offFetch(url, options.signal);
  if (!response.ok) {
    throw new Error(`Open Food Facts product search failed (${response.status})`);
  }

  const body = (await response.json()) as {
    count?: unknown;
    page?: unknown;
    products?: OffProduct[];
  };
  const products = Array.isArray(body.products) ? body.products.map((product) => mapProduct(product)) : [];
  return {
    count: typeof body.count === "number" ? body.count : products.length,
    page: typeof body.page === "number" ? body.page : 1,
    products,
  };
}

function applyCountry(url: URL, country: string | undefined): string | undefined {
  if (!country) {
    return undefined;
  }
  const cc = toOpenFoodFactsCountry(country);
  if (!cc) {
    return undefined;
  }
  url.searchParams.set("cc", cc);
  return cc;
}

function normalizeBarcode(barcode: string): string {
  return barcode.replace(/\s+/g, "");
}

function userAgent(): string {
  const from = process.env.AUTH_EMAIL_FROM?.trim();
  const contact = emailFromAddress(from) ?? from ?? "local";
  return `Nutritionist/0.0.0 (${contact})`;
}

function emailFromAddress(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const angled = value.match(/<([^>]+)>/);
  if (angled?.[1]) {
    return angled[1];
  }
  return value.includes("@") ? value : undefined;
}

async function offFetch(url: URL, signal: AbortSignal | undefined): Promise<Response> {
  return fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": userAgent(),
    },
    signal,
  });
}

function mapProduct(product: OffProduct, fallbackBarcode?: string): Product {
  const barcode = stringOrNull(product.code) ?? fallbackBarcode ?? "";
  return {
    barcode,
    name: stringOrNull(product.product_name),
    brands: stringOrNull(product.brands),
    quantity: stringOrNull(product.quantity),
    servingSize: stringOrNull(product.serving_size),
    nutriscoreGrade: stringOrNull(product.nutriscore_grade),
    novaGroup: numberOrNull(product.nova_group),
    ingredients: stringOrNull(product.ingredients_text),
    allergens: stringOrNull(product.allergens),
    nutriments: mapNutriments(product.nutriments),
    imageUrl: stringOrNull(product.image_url),
    countries: stringArray(product.countries_tags),
  };
}

function mapNutriments(nutriments: OffNutriments | undefined): ProductNutriments {
  if (!nutriments) {
    return {};
  }
  return {
    energyKcal100g: numberOrUndefined(nutriments["energy-kcal_100g"]),
    proteins100g: numberOrUndefined(nutriments.proteins_100g),
    carbohydrates100g: numberOrUndefined(nutriments.carbohydrates_100g),
    sugars100g: numberOrUndefined(nutriments.sugars_100g),
    fat100g: numberOrUndefined(nutriments.fat_100g),
    saturatedFat100g: numberOrUndefined(nutriments["saturated-fat_100g"]),
    fiber100g: numberOrUndefined(nutriments.fiber_100g),
    salt100g: numberOrUndefined(nutriments.salt_100g),
    energyKcal100ml: numberOrUndefined(nutriments["energy-kcal_100ml"]),
    proteins100ml: numberOrUndefined(nutriments.proteins_100ml),
    carbohydrates100ml: numberOrUndefined(nutriments.carbohydrates_100ml),
    sugars100ml: numberOrUndefined(nutriments.sugars_100ml),
    fat100ml: numberOrUndefined(nutriments.fat_100ml),
    saturatedFat100ml: numberOrUndefined(nutriments["saturated-fat_100ml"]),
    fiber100ml: numberOrUndefined(nutriments.fiber_100ml),
    salt100ml: numberOrUndefined(nutriments.salt_100ml),
  };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}
