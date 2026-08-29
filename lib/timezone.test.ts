import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatDateInTimeZone,
  localDayRange,
  nextLocalOccurrence,
  normalizeTimezone,
  zonedLocalToUtc,
} from "./timezone.ts";

describe("normalizeTimezone", () => {
  it("canonicalizes IANA time zones", () => {
    assert.equal(normalizeTimezone("Europe/Berlin"), "Europe/Berlin");
    assert.equal(normalizeTimezone("UTC"), "UTC");
  });

  it("rejects invalid values", () => {
    assert.equal(normalizeTimezone(""), null);
    assert.equal(normalizeTimezone("Not/AZone"), null);
  });
});

describe("formatDateInTimeZone", () => {
  it("formats a UTC instant as a local calendar date", () => {
    const date = new Date("2026-08-29T01:00:00.000Z");
    assert.equal(formatDateInTimeZone(date, "UTC"), "2026-08-29");
    assert.equal(formatDateInTimeZone(date, "America/New_York"), "2026-08-28");
  });
});

describe("zonedLocalToUtc", () => {
  it("converts Berlin wall time to UTC", () => {
    const date = zonedLocalToUtc({
      timeZone: "Europe/Berlin",
      year: 2026,
      month: 8,
      day: 29,
      hour: 9,
      minute: 0,
    });
    assert.equal(date.toISOString(), "2026-08-29T07:00:00.000Z");
  });
});

describe("nextLocalOccurrence", () => {
  it("returns today's slot when it is still ahead", () => {
    const next = nextLocalOccurrence({
      now: new Date("2026-08-29T06:00:00.000Z"),
      timeZone: "Europe/Berlin",
      hour: 9,
      minute: 0,
    });
    assert.equal(next.toISOString(), "2026-08-29T07:00:00.000Z");
  });

  it("rolls to the next day when the slot has already passed", () => {
    const next = nextLocalOccurrence({
      now: new Date("2026-08-29T07:00:00.000Z"),
      timeZone: "Europe/Berlin",
      hour: 9,
      minute: 0,
    });
    assert.equal(next.toISOString(), "2026-08-30T07:00:00.000Z");
  });
});

describe("localDayRange", () => {
  it("returns the local calendar day as an exclusive UTC range", () => {
    const range = localDayRange(new Date("2026-08-29T07:00:00.000Z"), "Europe/Berlin");
    assert.equal(range.from.toISOString(), "2026-08-28T22:00:00.000Z");
    assert.equal(range.to.toISOString(), "2026-08-29T22:00:00.000Z");
  });
});
