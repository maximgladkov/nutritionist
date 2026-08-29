import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveSummaryRange } from "./summary-range.ts";

describe("resolveSummaryRange", () => {
  const now = new Date("2026-08-29T07:00:00.000Z");
  const timeZone = "Europe/Berlin";

  it("maps today, week, and last 30 days", () => {
    assert.deepEqual(resolveSummaryRange({ now, period: "today", timeZone }), {
      from: new Date("2026-08-29T02:00:00.000Z"),
      to: new Date("2026-08-30T02:00:00.000Z"),
    });
    assert.deepEqual(resolveSummaryRange({ now, period: "week", timeZone }), {
      from: new Date("2026-08-24T02:00:00.000Z"),
      to: new Date("2026-08-31T02:00:00.000Z"),
    });
    assert.deepEqual(resolveSummaryRange({ now, period: "days30", timeZone }), {
      from: new Date("2026-07-31T02:00:00.000Z"),
      to: new Date("2026-08-30T02:00:00.000Z"),
    });
  });

  it("maps a custom inclusive date range", () => {
    assert.deepEqual(
      resolveSummaryRange({
        customFrom: "2026-08-01",
        customTo: "2026-08-03",
        now,
        period: "custom",
        timeZone,
      }),
      {
        from: new Date("2026-08-01T02:00:00.000Z"),
        to: new Date("2026-08-04T02:00:00.000Z"),
      },
    );
  });
});
