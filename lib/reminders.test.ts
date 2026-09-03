import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkInPrompt,
  DEFAULT_REMINDER_TIMES,
  formatClock,
  isMealCheckInLabel,
  isReminderLabel,
  isValidClock,
  parseClock,
} from "./reminder-clock.ts";
import { localDayRange, nextLocalOccurrence } from "./timezone.ts";

describe("reminder clocks", () => {
  it("formats and parses HH:MM", () => {
    assert.equal(formatClock(9, 0), "09:00");
    assert.deepEqual(parseClock("09:00"), { hour: 9, minute: 0 });
    assert.deepEqual(parseClock("13:30"), { hour: 13, minute: 30 });
    assert.equal(parseClock("24:00"), null);
    assert.equal(parseClock("9"), null);
  });

  it("rejects invalid hour and minute", () => {
    assert.equal(isValidClock(9, 0), true);
    assert.equal(isValidClock(23, 59), true);
    assert.equal(isValidClock(24, 0), false);
    assert.equal(isValidClock(9, 60), false);
    assert.equal(isValidClock(8.5, 0), false);
  });

  it("recognizes meal and summary check-in labels", () => {
    assert.equal(isReminderLabel("breakfast"), true);
    assert.equal(isReminderLabel("summary"), true);
    assert.equal(isReminderLabel("snack"), false);
    assert.equal(isMealCheckInLabel("breakfast"), true);
    assert.equal(isMealCheckInLabel("summary"), false);
  });
});

describe("check-in prompts", () => {
  it("asks how a meal went", () => {
    assert.match(checkInPrompt("lunch"), /how lunch went/);
  });

  it("asks for a day recap on the summary check-in", () => {
    const prompt = checkInPrompt("summary");
    assert.match(prompt, /daily summary/);
    assert.match(prompt, /get_nutrition_summary/);
    assert.doesNotMatch(prompt, /how summary went/);
  });
});

describe("default reminder times", () => {
  it("uses breakfast 10:00, lunch 14:00, dinner 21:00, and summary 22:00", () => {
    assert.deepEqual(DEFAULT_REMINDER_TIMES.breakfast, { hour: 10, minute: 0 });
    assert.deepEqual(DEFAULT_REMINDER_TIMES.lunch, { hour: 14, minute: 0 });
    assert.deepEqual(DEFAULT_REMINDER_TIMES.dinner, { hour: 21, minute: 0 });
    assert.deepEqual(DEFAULT_REMINDER_TIMES.summary, { hour: 22, minute: 0 });
  });
});

describe("skip-if-logged window", () => {
  it("covers the local day for the reminder label lookup", () => {
    const range = localDayRange(new Date("2026-08-29T07:05:00.000Z"), "Europe/Berlin");
    assert.equal(range.from.toISOString(), "2026-08-29T02:00:00.000Z");
    assert.equal(range.to.toISOString(), "2026-08-30T02:00:00.000Z");
  });
});

describe("recomputing nextRunAt", () => {
  it("moves the next run when the local time changes", () => {
    const now = new Date("2026-08-29T08:00:00.000Z");
    const previous = nextLocalOccurrence({
      now,
      timeZone: "Europe/Berlin",
      hour: 9,
      minute: 0,
    });
    const updated = nextLocalOccurrence({
      now,
      timeZone: "Europe/Berlin",
      hour: 10,
      minute: 30,
    });
    assert.equal(previous.toISOString(), "2026-08-30T07:00:00.000Z");
    assert.equal(updated.toISOString(), "2026-08-29T08:30:00.000Z");
  });
});
