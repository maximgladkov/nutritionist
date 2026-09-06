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
    assert.match(text, /Current meal slot: snack \(before 05:00 or from 21:00\)/);
    assert.match(text, /Breakfast 05:00–11:00, lunch 11:00–16:00, dinner 16:00–21:00, otherwise snack/);
    assert.doesNotMatch(text, /timezone is unknown/);
  });

  it("keeps hours before 04:00 on the previous nutrition day", () => {
    const text = clockContextText({
      now: new Date("2026-09-04T00:30:00.000Z"),
      timeZone: "Europe/Berlin",
      timezoneIsFallback: false,
    });
    assert.match(text, /Friday 2026-09-04 02:30 \(Europe\/Berlin\)/);
    assert.match(text, /Nutrition day: 2026-09-03/);
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
});
