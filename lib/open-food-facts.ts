import {
  InvalidBarcodeError,
  isValidBarcode,
  normalizeBarcode,
  type Product,
} from "./open-food-facts-map.ts";

export {
  InvalidBarcodeError,
  isValidBarcode,
  mapNutriments,
  mapProduct,
  mapProductFields,
  normalizeBarcode,
  type OffApiProduct,
  type Product,
  type ProductNutriments,
} from "./open-food-facts-map.ts";

const MAX_SEARCH_PAGE_SIZE = 10;

export type ProductLookupResult =
  | { found: true; product: Product }
  | { found: false; barcode: string };

export type ProductSearchResult = {
  count: number;
  page: number;
  products: Product[];
};

type LookupOptions = {
  country?: string;
  signal?: AbortSignal;
};

type SearchOptions = LookupOptions & {
  pageSize?: number;
};

export const offCatalog = {
  findByBarcode: findLocalProductByBarcode,
  searchByName: searchLocalProductsByName,
};

export async function getProductByBarcode(
  barcode: string,
  options: LookupOptions = {},
): Promise<ProductLookupResult> {
  const normalizedBarcode = normalizeBarcode(barcode);
  if (!isValidBarcode(normalizedBarcode)) {
    throw new InvalidBarcodeError(barcode);
  }

  const local = await offCatalog.findByBarcode(normalizedBarcode, options.country);
  if (local) {
    return { found: true, product: local };
  }
  return { found: false, barcode: normalizedBarcode };
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
  const products = await offCatalog.searchByName(searchTerms, {
    country: options.country,
    pageSize,
  });
  return {
    count: products.length,
    page: 1,
    products,
  };
}

async function findLocalProductByBarcode(
  barcode: string,
  country?: string,
): Promise<Product | null> {
  const { findOffProductByBarcode } = await import("./off-product-store.ts");
  return findOffProductByBarcode(barcode, country);
}

async function searchLocalProductsByName(
  query: string,
  options: { country?: string; pageSize: number },
): Promise<Product[]> {
  const { searchOffProductsByName } = await import("./off-product-store.ts");
  return searchOffProductsByName(query, options);
}
