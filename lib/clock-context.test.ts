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
  });

  it("marks UTC when timezone is unknown", () => {
    const text = clockContextText({
      now: new Date("2026-09-03T20:12:00.000Z"),
      timeZone: "UTC",
      timezoneIsFallback: true,
    });
    assert.match(text, /Thursday 2026-09-03 20:12 \(UTC; timezone is unknown\)/);
    assert.match(text, /Nutrition day: 2026-09-03/);
  });
});
