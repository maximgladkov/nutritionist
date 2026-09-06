import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toListMealsDayPayload } from "./list-meals-day.ts";
import type { MealView } from "./meals.ts";
import { emptyNutrients } from "./nutrition.ts";

describe("toListMealsDayPayload", () => {
  it("buckets meals by nutrition date and exposes the current clock slot", () => {
    const payload = toListMealsDayPayload({
      from: "2026-09-06T02:00:00.000Z",
      meals: [
        meal({ eatenAt: "2026-09-06T07:30:00.000Z", id: "m-breakfast", label: "breakfast" }),
        meal({ eatenAt: "2026-09-06T11:00:00.000Z", id: "m-lunch", label: "lunch" }),
      ],
      now: new Date("2026-09-06T11:00:00.000Z"),
      timeZone: "Europe/Berlin",
      to: "2026-09-07T02:00:00.000Z",
    });

    assert.equal(payload.currentLabel, "lunch");
    assert.deepEqual(payload.labelHours.lunch, "11:00–16:00");
    assert.equal(payload.days.length, 1);
    assert.equal(payload.days[0]?.date, "2026-09-06");
    assert.deepEqual(
      payload.days[0]?.meals.map((entry) => entry.id),
      ["m-breakfast", "m-lunch"],
    );
    assert.deepEqual(
      payload.days[0]?.groups.map((group) => ({
        label: group.label,
        mealIds: group.items.map((item) => item.id),
      })),
      [
        { label: "breakfast", mealIds: ["i-m-breakfast"] },
        { label: "lunch", mealIds: ["i-m-lunch"] },
        { label: "dinner", mealIds: [] },
        { label: "snack", mealIds: [] },
      ],
    );
  });
});

function meal(input: {
  eatenAt: string;
  id: string;
  label: MealView["label"];
}): MealView {
  return {
    eatenAt: input.eatenAt,
    id: input.id,
    incomplete: [],
    items: [
      {
        amount: 100,
        barcode: null,
        grams: 100,
        id: `i-${input.id}`,
        imageUrl: null,
        incomplete: [],
        metrics: emptyNutrients(),
        name: input.label,
        unit: "g",
      },
    ],
    label: input.label,
    totals: emptyNutrients(),
  };
}
