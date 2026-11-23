import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { prisma } from "../prisma.ts";
import { setApiDeps } from "./deps.ts";
import { api, closeDatabase, installFakes, resetDatabase, signIn, type Session } from "./test/harness.ts";

const TODAY = "2026-11-23";
let session: Session;

beforeEach(async () => {
  installFakes();
  setApiDeps({ now: () => new Date(`${TODAY}T12:00:00Z`) });
  await resetDatabase();
  session = await signIn("health@example.com");
});
after(closeDatabase);

describe("Apple Health sync", () => {
  it("stores daily activity and shows it on the diary day and week", async () => {
    const saved = await api("PUT", "/me/activity", {
      body: {
        days: [
          { activeKcal: 412.6, date: TODAY, steps: 8120 },
          { activeKcal: 300, date: "2026-11-22" },
          { activeKcal: 999, date: "2026-11-30", steps: 1 },
        ],
      },
      token: session.accessToken,
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.saved, 2, "future days are ignored");

    const diary = await api("GET", "/diary", { token: session.accessToken });
    assert.deepEqual(diary.body.day.activity, { activeKcal: 413, steps: 8120 });
    const week = diary.body.week as { activeKcal: number | null; date: string }[];
    assert.equal(week.find((day) => day.date === TODAY)?.activeKcal, 413);
    const range = await api("GET", "/diary/days?from=2026-11-22&to=2026-11-23", { token: session.accessToken });
    assert.deepEqual(
      (range.body.days as { activeKcal: number | null }[]).map((day) => day.activeKcal),
      [300, 413],
    );
    assert.equal(week.find((day) => day.date === "2026-11-24")?.activeKcal, null);
  });

  it("updates only the fields sent, and clears one sent as null", async () => {
    await api("PUT", "/me/activity", { body: { days: [{ activeKcal: 200, date: TODAY, steps: 5000 }] }, token: session.accessToken });
    await api("PUT", "/me/activity", { body: { days: [{ date: TODAY, steps: 6000 }] }, token: session.accessToken });
    let day = await api("GET", `/diary/days/${TODAY}`, { token: session.accessToken });
    assert.deepEqual(day.body.activity, { activeKcal: 200, steps: 6000 });

    await api("PUT", "/me/activity", { body: { days: [{ activeKcal: null, date: TODAY }] }, token: session.accessToken });
    day = await api("GET", `/diary/days/${TODAY}`, { token: session.accessToken });
    assert.deepEqual(day.body.activity, { activeKcal: null, steps: 6000 });
  });

  it("has no activity until the phone shares some", async () => {
    const diary = await api("GET", "/diary", { token: session.accessToken });
    assert.equal(diary.body.day.activity, null);
  });

  it("imports weigh-ins only into days without a weight", async () => {
    await api("POST", "/me/weights", { body: { date: TODAY, weightKg: 70 }, token: session.accessToken });
    const imported = await api("POST", "/me/weights/import", {
      body: {
        entries: [
          { date: TODAY, weightKg: 71 },
          { date: "2026-11-20", weightKg: 72.04 },
          { date: "2026-11-20", weightKg: 72.4 },
          { date: "2026-12-01", weightKg: 69 },
        ],
      },
      token: session.accessToken,
    });
    assert.equal(imported.status, 201, JSON.stringify(imported.body));
    assert.equal(imported.body.imported, 1);
    const rows = await prisma.weightEntry.findMany({ orderBy: { date: "asc" }, where: { userId: session.userId } });
    assert.deepEqual(
      rows.map((row) => [row.date, row.weightKg]),
      [
        ["2026-11-20", 72.4],
        [TODAY, 70],
      ],
    );
  });

  it("rejects out-of-range values", async () => {
    const bad = await api("PUT", "/me/activity", { body: { days: [{ activeKcal: -5, date: TODAY }] }, token: session.accessToken });
    assert.equal(bad.status, 400);
  });
});
