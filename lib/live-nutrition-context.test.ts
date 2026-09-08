import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyGoalsView } from "./goal-values.ts";
import { isSingleDayQuery, liveNutritionContextText } from "./live-nutrition-context.ts";
import { emptyNutrients } from "./nutrition.ts";

describe("liveNutritionContextText", () => {
  it("prints live current, goal, and remaining and forbids chat leftovers", () => {
    const text = liveNutritionContextText({
      current: {
        ...emptyNutrients(),
        carbohydrates: 78.04,
        energyKcal: 1508.5,
        fat: 75.75,
        fiber: 7.38,
        proteins: 82.1,
      },
      goals: {
        ...emptyGoalsView(),
        caloriesPerDay: 2244,
        carbsGPerDay: 221,
        fatGPerDay: 80,
        fiberGPerDay: 30,
        proteinGPerDay: 160,
      },
      remaining: {
        carbohydrates: 142.96,
        energyKcal: 735.5,
        fat: 4.25,
        fiber: 22.62,
        proteins: 77.9,
      },
    });
    assert.match(text, /not from chat; the user can change meals and goals in the app/);
    assert.match(text, /calories current 1508\.5 \/ goal 2244 kcal remaining 735\.5/);
    assert.match(text, /protein current 82\.1 \/ goal 160 g remaining 77\.9/);
    assert.match(text, /use goals, current, and remaining from that tool result instead of this snapshot/);
    assert.match(text, /After you log, add, copy, or delete food this turn/);
    assert.match(text, /Never subtract leftover kcal from a previous assistant message/);
  });

  it("marks unset goals instead of inventing a target", () => {
    const text = liveNutritionContextText({
      current: { ...emptyNutrients(), energyKcal: 400 },
      goals: emptyGoalsView(),
      remaining: {
        carbohydrates: null,
        energyKcal: null,
        fat: null,
        fiber: null,
        proteins: null,
      },
    });
    assert.match(text, /calories current 400 kcal, goal unset/);
    assert.doesNotMatch(text, /goal 2244/);
  });
});

describe("isSingleDayQuery", () => {
  it("treats omitted or matching dates as one day", () => {
    assert.equal(isSingleDayQuery(undefined, undefined), true);
    assert.equal(isSingleDayQuery("2026-09-06", undefined), true);
    assert.equal(isSingleDayQuery("2026-09-06", "2026-09-06"), true);
    assert.equal(isSingleDayQuery("2026-09-05", "2026-09-06"), false);
  });
});
