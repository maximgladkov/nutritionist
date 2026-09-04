import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  adminChannelChartRows,
  adminUserPath,
  formatChannelLabel,
  formatRequestCount,
  formatTokenCount,
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
