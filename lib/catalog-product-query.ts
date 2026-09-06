import type { Product, ProductNutriments, ProductSearchResult } from "./open-food-facts.ts";

const NUTRIMENT_KEYS = [
  "energyKcal100g",
  "proteins100g",
  "carbohydrates100g",
  "sugars100g",
  "fat100g",
  "saturatedFat100g",
  "fiber100g",
  "salt100g",
  "energyKcal100ml",
  "proteins100ml",
  "carbohydrates100ml",
  "sugars100ml",
  "fat100ml",
  "saturatedFat100ml",
  "fiber100ml",
  "salt100ml",
] as const satisfies readonly (keyof ProductNutriments)[];

export { NUTRIMENT_KEYS };

export type ProductSource = "custom-catalog" | "open-food-facts";

export type CatalogSearchProduct = Product & {
  hasNutrition: boolean;
  source: ProductSource;
};

export type CatalogSearchResult = {
  count: number;
  page: number;
  products: CatalogSearchProduct[];
};

export type CatalogSaveDecision =
  | { action: "create" }
  | { action: "exists"; product: Product; source: ProductSource }
  | { action: "update"; product: Product };

export function catalogNutrimentsHaveValues(nutriments: ProductNutriments) {
  return NUTRIMENT_KEYS.some((key) => typeof nutriments[key] === "number" && Number.isFinite(nutriments[key]));
}

export function preferProduct(
  catalog: Product | undefined,
  off: Product | undefined,
): { product: Product; source: ProductSource } | undefined {
  if (catalog && catalogNutrimentsHaveValues(catalog.nutriments)) {
    return { product: catalog, source: "custom-catalog" };
  }
  if (off && catalogNutrimentsHaveValues(off.nutriments)) {
    return { product: off, source: "open-food-facts" };
  }
  if (catalog) {
    return { product: catalog, source: "custom-catalog" };
  }
  if (off) {
    return { product: off, source: "open-food-facts" };
  }
  return undefined;
}

export function decideCatalogSave(
  catalog: Product | undefined,
  off: Product | undefined,
): CatalogSaveDecision {
  if (catalog && catalogNutrimentsHaveValues(catalog.nutriments)) {
    return { action: "exists", product: catalog, source: "custom-catalog" };
  }
  if (catalog) {
    return { action: "update", product: catalog };
  }
  if (off && catalogNutrimentsHaveValues(off.nutriments)) {
    return { action: "exists", product: off, source: "open-food-facts" };
  }
  return { action: "create" };
}

export function mergeProductSearch(local: Product[], remote: ProductSearchResult): CatalogSearchResult {
  const localByBarcode = indexByBarcode(local);
  const remoteByBarcode = indexByBarcode(remote.products);
  const barcodes: string[] = [...localByBarcode.keys()];
  for (const barcode of remoteByBarcode.keys()) {
    if (!localByBarcode.has(barcode)) {
      barcodes.push(barcode);
    }
  }

  const products: CatalogSearchProduct[] = [];
  for (const barcode of barcodes) {
    const preferred = preferProduct(localByBarcode.get(barcode), remoteByBarcode.get(barcode));
    if (!preferred) {
      continue;
    }
    products.push({
      ...preferred.product,
      hasNutrition: catalogNutrimentsHaveValues(preferred.product.nutriments),
      source: preferred.source,
    });
  }

  return {
    count: products.length,
    page: remote.page,
    products,
  };
}

export function mergeCatalogSearchResults(results: readonly CatalogSearchResult[]): CatalogSearchResult {
  const byBarcode = new Map<string, CatalogSearchProduct>();
  for (const result of results) {
    for (const product of result.products) {
      const existing = byBarcode.get(product.barcode);
      if (!existing) {
        byBarcode.set(product.barcode, product);
        continue;
      }
      const catalog =
        existing.source === "custom-catalog" ? existing : product.source === "custom-catalog" ? product : undefined;
      const off =
        existing.source === "open-food-facts" ? existing : product.source === "open-food-facts" ? product : undefined;
      const preferred = preferProduct(catalog, off);
      if (!preferred) {
        continue;
      }
      byBarcode.set(product.barcode, {
        ...preferred.product,
        hasNutrition: catalogNutrimentsHaveValues(preferred.product.nutriments),
        source: preferred.source,
      });
    }
  }
  const products = [...byBarcode.values()];
  return {
    count: products.length,
    page: results[0]?.page ?? 1,
    products,
  };
}

export function pickNutriments(value: ProductNutriments | Record<string, unknown>): ProductNutriments {
  const nutriments: ProductNutriments = {};
  for (const key of NUTRIMENT_KEYS) {
    const raw = value[key];
    if (typeof raw === "number" && Number.isFinite(raw)) {
      nutriments[key] = raw;
    }
  }
  return nutriments;
}

function indexByBarcode(products: Product[]) {
  const byBarcode = new Map<string, Product>();
  for (const product of products) {
    if (product.barcode.length > 0 && !byBarcode.has(product.barcode)) {
      byBarcode.set(product.barcode, product);
    }
  }
  return byBarcode;
}
