import type { Prisma } from "../generated/prisma/client";
import {
  catalogNutrimentsHaveValues,
  mergeProductSearch,
  pickNutriments,
} from "./catalog-product-query.ts";
import {
  getProductByBarcode,
  InvalidBarcodeError,
  isValidBarcode,
  normalizeBarcode,
  searchProductsByName,
  type Product,
  type ProductNutriments,
  type ProductSearchResult,
} from "./open-food-facts.ts";
import { prisma } from "./prisma.ts";

export type ResolvedProductLookup =
  | { found: true; product: Product; source: "catalog" | "open-food-facts" }
  | { found: false; barcode: string };

export type SaveCatalogProductInput = {
  barcode: string;
  brands?: string;
  createdByUserId: string;
  name: string;
  nutriments: ProductNutriments;
  quantity?: string;
  servingSize?: string;
};

export type SaveCatalogProductResult =
  | { product: Product; source: "catalog"; status: "created" | "exists" }
  | { product: Product; source: "open-food-facts"; status: "exists" }
  | { error: string; status: "invalid" };

export {
  catalogNutrimentsHaveValues,
  mergeProductSearch,
} from "./catalog-product-query.ts";

export async function resolveProductByBarcode(
  barcode: string,
  options: { country?: string; signal?: AbortSignal } = {},
): Promise<ResolvedProductLookup> {
  const normalizedBarcode = normalizeBarcode(barcode);
  if (!isValidBarcode(normalizedBarcode)) {
    throw new InvalidBarcodeError(barcode);
  }

  let offError: unknown;
  try {
    const off = await getProductByBarcode(normalizedBarcode, options);
    if (off.found) {
      return { found: true, product: off.product, source: "open-food-facts" };
    }
  } catch (error) {
    offError = error;
  }

  const local = await findCatalogProduct(normalizedBarcode);
  if (local) {
    return { found: true, product: local, source: "catalog" };
  }
  if (offError) {
    throw offError;
  }
  return { found: false, barcode: normalizedBarcode };
}

export async function searchCatalogAndOpenFoodFacts(
  query: string,
  options: { country?: string; pageSize?: number; signal?: AbortSignal } = {},
): Promise<ProductSearchResult> {
  let remote: ProductSearchResult = { count: 0, page: 1, products: [] };
  let remoteError: unknown;
  try {
    remote = await searchProductsByName(query, options);
  } catch (error) {
    remoteError = error;
  }
  const local = await searchCatalogProducts(query);
  if (local.length === 0 && remoteError) {
    throw remoteError;
  }
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

  try {
    const off = await getProductByBarcode(barcode);
    if (off.found) {
      return { product: off.product, source: "open-food-facts", status: "exists" };
    }
  } catch {
    return { error: "Could not check Open Food Facts. Try again in a moment.", status: "invalid" };
  }

  const existing = await findCatalogProduct(barcode);
  if (existing) {
    return { product: existing, source: "catalog", status: "exists" };
  }

  try {
    const created = await prisma.catalogProduct.create({
      data: {
        barcode,
        brands: emptyToNull(input.brands),
        createdByUserId: input.createdByUserId,
        name,
        nutriments: nutriments as Prisma.InputJsonValue,
        quantity: emptyToNull(input.quantity),
        servingSize: emptyToNull(input.servingSize),
      },
    });
    return { product: catalogRowToProduct(created), source: "catalog", status: "created" };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const raced = await findCatalogProduct(barcode);
      if (raced) {
        return { product: raced, source: "catalog", status: "exists" };
      }
    }
    throw error;
  }
}

async function findCatalogProduct(barcode: string): Promise<Product | undefined> {
  const row = await prisma.catalogProduct.findUnique({ where: { barcode } });
  return row ? catalogRowToProduct(row) : undefined;
}

async function searchCatalogProducts(query: string): Promise<Product[]> {
  const name = query.trim();
  if (name.length === 0) {
    return [];
  }
  const rows = await prisma.catalogProduct.findMany({
    orderBy: { updatedAt: "desc" },
    take: 10,
    where: { name: { contains: name, mode: "insensitive" } },
  });
  return rows.map(catalogRowToProduct);
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
