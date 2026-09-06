import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inferMealLabel, mealLabelFromHour } from "./meal-label.ts";

describe("mealLabelFromHour", () => {
  it("maps local clock hours to breakfast, lunch, dinner, or snack", () => {
    assert.equal(mealLabelFromHour(4), "snack");
    assert.equal(mealLabelFromHour(5), "breakfast");
    assert.equal(mealLabelFromHour(10), "breakfast");
    assert.equal(mealLabelFromHour(11), "lunch");
    assert.equal(mealLabelFromHour(15), "lunch");
    assert.equal(mealLabelFromHour(16), "dinner");
    assert.equal(mealLabelFromHour(20), "dinner");
    assert.equal(mealLabelFromHour(21), "snack");
    assert.equal(mealLabelFromHour(0), "snack");
  });
});

describe("inferMealLabel", () => {
  it("uses the caller's local hour, not UTC", () => {
    assert.equal(inferMealLabel(new Date("2026-09-06T07:00:00.000Z"), "Europe/Berlin"), "breakfast");
    assert.equal(inferMealLabel(new Date("2026-09-06T09:30:00.000Z"), "Europe/Berlin"), "lunch");
    assert.equal(inferMealLabel(new Date("2026-09-06T14:00:00.000Z"), "Europe/Berlin"), "dinner");
    assert.equal(inferMealLabel(new Date("2026-09-06T19:30:00.000Z"), "Europe/Berlin"), "snack");
  });
});
