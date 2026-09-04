import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyFavorites,
  groupLoggedProducts,
  productKey,
  sortUserProducts,
  type FavoriteRow,
  type LoggedProductRow,
} from "./user-products.ts";

function row(input: {
  amount: number;
  barcode?: string | null;
  createdAt: string;
  energyKcal?: number | null;
  name: string;
  unit?: LoggedProductRow["unit"];
}): LoggedProductRow {
  return {
    amount: input.amount,
    barcode: input.barcode ?? null,
    createdAt: new Date(input.createdAt),
    energyKcal: input.energyKcal ?? 120,
    name: input.name,
    unit: input.unit ?? "g",
  };
}

describe("productKey", () => {
  it("prefers barcode over name", () => {
    assert.equal(productKey(" 3017620422003 ", "Nutella"), "b:3017620422003");
  });

  it("normalizes unpackaged names", () => {
    assert.equal(productKey(null, "  Greek Yogurt "), "n:greek yogurt");
    assert.equal(productKey("", "Oats"), "n:oats");
  });
});

describe("groupLoggedProducts", () => {
  it("keeps the latest log per barcode and per name", () => {
    const grouped = groupLoggedProducts([
      row({
        amount: 30,
        barcode: "123",
        createdAt: "2026-09-04T12:00:00.000Z",
        energyKcal: 80,
        name: "Yogurt A",
      }),
      row({
        amount: 150,
        barcode: "123",
        createdAt: "2026-09-03T12:00:00.000Z",
        energyKcal: 400,
        name: "Yogurt B",
      }),
      row({
        amount: 200,
        createdAt: "2026-09-04T08:00:00.000Z",
        energyKcal: 90,
        name: "Apple",
      }),
      row({
        amount: 100,
        createdAt: "2026-09-01T08:00:00.000Z",
        name: "apple",
      }),
    ]);
    assert.deepEqual(
      grouped.map((product) => ({
        amount: product.amount,
        energyKcal: product.energyKcal,
        key: product.key,
        name: product.name,
      })),
      [
        { amount: 30, energyKcal: 80, key: "b:123", name: "Yogurt A" },
        { amount: 200, energyKcal: 90, key: "n:apple", name: "Apple" },
      ],
    );
  });
});

describe("sortUserProducts", () => {
  it("sorts recent by last used and all by name", () => {
    const products = groupLoggedProducts([
      row({ amount: 50, createdAt: "2026-09-04T10:00:00.000Z", name: "Oats" }),
      row({ amount: 80, createdAt: "2026-09-02T10:00:00.000Z", name: "Banana" }),
    ]);
    assert.deepEqual(
      sortUserProducts(products, "recent").map((product) => product.name),
      ["Oats", "Banana"],
    );
    assert.deepEqual(
      sortUserProducts(products, "all").map((product) => product.name),
      ["Banana", "Oats"],
    );
  });
});

describe("applyFavorites", () => {
  it("marks favorites and keeps starred foods after they leave history", () => {
    const products = groupLoggedProducts([
      row({ amount: 40, barcode: "999", createdAt: "2026-09-04T09:00:00.000Z", name: "Kefir" }),
    ]);
    const favorites: FavoriteRow[] = [
      {
        barcode: "999",
        createdAt: new Date("2026-09-01T00:00:00.000Z"),
        key: "b:999",
        name: "Kefir",
      },
      {
        barcode: null,
        createdAt: new Date("2026-09-03T00:00:00.000Z"),
        key: "n:rice",
        name: "Rice",
      },
    ];
    const recent = applyFavorites(products, favorites, "recent");
    assert.equal(recent[0]?.favorite, true);
    const starred = applyFavorites(products, favorites, "favorites");
    assert.deepEqual(
      starred.map((product) => ({ amount: product.amount, favorite: product.favorite, name: product.name })),
      [
        { amount: 40, favorite: true, name: "Kefir" },
        { amount: 100, favorite: true, name: "Rice" },
      ],
    );
  });
});
