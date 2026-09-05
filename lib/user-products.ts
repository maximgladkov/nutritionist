import type { AmountUnit } from "./nutrition.ts";

export const PRODUCT_MEAL_LABELS = ["breakfast", "lunch", "dinner", "snack"] as const;
export type ProductMealLabel = (typeof PRODUCT_MEAL_LABELS)[number];
export const PRODUCT_SEGMENTS = ["recent", "favorites", "all"] as const;
export type ProductSegment = (typeof PRODUCT_SEGMENTS)[number];

export type LoggedProductRow = {
  amount: number;
  barcode: string | null;
  createdAt: Date;
  energyKcal: number | null;
  imageUrl: string | null;
  name: string;
  unit: AmountUnit;
};

export type FavoriteRow = {
  barcode: string | null;
  createdAt: Date;
  key: string;
  name: string;
};

export type UserProductView = {
  amount: number;
  barcode: string | null;
  energyKcal: number | null;
  favorite: boolean;
  imageUrl: string | null;
  key: string;
  lastUsedAt: string;
  name: string;
  unit: AmountUnit;
};

const FAVORITE_FALLBACK_AMOUNT = 100;

export function productKey(barcode: string | null | undefined, name: string): string {
  const code = barcode?.trim();
  if (code) {
    return `b:${code}`;
  }
  return `n:${name.trim().toLowerCase()}`;
}

export function groupLoggedProducts(rows: readonly LoggedProductRow[]): UserProductView[] {
  const byKey = new Map<string, UserProductView>();
  for (const row of rows) {
    const key = productKey(row.barcode, row.name);
    if (byKey.has(key)) {
      continue;
    }
    byKey.set(key, {
      amount: row.amount,
      barcode: row.barcode,
      energyKcal: row.energyKcal,
      favorite: false,
      imageUrl: row.imageUrl,
      key,
      lastUsedAt: row.createdAt.toISOString(),
      name: row.name,
      unit: row.unit,
    });
  }
  return [...byKey.values()];
}

export function sortUserProducts(
  products: readonly UserProductView[],
  segment: ProductSegment,
): UserProductView[] {
  const copy = [...products];
  if (segment === "all") {
    copy.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    return copy;
  }
  copy.sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt) || a.name.localeCompare(b.name));
  return copy;
}

export function applyFavorites(
  products: readonly UserProductView[],
  favorites: readonly FavoriteRow[],
  segment: ProductSegment,
): UserProductView[] {
  const favByKey = new Map(favorites.map((row) => [row.key, row]));
  const merged = products.map((product) => ({
    ...product,
    favorite: favByKey.has(product.key),
  }));
  if (segment !== "favorites") {
    return sortUserProducts(merged, segment);
  }
  const byKey = new Map(merged.map((product) => [product.key, product]));
  const favoriteProducts: UserProductView[] = [];
  for (const favorite of favorites) {
    const existing = byKey.get(favorite.key);
    if (existing) {
      favoriteProducts.push({ ...existing, favorite: true });
      continue;
    }
    favoriteProducts.push({
      amount: FAVORITE_FALLBACK_AMOUNT,
      barcode: favorite.barcode,
      energyKcal: null,
      favorite: true,
      imageUrl: null,
      key: favorite.key,
      lastUsedAt: favorite.createdAt.toISOString(),
      name: favorite.name,
      unit: "g",
    });
  }
  return sortUserProducts(favoriteProducts, "recent");
}

