import type { Prisma } from "../generated/prisma/client";
import {
  catalogNutrimentsHaveValues,
  decideCatalogSave,
  mergeCatalogSearchResults,
  mergeProductSearch,
  pickNutriments,
  preferProduct,
  resolveCatalogBarcode,
  type CatalogSearchResult,
  type ProductSource,
} from "./catalog-product-query.ts";
import { rankSearchProducts } from "./product-search.ts";
import { searchCatalogProductsFuzzy } from "./off-product-store.ts";
import {
  attachCatalogProductPhotos,
  loadCatalogImagesByProductIds,
  withCatalogImages,
  type CatalogPhotoInput,
} from "./catalog-product-images.ts";
import {
  getProductByBarcode,
  InvalidBarcodeError,
  isValidBarcode,
  normalizeBarcode,
  searchProductsByName,
  type Product,
  type ProductNutriments,
} from "./open-food-facts.ts";
import { prisma } from "./prisma.ts";

const BARCODE_IGNORED_WARNING =
  "Barcode was omitted because it was not a valid GTIN. Do not invent a barcode. If none is clearly readable, save and log by name.";

export type ResolvedProductLookup =
  | { found: true; hasNutrition: boolean; product: Product; source: ProductSource }
  | { found: false; barcode: string };

export type SaveCatalogProductInput = {
  barcode?: string;
  brands?: string;
  createdByUserId: string;
  name: string;
  nutriments: ProductNutriments;
  photos?: readonly CatalogPhotoInput[];
  quantity?: string;
  servingSize?: string;
  sessionId?: string;
  turnId?: string;
};

export type SaveCatalogProductResult =
  | {
      barcodeIgnored?: boolean;
      hasNutrition: boolean;
      product: Product;
      source: ProductSource;
      status: "created" | "updated" | "exists";
      warning?: string;
    }
  | { error: string; status: "invalid" };

export {
  catalogNutrimentsHaveValues,
  mergeCatalogSearchResults,
  mergeProductSearch,
  preferProduct,
  resolveCatalogBarcode,
  type CatalogSearchResult,
  type ProductSource,
} from "./catalog-product-query.ts";

export async function resolveProductByBarcode(
  barcode: string,
  options: { country?: string; signal?: AbortSignal } = {},
): Promise<ResolvedProductLookup> {
  const normalizedBarcode = normalizeBarcode(barcode);
  if (!isValidBarcode(normalizedBarcode)) {
    throw new InvalidBarcodeError(barcode);
  }

  const [off, local] = await Promise.all([
    getProductByBarcode(normalizedBarcode, options),
    findCatalogProductByBarcode(normalizedBarcode),
  ]);
  const preferred = preferProduct(local, off.found ? off.product : undefined);
  if (!preferred) {
    return { found: false, barcode: normalizedBarcode };
  }
  return {
    found: true,
    hasNutrition: catalogNutrimentsHaveValues(preferred.product.nutriments),
    product: preferred.product,
    source: preferred.source,
  };
}

export async function searchCatalogAndOpenFoodFacts(
  query: string,
  options: { country?: string; pageSize?: number; signal?: AbortSignal } = {},
): Promise<CatalogSearchResult> {
  const [remote, local] = await Promise.all([
    searchProductsByName(query, options),
    searchCatalogProducts(query),
  ]);
  const merged = mergeProductSearch(local, remote);
  return {
    ...merged,
    products: rankSearchProducts(merged.products, [query]),
  };
}

export async function searchCatalogAndOpenFoodFactsMany(
  queries: readonly string[],
  options: { country?: string; pageSize?: number; signal?: AbortSignal } = {},
): Promise<CatalogSearchResult> {
  const unique = [...new Set(queries.map((query) => query.trim()).filter((query) => query.length > 0))].slice(0, 6);
  if (unique.length === 0) {
    return { count: 0, page: 1, products: [] };
  }
  const results = await Promise.all(unique.map((query) => searchCatalogAndOpenFoodFacts(query, options)));
  const merged = mergeCatalogSearchResults(results);
  return {
    ...merged,
    products: rankSearchProducts(merged.products, unique),
  };
}

export async function saveCatalogProduct(input: SaveCatalogProductInput): Promise<SaveCatalogProductResult> {
  const resolvedBarcode = resolveCatalogBarcode(input.barcode);
  const name = input.name.trim();
  if (name.length === 0) {
    return { error: "Name is required.", status: "invalid" };
  }
  const nutriments = pickNutriments(input.nutriments);
  if (!catalogNutrimentsHaveValues(nutriments)) {
    return { error: "Nutrition per 100g or 100ml is required.", status: "invalid" };
  }

  const barcode = resolvedBarcode.barcode;
  const [off, existing] = await Promise.all([
    barcode ? getProductByBarcode(barcode) : Promise.resolve(undefined),
    findCatalogProductForSave(barcode, name),
  ]);
  const decision = decideCatalogSave(existing, off?.found ? off.product : undefined);
  if (decision.action === "exists") {
    if (decision.source === "custom-catalog" && decision.product.id) {
      const images = await attachCatalogProductPhotos({
        photos: input.photos,
        productId: decision.product.id,
        sessionId: input.sessionId,
        turnId: input.turnId,
      });
      return savedResult(withCatalogImages(decision.product, images), decision.source, "exists", resolvedBarcode.ignored);
    }
    return savedResult(decision.product, decision.source, "exists", resolvedBarcode.ignored);
  }

  const data = {
    barcode,
    brands: emptyToNull(input.brands),
    createdByUserId: input.createdByUserId,
    name,
    nutriments: nutriments as Prisma.InputJsonValue,
    quantity: emptyToNull(input.quantity),
    servingSize: emptyToNull(input.servingSize),
  };

  if (decision.action === "update" && existing?.id) {
    const updated = await prisma.catalogProduct.update({
      where: { id: existing.id },
      data: {
        barcode: data.barcode,
        brands: data.brands,
        name: data.name,
        nutriments: data.nutriments,
        quantity: data.quantity,
        servingSize: data.servingSize,
      },
    });
    const images = await attachCatalogProductPhotos({
      photos: input.photos,
      productId: updated.id,
      sessionId: input.sessionId,
      turnId: input.turnId,
    });
    return savedResult(withCatalogImages(catalogRowToProduct(updated), images), "custom-catalog", "updated", resolvedBarcode.ignored);
  }

  try {
    const created = await prisma.catalogProduct.create({ data });
    const images = await attachCatalogProductPhotos({
      photos: input.photos,
      productId: created.id,
      sessionId: input.sessionId,
      turnId: input.turnId,
    });
    return savedResult(withCatalogImages(catalogRowToProduct(created), images), "custom-catalog", "created", resolvedBarcode.ignored);
  } catch (error) {
    if (isUniqueConstraintError(error) && barcode) {
      const raced = await findCatalogProductByBarcode(barcode);
      if (raced?.id) {
        const images = await attachCatalogProductPhotos({
          photos: input.photos,
          productId: raced.id,
          sessionId: input.sessionId,
          turnId: input.turnId,
        });
        return savedResult(withCatalogImages(raced, images), "custom-catalog", "exists", resolvedBarcode.ignored);
      }
    }
    throw error;
  }
}

function savedResult(
  product: Product,
  source: ProductSource,
  status: "created" | "updated" | "exists",
  barcodeIgnored: boolean,
): SaveCatalogProductResult {
  return {
    ...(barcodeIgnored ? { barcodeIgnored: true, warning: BARCODE_IGNORED_WARNING } : {}),
    hasNutrition: catalogNutrimentsHaveValues(product.nutriments),
    product,
    source,
    status,
  };
}

async function findCatalogProductForSave(barcode: string | null, name: string): Promise<Product | undefined> {
  if (barcode) {
    const byBarcode = await findCatalogProductByBarcode(barcode);
    if (byBarcode) {
      return byBarcode;
    }
  }
  return findCatalogProductByName(name);
}

async function findCatalogProductByBarcode(barcode: string): Promise<Product | undefined> {
  const row = await prisma.catalogProduct.findUnique({ where: { barcode } });
  if (!row) {
    return undefined;
  }
  return productWithImages(catalogRowToProduct(row));
}

async function findCatalogProductByName(name: string): Promise<Product | undefined> {
  const row = await prisma.catalogProduct.findFirst({
    orderBy: { updatedAt: "desc" },
    where: { barcode: null, name: { equals: name, mode: "insensitive" } },
  });
  if (!row) {
    return undefined;
  }
  return productWithImages(catalogRowToProduct(row));
}

async function searchCatalogProducts(query: string): Promise<Product[]> {
  const products = await searchCatalogProductsFuzzy(query, 10);
  const ids = products.flatMap((product) => (product.id ? [product.id] : []));
  const images = await loadCatalogImagesByProductIds(ids);
  return products.map((product) => withCatalogImages(product, product.id ? images.get(product.id) ?? [] : []));
}

async function productWithImages(product: Product): Promise<Product> {
  if (product.id) {
    const images = await loadCatalogImagesByProductIds([product.id]);
    return withCatalogImages(product, images.get(product.id) ?? []);
  }
  return product;
}

function catalogRowToProduct(row: {
  barcode: string | null;
  brands: string | null;
  id: string;
  name: string;
  nutriments: Prisma.JsonValue;
  quantity: string | null;
  servingSize: string | null;
}): Product {
  return {
    allergens: null,
    barcode: row.barcode,
    brands: row.brands,
    countries: [],
    id: row.id,
    imageUrl: null,
    ingredients: null,
    name: row.name,
    novaGroup: null,
    nutriments: pickNutriments(asRecord(row.nutriments)),
    nutriscoreGrade: null,
    quantity: row.quantity,
    servingSize: row.servingSize,
  };
}

function asRecord(value: Prisma.JsonValue): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function emptyToNull(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function isUniqueConstraintError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
