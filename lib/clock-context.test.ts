import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clockContextText } from "./clock-context.ts";

describe("clockContextText", () => {
  it("includes weekday, local clock, timezone, and nutrition day", () => {
    const text = clockContextText({
      now: new Date("2026-09-03T20:12:00.000Z"),
      timeZone: "Europe/Berlin",
      timezoneIsFallback: false,
    });
    assert.match(text, /Thursday 2026-09-03 22:12 \(Europe\/Berlin\)/);
    assert.match(text, /Nutrition day: 2026-09-03/);
    assert.match(text, /Current week \(Monday to Sunday\): 2026-08-31 to 2026-09-06/);
    assert.match(text, /Last week: 2026-08-24 to 2026-08-30/);
    assert.match(text, /Current meal slot: snack \(before 05:00 or from 21:00\)/);
    assert.match(text, /Breakfast 05:00–11:00, lunch 11:00–16:00, dinner 16:00–21:00, otherwise snack/);
    assert.match(text, /Catalog country is unknown/);
    assert.doesNotMatch(text, /timezone is unknown/);
  });

  it("uses Monday to Sunday for the current week on a Tuesday", () => {
    const text = clockContextText({
      now: new Date("2026-09-08T10:00:00.000Z"),
      timeZone: "Europe/Berlin",
      timezoneIsFallback: false,
    });
    assert.match(text, /Tuesday 2026-09-08/);
    assert.match(text, /Current week \(Monday to Sunday\): 2026-09-07 to 2026-09-13/);
    assert.match(text, /Last week: 2026-08-31 to 2026-09-06/);
  });

  it("keeps hours before 04:00 on the previous nutrition day", () => {
    const text = clockContextText({
      now: new Date("2026-09-04T00:30:00.000Z"),
      timeZone: "Europe/Berlin",
      timezoneIsFallback: false,
    });
    assert.match(text, /Friday 2026-09-04 02:30 \(Europe\/Berlin\)/);
    assert.match(text, /Nutrition day: 2026-09-03/);
    assert.match(text, /Current week \(Monday to Sunday\): 2026-08-31 to 2026-09-06/);
    assert.match(text, /Current meal slot: snack \(before 05:00 or from 21:00\)/);
  });

  it("marks UTC when timezone is unknown", () => {
    const text = clockContextText({
      now: new Date("2026-09-03T20:12:00.000Z"),
      timeZone: "UTC",
      timezoneIsFallback: true,
    });
    assert.match(text, /Thursday 2026-09-03 20:12 \(UTC; timezone is unknown\)/);
    assert.match(text, /Nutrition day: 2026-09-03/);
    assert.match(text, /Current week \(Monday to Sunday\): 2026-08-31 to 2026-09-06/);
    assert.match(text, /Current meal slot: dinner \(16:00–21:00\)/);
  });

  it("exposes lunch for early afternoon local time", () => {
    const text = clockContextText({
      now: new Date("2026-09-03T11:00:00.000Z"),
      timeZone: "Europe/Berlin",
      timezoneIsFallback: false,
    });
    assert.match(text, /Current meal slot: lunch \(11:00–16:00\)/);
  });

  it("appends a live nutrition snapshot when provided", () => {
    const text = clockContextText({
      liveNutrition: "Live database snapshot for this nutrition day: calories current 400 / goal 2244 kcal remaining 1844.",
      now: new Date("2026-09-03T11:00:00.000Z"),
      timeZone: "Europe/Berlin",
      timezoneIsFallback: false,
    });
    assert.match(text, /Current meal slot: lunch \(11:00–16:00\)/);
    assert.match(text, /calories current 400 \/ goal 2244 kcal remaining 1844/);
  });

  it("tells the agent to search in the catalog language and English", () => {
    const text = clockContextText({
      catalogCountry: "es",
      now: new Date("2026-09-03T11:00:00.000Z"),
      timeZone: "Europe/Madrid",
      timezoneIsFallback: false,
    });
    assert.match(text, /Catalog country: ES \(search names in Spanish and English\)/);
  });

  it("uses English only when the catalog language is English", () => {
    const text = clockContextText({
      catalogCountry: "gb",
      now: new Date("2026-09-03T11:00:00.000Z"),
      timeZone: "Europe/London",
      timezoneIsFallback: false,
    });
    assert.match(text, /Catalog country: GB \(search names in English\)/);
    assert.doesNotMatch(text, /and English/);
  });
});
