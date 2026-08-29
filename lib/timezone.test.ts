import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatDateInTimeZone,
  listLocalDates,
  localDayRange,
  localInclusiveDateRange,
  localRollingDaysRange,
  localWeekRange,
  nextLocalOccurrence,
  normalizeTimezone,
  parseYmd,
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
  it("formats a UTC instant as the nutrition date starting at 04:00", () => {
    const date = new Date("2026-08-29T12:00:00.000Z");
    assert.equal(formatDateInTimeZone(date, "UTC"), "2026-08-29");
    assert.equal(formatDateInTimeZone(date, "America/New_York"), "2026-08-29");
  });

  it("keeps hours before 04:00 on the previous nutrition date", () => {
    assert.equal(formatDateInTimeZone(new Date("2026-08-29T01:00:00.000Z"), "UTC"), "2026-08-28");
    assert.equal(formatDateInTimeZone(new Date("2026-08-29T07:00:00.000Z"), "America/New_York"), "2026-08-28");
  });

  it("starts the new nutrition date at 04:00", () => {
    assert.equal(formatDateInTimeZone(new Date("2026-08-29T02:00:00.000Z"), "Europe/Berlin"), "2026-08-29");
    assert.equal(formatDateInTimeZone(new Date("2026-08-29T08:00:00.000Z"), "America/New_York"), "2026-08-29");
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
  it("returns the local nutrition day as an exclusive UTC range", () => {
    const range = localDayRange(new Date("2026-08-29T07:00:00.000Z"), "Europe/Berlin");
    assert.equal(range.from.toISOString(), "2026-08-29T02:00:00.000Z");
    assert.equal(range.to.toISOString(), "2026-08-30T02:00:00.000Z");
  });

  it("stays on the previous nutrition day until 04:00", () => {
    const range = localDayRange(new Date("2026-08-29T01:00:00.000Z"), "Europe/Berlin");
    assert.equal(range.from.toISOString(), "2026-08-28T02:00:00.000Z");
    assert.equal(range.to.toISOString(), "2026-08-29T02:00:00.000Z");
  });
});

describe("localWeekRange", () => {
  it("returns Monday through Sunday in the local timezone", () => {
    const range = localWeekRange(new Date("2026-08-29T07:00:00.000Z"), "Europe/Berlin");
    assert.equal(range.from.toISOString(), "2026-08-24T02:00:00.000Z");
    assert.equal(range.to.toISOString(), "2026-08-31T02:00:00.000Z");
  });
});

describe("localRollingDaysRange", () => {
  it("includes today and the previous N-1 local days", () => {
    const range = localRollingDaysRange(new Date("2026-08-29T07:00:00.000Z"), "Europe/Berlin", 30);
    assert.equal(range.from.toISOString(), "2026-07-31T02:00:00.000Z");
    assert.equal(range.to.toISOString(), "2026-08-30T02:00:00.000Z");
  });

  it("matches localDayRange when days is 1", () => {
    const now = new Date("2026-08-29T07:00:00.000Z");
    const day = localDayRange(now, "Europe/Berlin");
    const rolling = localRollingDaysRange(now, "Europe/Berlin", 1);
    assert.equal(rolling.from.toISOString(), day.from.toISOString());
    assert.equal(rolling.to.toISOString(), day.to.toISOString());
  });
});

describe("parseYmd", () => {
  it("parses calendar dates and rejects invalid days", () => {
    assert.deepEqual(parseYmd("2026-08-29"), { year: 2026, month: 8, day: 29 });
    assert.equal(parseYmd("2026-02-30"), null);
    assert.equal(parseYmd("29-08-2026"), null);
  });
});

describe("localInclusiveDateRange", () => {
  it("converts inclusive local dates to an exclusive UTC range", () => {
    const range = localInclusiveDateRange("Europe/Berlin", "2026-08-01", "2026-08-03");
    assert.equal(range.from.toISOString(), "2026-08-01T02:00:00.000Z");
    assert.equal(range.to.toISOString(), "2026-08-04T02:00:00.000Z");
  });

  it("rejects inverted or oversized ranges", () => {
    assert.throws(() => localInclusiveDateRange("UTC", "2026-08-03", "2026-08-01"));
    assert.throws(() => localInclusiveDateRange("UTC", "2026-01-01", "2026-04-02"));
  });
});

describe("listLocalDates", () => {
  it("lists each local calendar day in the exclusive range", () => {
    const range = localInclusiveDateRange("Europe/Berlin", "2026-08-01", "2026-08-03");
    assert.deepEqual(listLocalDates(range.from, range.to, "Europe/Berlin"), [
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
    ]);
  });
});
