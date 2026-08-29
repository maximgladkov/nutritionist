import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CALORIE_GOAL_KIND,
  GOAL_KINDS,
  GoalError,
  emptyGoalsView,
  goalRingsForToday,
  hasAnyGoal,
  planGoalMerge,
  resolveCalorieGoalWrite,
  resolveGoalWrite,
  resolveGoalsPatch,
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

describe("resolveGoalWrite", () => {
  it("sets gram goals in range and clears empty values", () => {
    assert.deepEqual(resolveGoalWrite("proteinGPerDay", 140), { op: "set", value: 140 });
    assert.deepEqual(resolveGoalWrite("carbsGPerDay", "200"), { op: "set", value: 200 });
    assert.deepEqual(resolveGoalWrite("fatGPerDay", 70), { op: "set", value: 70 });
    assert.deepEqual(resolveGoalWrite("fiberGPerDay", 30), { op: "set", value: 30 });
    assert.deepEqual(resolveGoalWrite("proteinGPerDay", null), { op: "clear" });
  });

  it("rejects gram goals outside their ranges", () => {
    assert.throws(() => resolveGoalWrite("proteinGPerDay", 0), GoalError);
    assert.throws(() => resolveGoalWrite("proteinGPerDay", 401), GoalError);
    assert.throws(() => resolveGoalWrite("carbsGPerDay", 801), GoalError);
    assert.throws(() => resolveGoalWrite("fatGPerDay", 301), GoalError);
    assert.throws(() => resolveGoalWrite("fiberGPerDay", 151), GoalError);
    assert.throws(() => resolveGoalWrite("fiberGPerDay", 12.5), GoalError);
  });
});

describe("resolveGoalsPatch", () => {
  it("resolves only provided fields", () => {
    assert.deepEqual(resolveGoalsPatch({ proteinGPerDay: 120, fatGPerDay: null }), [
      { field: "proteinGPerDay", write: { op: "set", value: 120 } },
      { field: "fatGPerDay", write: { op: "clear" } },
    ]);
  });

  it("skips undefined fields so a partial chat update does not clear the rest", () => {
    assert.deepEqual(resolveGoalsPatch({ caloriesPerDay: 2000, proteinGPerDay: undefined }), [
      { field: "caloriesPerDay", write: { op: "set", value: 2000 } },
    ]);
  });
});

describe("toGoalsView", () => {
  it("maps calories_per_day or returns null", () => {
    assert.deepEqual(toGoalsView([]), emptyGoalsView());
    assert.deepEqual(toGoalsView([{ kind: CALORIE_GOAL_KIND, value: 2100 }]), {
      ...emptyGoalsView(),
      caloriesPerDay: 2100,
    });
  });

  it("maps macro goals", () => {
    assert.deepEqual(
      toGoalsView([
        { kind: GOAL_KINDS.proteinGPerDay, value: 140 },
        { kind: GOAL_KINDS.carbsGPerDay, value: 200 },
        { kind: GOAL_KINDS.fatGPerDay, value: 70 },
        { kind: GOAL_KINDS.fiberGPerDay, value: 30 },
      ]),
      {
        caloriesPerDay: null,
        carbsGPerDay: 200,
        fatGPerDay: 70,
        fiberGPerDay: 30,
        proteinGPerDay: 140,
      },
    );
  });
});

describe("hasAnyGoal", () => {
  it("is false when every goal is unset", () => {
    assert.equal(hasAnyGoal(emptyGoalsView()), false);
  });

  it("is true when any goal is set", () => {
    assert.equal(hasAnyGoal({ ...emptyGoalsView(), fiberGPerDay: 25 }), true);
  });
});

describe("goalRingsForToday", () => {
  it("builds inner-to-outer rings as percent of each goal", () => {
    const rings = goalRingsForToday(
      {
        caloriesPerDay: 2000,
        carbsGPerDay: 200,
        fatGPerDay: 70,
        fiberGPerDay: 30,
        proteinGPerDay: 140,
      },
      {
        carbohydrates: 100,
        energyKcal: 500,
        fat: 70,
        fiber: 45,
        proteins: 70,
      },
    );
    assert.deepEqual(
      rings.map((ring) => ({ id: ring.id, value: ring.value, consumed: ring.consumed })),
      [
        { consumed: 45, id: "fiber", value: 100 },
        { consumed: 70, id: "fat", value: 100 },
        { consumed: 100, id: "carbs", value: 50 },
        { consumed: 70, id: "protein", value: 50 },
        { consumed: 500, id: "calories", value: 25 },
      ],
    );
  });

  it("skips unset goals and treats missing totals as zero", () => {
    const rings = goalRingsForToday(
      { ...emptyGoalsView(), proteinGPerDay: 150 },
      {
        carbohydrates: null,
        energyKcal: null,
        fat: null,
        fiber: null,
        proteins: null,
      },
    );
    assert.equal(rings.length, 1);
    assert.equal(rings[0]?.id, "protein");
    assert.equal(rings[0]?.value, 0);
    assert.equal(rings[0]?.consumed, 0);
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
