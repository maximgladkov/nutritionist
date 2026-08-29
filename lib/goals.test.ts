import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CALORIE_GOAL_KIND,
  GoalError,
  planGoalMerge,
  resolveCalorieGoalWrite,
  toGoalsView,
} from "./goal-values.ts";

describe("resolveCalorieGoalWrite", () => {
  it("clears on null, undefined, or empty string", () => {
    assert.deepEqual(resolveCalorieGoalWrite(null), { op: "clear" });
    assert.deepEqual(resolveCalorieGoalWrite(undefined), { op: "clear" });
    assert.deepEqual(resolveCalorieGoalWrite(""), { op: "clear" });
  });

  it("sets a whole number in range", () => {
    assert.deepEqual(resolveCalorieGoalWrite(2000), { op: "set", value: 2000 });
    assert.deepEqual(resolveCalorieGoalWrite("1800"), { op: "set", value: 1800 });
    assert.deepEqual(resolveCalorieGoalWrite(500), { op: "set", value: 500 });
    assert.deepEqual(resolveCalorieGoalWrite(10000), { op: "set", value: 10000 });
  });

  it("rejects non-integers and out-of-range values", () => {
    assert.throws(() => resolveCalorieGoalWrite(2000.5), GoalError);
    assert.throws(() => resolveCalorieGoalWrite(499), GoalError);
    assert.throws(() => resolveCalorieGoalWrite(10001), GoalError);
    assert.throws(() => resolveCalorieGoalWrite("kcal"), GoalError);
  });
});

describe("toGoalsView", () => {
  it("maps calories_per_day or returns null", () => {
    assert.deepEqual(toGoalsView([]), { caloriesPerDay: null });
    assert.deepEqual(toGoalsView([{ kind: CALORIE_GOAL_KIND, value: 2100 }]), {
      caloriesPerDay: 2100,
    });
  });
});

describe("planGoalMerge", () => {
  it("keeps the survivor goal and takes the absorbed goal when missing", () => {
    assert.deepEqual(
      planGoalMerge(new Set([CALORIE_GOAL_KIND]), [{ id: "a", kind: CALORIE_GOAL_KIND }]),
      { deleteIds: ["a"], moveIds: [] },
    );
    assert.deepEqual(planGoalMerge(new Set(), [{ id: "a", kind: CALORIE_GOAL_KIND }]), {
      deleteIds: [],
      moveIds: ["a"],
    });
  });
});
