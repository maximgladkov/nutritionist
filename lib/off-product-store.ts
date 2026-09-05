import { Prisma } from "../generated/prisma/client.ts";
import { pickNutriments } from "./catalog-product-query.ts";
import {
  pickProductName,
  preferredLanguageForCountry,
} from "./open-food-facts-name.ts";
import type { Product } from "./open-food-facts-map.ts";
import { prisma, usingAccelerate } from "./prisma.ts";
import {
  fuzzyTokenFilters,
  searchTokens,
  setWordSimilarityThresholdSql,
} from "./product-search.ts";

type OffProductRow = {
  allergens: string | null;
  barcode: string;
  brands: string | null;
  countryCodes: string[];
  imageUrl: string | null;
  ingredients: string | null;
  name: string | null;
  names: Prisma.JsonValue;
  novaGroup: number | null;
  nutriments: Prisma.JsonValue;
  nutriscoreGrade: string | null;
  quantity: string | null;
  servingSize: string | null;
};

type CatalogProductRow = {
  barcode: string;
  brands: string | null;
  name: string;
  nutriments: Prisma.JsonValue;
  quantity: string | null;
  servingSize: string | null;
};

export async function findOffProductByBarcode(
  barcode: string,
  country?: string,
): Promise<Product | null> {
  const row = await prisma.offProduct.findUnique({
    where: { barcode },
    ...(usingAccelerate
      ? { cacheStrategy: { swr: 3600, tags: ["off_product"], ttl: 300 } }
      : {}),
  } as Parameters<typeof prisma.offProduct.findUnique>[0]);
  if (!row) {
    return null;
  }
  return offRowToProduct(row, country);
}

export async function searchOffProductsByName(
  query: string,
  options: { country?: string; pageSize: number },
): Promise<Product[]> {
  const tokens = searchTokens(query);
  if (tokens.length === 0) {
    return [];
  }
  const rows = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(setWordSimilarityThresholdSql());
    return tx.$queryRaw<OffProductRow[]>`
      SELECT
        "barcode", "name", "names", "brands", "quantity", "servingSize",
        "nutriscoreGrade", "novaGroup", "ingredients", "allergens",
        "nutriments", "imageUrl", "countryCodes"
      FROM "OffProduct"
      WHERE 1=1
      ${countryFilter(options.country)}
      ${Prisma.join(fuzzyTokenFilters(tokens), " ")}
      ORDER BY word_similarity(immutable_unaccent(lower(${query.trim()})), "searchText") DESC
      LIMIT ${options.pageSize}
    `;
  });
  return rows.map((row) => offRowToProduct(row, options.country));
}

export async function searchCatalogProductsFuzzy(
  query: string,
  pageSize: number,
): Promise<Product[]> {
  const tokens = searchTokens(query);
  if (tokens.length === 0) {
    return [];
  }
  const rows = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(setWordSimilarityThresholdSql());
    return tx.$queryRaw<CatalogProductRow[]>`
      SELECT "barcode", "name", "brands", "quantity", "servingSize", "nutriments"
      FROM "CatalogProduct"
      WHERE 1=1
      ${Prisma.join(fuzzyTokenFilters(tokens), " ")}
      ORDER BY word_similarity(immutable_unaccent(lower(${query.trim()})), "searchText") DESC
      LIMIT ${pageSize}
    `;
  });
  return rows.map(catalogRowToProduct);
}

function countryFilter(country: string | undefined): Prisma.Sql {
  if (!country) {
    return Prisma.empty;
  }
  const iso = country.trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(iso)) {
    return Prisma.empty;
  }
  return Prisma.sql`AND ${iso} = ANY("countryCodes")`;
}

function offRowToProduct(row: OffProductRow, country?: string): Product {
  const names = asRecord(row.names);
  return {
    allergens: row.allergens,
    barcode: row.barcode,
    brands: row.brands,
    countries: row.countryCodes,
    imageUrl: row.imageUrl,
    ingredients: row.ingredients,
    name: pickProductName(
      { product_name: row.name, ...names },
      preferredLanguageForCountry(country),
    ),
    novaGroup: row.novaGroup,
    nutriments: pickNutriments(asRecord(row.nutriments)),
    nutriscoreGrade: row.nutriscoreGrade,
    quantity: row.quantity,
    servingSize: row.servingSize,
  };
}

function catalogRowToProduct(row: CatalogProductRow): Product {
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

function asRecord(value: Prisma.JsonValue | Record<string, unknown>): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}
