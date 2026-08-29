import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatDateInTimeZone, normalizeTimezone } from "./timezone.ts";

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
