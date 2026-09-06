import type { Prisma } from "../generated/prisma/client";
import {
  catalogNutrimentsHaveValues,
  decideCatalogSave,
  mergeProductSearch,
  pickNutriments,
  preferProduct,
  type CatalogSearchResult,
  type ProductSource,
} from "./catalog-product-query.ts";
import { searchCatalogProductsFuzzy } from "./off-product-store.ts";
import {
  attachCatalogProductPhotos,
  loadCatalogImagesByBarcodes,
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

export type ResolvedProductLookup =
  | { found: true; hasNutrition: boolean; product: Product; source: ProductSource }
  | { found: false; barcode: string };

export type SaveCatalogProductInput = {
  barcode: string;
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
  | { hasNutrition: boolean; product: Product; source: ProductSource; status: "created" | "updated" | "exists" }
  | { error: string; status: "invalid" };

export {
  catalogNutrimentsHaveValues,
  mergeProductSearch,
  preferProduct,
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
    findCatalogProduct(normalizedBarcode),
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
  return mergeProductSearch(local, remote);
}

export async function saveCatalogProduct(input: SaveCatalogProductInput): Promise<SaveCatalogProductResult> {
  const barcode = normalizeBarcode(input.barcode);
  if (!isValidBarcode(barcode)) {
    return { error: "Invalid barcode.", status: "invalid" };
  }
  const name = input.name.trim();
  if (name.length === 0) {
    return { error: "Name is required.", status: "invalid" };
  }
  const nutriments = pickNutriments(input.nutriments);
  if (!catalogNutrimentsHaveValues(nutriments)) {
    return { error: "Nutrition per 100g or 100ml is required.", status: "invalid" };
  }

  const [off, existing] = await Promise.all([
    getProductByBarcode(barcode),
    findCatalogProduct(barcode),
  ]);
  const decision = decideCatalogSave(existing, off.found ? off.product : undefined);
  if (decision.action === "exists") {
    if (decision.source === "custom-catalog") {
      const images = await attachCatalogProductPhotos({
        barcode,
        photos: input.photos,
        sessionId: input.sessionId,
        turnId: input.turnId,
      });
      return savedResult(withCatalogImages(decision.product, images), decision.source, "exists");
    }
    return savedResult(decision.product, decision.source, "exists");
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

  if (decision.action === "update") {
    const updated = await prisma.catalogProduct.update({
      where: { barcode },
      data: {
        brands: data.brands,
        name: data.name,
        nutriments: data.nutriments,
        quantity: data.quantity,
        servingSize: data.servingSize,
      },
    });
    const images = await attachCatalogProductPhotos({
      barcode,
      photos: input.photos,
      sessionId: input.sessionId,
      turnId: input.turnId,
    });
    return savedResult(withCatalogImages(catalogRowToProduct(updated), images), "custom-catalog", "updated");
  }

  try {
    const created = await prisma.catalogProduct.create({ data });
    const images = await attachCatalogProductPhotos({
      barcode,
      photos: input.photos,
      sessionId: input.sessionId,
      turnId: input.turnId,
    });
    return savedResult(withCatalogImages(catalogRowToProduct(created), images), "custom-catalog", "created");
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const raced = await findCatalogProduct(barcode);
      if (raced) {
        const images = await attachCatalogProductPhotos({
          barcode,
          photos: input.photos,
          sessionId: input.sessionId,
          turnId: input.turnId,
        });
        return savedResult(withCatalogImages(raced, images), "custom-catalog", "exists");
      }
    }
    throw error;
  }
}

function savedResult(
  product: Product,
  source: ProductSource,
  status: "created" | "updated" | "exists",
): SaveCatalogProductResult {
  return {
    hasNutrition: catalogNutrimentsHaveValues(product.nutriments),
    product,
    source,
    status,
  };
}

async function findCatalogProduct(barcode: string): Promise<Product | undefined> {
  const row = await prisma.catalogProduct.findUnique({ where: { barcode } });
  if (!row) {
    return undefined;
  }
  const images = await loadCatalogImagesByBarcodes([barcode]);
  return withCatalogImages(catalogRowToProduct(row), images.get(barcode) ?? []);
}

async function searchCatalogProducts(query: string): Promise<Product[]> {
  const products = await searchCatalogProductsFuzzy(query, 10);
  const images = await loadCatalogImagesByBarcodes(products.map((product) => product.barcode));
  return products.map((product) => withCatalogImages(product, images.get(product.barcode) ?? []));
}

function catalogRowToProduct(row: {
  barcode: string;
  brands: string | null;
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
