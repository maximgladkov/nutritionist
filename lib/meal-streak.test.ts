import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  consecutiveRecordedDays,
  mealStreakFromBuckets,
  resolveMealStreak,
} from "./meal-streak.ts";

const TODAY = "2026-09-04";

describe("consecutiveRecordedDays", () => {
  it("returns 0 when nothing is logged", () => {
    assert.equal(consecutiveRecordedDays(new Set(), TODAY), 0);
  });

  it("counts today when a meal is logged", () => {
    assert.equal(consecutiveRecordedDays(new Set([TODAY]), TODAY), 1);
  });

  it("keeps yesterday's streak when today is still empty", () => {
    assert.equal(consecutiveRecordedDays(new Set(["2026-09-03", "2026-09-02"]), TODAY), 2);
  });

  it("stops at the first gap", () => {
    assert.equal(consecutiveRecordedDays(new Set([TODAY, "2026-09-02"]), TODAY), 1);
  });

  it("returns 0 when the last log is older than yesterday", () => {
    assert.equal(consecutiveRecordedDays(new Set(["2026-09-02"]), TODAY), 0);
  });
});

describe("mealStreakFromBuckets", () => {
  it("is complete when a loaded empty day ends the run", () => {
    assert.deepEqual(
      mealStreakFromBuckets(
        {
          "2026-09-04": { mealCount: 1 },
          "2026-09-03": { mealCount: 1 },
          "2026-09-02": { mealCount: 0 },
        },
        TODAY,
      ),
      { complete: true, days: 2 },
    );
  });

  it("is incomplete when the run reaches unloaded days", () => {
    assert.deepEqual(
      mealStreakFromBuckets(
        {
          "2026-09-04": { mealCount: 1 },
          "2026-09-03": { mealCount: 1 },
        },
        TODAY,
      ),
      { complete: false, days: 2 },
    );
  });
});

describe("resolveMealStreak", () => {
  it("prefers the local run when a gap is loaded", () => {
    assert.equal(
      resolveMealStreak({
        buckets: {
          "2026-09-04": { mealCount: 1 },
          "2026-09-03": { mealCount: 0 },
        },
        serverStreak: 9,
        today: TODAY,
      }),
      1,
    );
  });

  it("uses the server streak when older days are not loaded", () => {
    assert.equal(
      resolveMealStreak({
        buckets: {
          "2026-09-04": { mealCount: 1 },
          "2026-09-03": { mealCount: 1 },
        },
        serverStreak: 12,
        serverTodayMealCount: 1,
        today: TODAY,
      }),
      12,
    );
  });

  it("adds today when the server streak was counted before today's first meal", () => {
    assert.equal(
      resolveMealStreak({
        buckets: {
          "2026-09-04": { mealCount: 1 },
          "2026-09-03": { mealCount: 1 },
        },
        serverStreak: 11,
        serverTodayMealCount: 0,
        today: TODAY,
      }),
      12,
    );
  });
});
