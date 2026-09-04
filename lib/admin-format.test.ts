import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  adminChannelChartRows,
  adminRangeDayCount,
  adminUserPath,
  adminUserRateMetrics,
  fillDailyRange,
  formatChannelLabel,
  formatRequestCount,
  formatRequestPerDay,
  formatTokenCount,
  formatUsdPerDay,
  sortAdminUserRows,
  topAdminSpenders,
} from "./admin-format.ts";

describe("sortAdminUserRows", () => {
  it("sorts by spend, then last turn, then id", () => {
    const sorted = sortAdminUserRows([
      { costUsd: 1, id: "b", lastTurnAt: "2026-09-04T10:00:00.000Z" },
      { costUsd: 2, id: "a", lastTurnAt: "2026-09-01T10:00:00.000Z" },
      { costUsd: 1, id: "c", lastTurnAt: "2026-09-04T12:00:00.000Z" },
      { costUsd: 1, id: "d", lastTurnAt: "2026-09-04T12:00:00.000Z" },
    ]);
    assert.deepEqual(
      sorted.map((item) => item.id),
      ["a", "c", "d", "b"],
    );
  });
});

describe("adminChannelChartRows", () => {
  it("uses spend when any channel has cost", () => {
    const rows = adminChannelChartRows([
      { channel: "web", costUsd: 1.5, requests: 10 },
      { channel: "whatsapp", costUsd: 0, requests: 4 },
    ]);
    assert.deepEqual(
      rows.map((row) => row.value),
      [1.5, 0],
    );
  });

  it("falls back to request counts when spend is zero", () => {
    const rows = adminChannelChartRows([
      { channel: "web", costUsd: 0, requests: 10 },
      { channel: "whatsapp", costUsd: 0, requests: 4 },
    ]);
    assert.deepEqual(
      rows.map((row) => row.value),
      [10, 4],
    );
  });
});

describe("topAdminSpenders", () => {
  it("keeps the highest spenders and formats labels", () => {
    const rows = topAdminSpenders(
      [
        { costUsd: 3, id: "a", userEmail: "a@example.com", userName: null },
        { costUsd: 0, id: "b", userEmail: null, userName: "Skip" },
        { costUsd: 1, id: "c", userEmail: null, userName: "Cara" },
      ],
      1,
    );
    assert.deepEqual(rows, [{ costUsd: 3, label: "a@example.com" }]);
  });
});

describe("formatChannelLabel", () => {
  it("uses display names for known channels", () => {
    assert.equal(formatChannelLabel("web"), "Web");
    assert.equal(formatChannelLabel("telegram"), "Telegram");
    assert.equal(formatChannelLabel("whatsapp"), "WhatsApp");
    assert.equal(formatChannelLabel("email"), "Email");
    assert.equal(formatChannelLabel("channel:telegram"), "Telegram");
    assert.equal(formatChannelLabel("http"), "Web");
    assert.equal(formatChannelLabel("sms"), "sms");
  });
});

describe("formatRequestCount", () => {
  it("appends the req unit with English grouping", () => {
    assert.equal(formatRequestCount(12), "12 req");
    assert.equal(formatRequestCount(1500), "1,500 req");
  });
});

describe("formatTokenCount", () => {
  it("appends the tok unit with English grouping", () => {
    assert.equal(formatTokenCount(8), "8 tok");
    assert.equal(formatTokenCount(18963), "18,963 tok");
  });
});

describe("adminUserPath", () => {
  it("encodes the user id and optional range", () => {
    assert.equal(adminUserPath("abc/def"), "/admin/users/abc%2Fdef");
    assert.equal(adminUserPath("user-1", "7d"), "/admin/users/user-1?range=7d");
  });
});

describe("fillDailyRange", () => {
  const now = new Date("2026-09-04T12:00:00.000Z");

  it("returns an empty series when there is no activity", () => {
    assert.deepEqual(fillDailyRange([], "7d", now), []);
    assert.deepEqual(fillDailyRange([{ costUsd: 0, day: "2026-09-04", requests: 0 }], "7d", now), []);
  });

  it("fills missing days in a 7d window so a sparkline can draw", () => {
    const filled = fillDailyRange([{ costUsd: 0.0018, day: "2026-09-04", requests: 1 }], "7d", now);
    assert.equal(filled.length, 7);
    assert.equal(filled[0]?.day, "2026-08-29");
    assert.equal(filled[0]?.requests, 0);
    assert.equal(filled[6]?.day, "2026-09-04");
    assert.equal(filled[6]?.requests, 1);
    assert.equal(filled[6]?.costUsd, 0.0018);
  });

  it("fills a 30d window", () => {
    const filled = fillDailyRange([{ costUsd: 1, day: "2026-08-20", requests: 4 }], "30d", now);
    assert.equal(filled.length, 30);
    assert.equal(filled[0]?.day, "2026-08-06");
    assert.equal(filled.find((point) => point.day === "2026-08-20")?.requests, 4);
  });

  it("pads a single all-time point with a leading zero day", () => {
    const filled = fillDailyRange([{ costUsd: 1, day: "2026-09-04", requests: 2 }], "all", now);
    assert.equal(filled.length, 2);
    assert.deepEqual(filled[0], { costUsd: 0, day: "2026-09-03", requests: 0 });
    assert.deepEqual(filled[1], { costUsd: 1, day: "2026-09-04", requests: 2 });
  });
});

describe("adminRangeDayCount", () => {
  it("uses the selected range unless the account is newer", () => {
    const now = new Date("2026-09-04T12:00:00.000Z");
    assert.equal(adminRangeDayCount("7d", "2026-01-01T00:00:00.000Z", now), 7);
    assert.equal(adminRangeDayCount("30d", "2026-01-01T00:00:00.000Z", now), 30);
    assert.equal(adminRangeDayCount("7d", "2026-09-03T00:00:00.000Z", now), 2);
    assert.equal(adminRangeDayCount("all", "2026-09-01T12:00:00.000Z", now), 3);
  });
});

describe("adminUserRateMetrics", () => {
  it("averages cost and requests across the range", () => {
    const rates = adminUserRateMetrics({
      costUsd: 1.4,
      createdAt: "2026-01-01T00:00:00.000Z",
      now: new Date("2026-09-04T12:00:00.000Z"),
      range: "7d",
      requestCount: 14,
    });
    assert.equal(rates.days, 7);
    assert.equal(rates.requestsPerDay, 2);
    assert.equal(Number(rates.costPerDay.toFixed(6)), 0.2);
    assert.equal(Number(rates.costPerRequest.toFixed(6)), 0.1);
  });
});

describe("formatRequestPerDay", () => {
  it("appends the req/day unit", () => {
    assert.equal(formatRequestPerDay(2), "2 req/day");
    assert.equal(formatRequestPerDay(1.25), "1.25 req/day");
  });
});

describe("formatUsdPerDay", () => {
  it("appends the /day unit", () => {
    assert.equal(formatUsdPerDay(1.5), "$1.50/day");
  });
});
