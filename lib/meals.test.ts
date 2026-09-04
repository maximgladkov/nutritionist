import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { todaysMealWrite } from "./meals.ts";

describe("todaysMealWrite", () => {
  it("appends when a meal for that label already exists today", () => {
    assert.deepEqual(todaysMealWrite("meal_1"), { action: "append", mealId: "meal_1" });
  });

  it("creates a new meal when none exists today", () => {
    assert.deepEqual(todaysMealWrite(null), { action: "create" });
    assert.deepEqual(todaysMealWrite(undefined), { action: "create" });
  });
});
