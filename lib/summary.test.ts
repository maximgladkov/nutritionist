import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dayIndexWindows, NUTRITION_DAYS_MAX, NUTRITION_DAY_TODAY_INDEX, ymdForDayIndex } from "./summary-days.ts";

describe("ymdForDayIndex", () => {
  it("maps today and past indexes onto calendar dates", () => {
    assert.equal(ymdForDayIndex("2026-09-02", NUTRITION_DAY_TODAY_INDEX), "2026-09-02");
    assert.equal(ymdForDayIndex("2026-09-02", NUTRITION_DAY_TODAY_INDEX - 1), "2026-09-01");
  });
});

describe("dayIndexWindows", () => {
  it("covers the visible range with max-sized chunks from today", () => {
    const windows = dayIndexWindows(
      "2026-09-02",
      NUTRITION_DAY_TODAY_INDEX - 10,
      NUTRITION_DAY_TODAY_INDEX,
    );
    assert.deepEqual(windows, [{ from: "2026-08-13", to: "2026-09-02" }]);
    assert.equal(windows[0] && daysBetween(windows[0].from, windows[0].to) + 1, NUTRITION_DAYS_MAX);
  });

  it("splits when the visible range crosses a chunk boundary", () => {
    const windows = dayIndexWindows(
      "2026-09-02",
      NUTRITION_DAY_TODAY_INDEX - 25,
      NUTRITION_DAY_TODAY_INDEX - 18,
    );
    assert.equal(windows.length, 2);
    assert.deepEqual(windows[0], { from: "2026-08-13", to: "2026-09-02" });
    assert.deepEqual(windows[1], { from: "2026-07-23", to: "2026-08-12" });
  });
});

function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  return Math.round((end - start) / 86_400_000);
}
