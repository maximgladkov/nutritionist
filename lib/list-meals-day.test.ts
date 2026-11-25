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

describe("a late-night snack", () => {
  it("is the day before's, with the time it was eaten there", () => {
    const meal = { eatenAt: "2026-11-25T00:40:00.000Z", id: "m", incomplete: [], items: [], label: "snack", totals: {} } as never;
    const payload = toListMealsDayPayload({
      from: "2026-11-24T03:00:00.000Z",
      meals: [meal],
      now: new Date("2026-11-25T14:00:00Z"),
      timeZone: "Europe/Madrid",
      to: "2026-11-26T03:00:00.000Z",
    });
    const [yesterday, today] = payload.days;
    assert.equal(yesterday!.day, "yesterday");
    assert.equal(yesterday!.date, "2026-11-24");
    assert.equal(yesterday!.meals[0]!.eatenAtLocal, "01:40, late that night");
    assert.equal(today!.day, "today");
    assert.deepEqual(today!.meals, []);
    // The moment itself would read as the next day.
    assert.ok(!JSON.stringify(payload.days).includes("T00:40"));
  });
});
