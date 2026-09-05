import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MealError, mealQueryRange, todaysMealWrite } from "./meals.ts";
import { localDayRange, localInclusiveDateRange } from "./timezone.ts";

describe("todaysMealWrite", () => {
  it("appends when a meal for that label already exists today", () => {
    assert.deepEqual(todaysMealWrite("meal_1"), { action: "append", mealId: "meal_1" });
  });

  it("creates a new meal when none exists today", () => {
    assert.deepEqual(todaysMealWrite(null), { action: "create" });
    assert.deepEqual(todaysMealWrite(undefined), { action: "create" });
  });
});

describe("mealQueryRange", () => {
  it("uses today's nutrition day when from and to are omitted", () => {
    const now = new Date("2026-09-05T12:00:00.000Z");
    assert.deepEqual(mealQueryRange({ now, timeZone: "UTC" }), localDayRange(now, "UTC"));
  });

  it("treats a single from date as that nutrition day", () => {
    assert.deepEqual(
      mealQueryRange({ from: "2026-08-01", timeZone: "Europe/Berlin" }),
      localInclusiveDateRange("Europe/Berlin", "2026-08-01", "2026-08-01"),
    );
  });

  it("treats a single to date as that nutrition day", () => {
    assert.deepEqual(
      mealQueryRange({ to: "2026-08-03", timeZone: "UTC" }),
      localInclusiveDateRange("UTC", "2026-08-03", "2026-08-03"),
    );
  });

  it("keeps an inclusive multi-day range", () => {
    assert.deepEqual(
      mealQueryRange({ from: "2026-08-01", to: "2026-08-03", timeZone: "Europe/Berlin" }),
      localInclusiveDateRange("Europe/Berlin", "2026-08-01", "2026-08-03"),
    );
  });

  it("swaps reversed dates", () => {
    assert.deepEqual(
      mealQueryRange({ from: "2026-08-03", to: "2026-08-01", timeZone: "Europe/Berlin" }),
      localInclusiveDateRange("Europe/Berlin", "2026-08-01", "2026-08-03"),
    );
  });

  it("rejects invalid dates", () => {
    assert.throws(
      () => mealQueryRange({ from: "2026-02-30", timeZone: "UTC" }),
      (error: unknown) => error instanceof MealError,
    );
    assert.throws(
      () => mealQueryRange({ from: "2026-08-01T12:00:00Z", to: "2026-08-02", timeZone: "UTC" }),
      (error: unknown) => error instanceof MealError,
    );
  });
});
