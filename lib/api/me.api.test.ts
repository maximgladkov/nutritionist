import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { api, closeDatabase, installFakes, resetDatabase, signIn, type Session } from "./test/harness.ts";

let session: Session;

before(async () => {
  installFakes();
  await resetDatabase();
  session = await signIn("me@example.com", {});
});
after(closeDatabase);

describe("profile", () => {
  it("updates name, locale, country and time zone", async () => {
    const result = await api("PATCH", "/me", {
      body: { country: "es", locale: "ru", name: "Kira", timezone: "Europe/Madrid" },
      token: session.accessToken,
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.name, "Kira");
    assert.equal(result.body.locale, "ru");
    assert.equal(result.body.country, "es");
    assert.equal(result.body.timezone, "Europe/Madrid");
    assert.equal(result.body.plan, "free");
  });

  it("accepts Spanish", async () => {
    const result = await api("PATCH", "/me", { body: { locale: "es" }, token: session.accessToken });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.locale, "es");
  });

  it("accepts German", async () => {
    const result = await api("PATCH", "/me", { body: { locale: "de" }, token: session.accessToken });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.locale, "de");
  });

  it("accepts French", async () => {
    const result = await api("PATCH", "/me", { body: { locale: "fr" }, token: session.accessToken });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.locale, "fr");
  });

  it("accepts Italian", async () => {
    const result = await api("PATCH", "/me", { body: { locale: "it" }, token: session.accessToken });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.locale, "it");
  });

  it("accepts Portuguese", async () => {
    const result = await api("PATCH", "/me", { body: { locale: "pt" }, token: session.accessToken });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.locale, "pt");
  });

  it("saves preferences in the account and merges updates", async () => {
    const empty = await api("GET", "/me", { token: session.accessToken });
    assert.deepEqual(empty.body.preferences, {});

    const order = ["protein", "kcal", "fat", "carbs"];
    const saved = await api("PATCH", "/me", { body: { preferences: { nutrientOrder: order } }, token: session.accessToken });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.deepEqual(saved.body.preferences, { nutrientOrder: order });

    // Another field changes without touching preferences.
    await api("PATCH", "/me", { body: { name: "Kira" }, token: session.accessToken });
    const again = await api("GET", "/me", { token: session.accessToken });
    assert.deepEqual(again.body.preferences, { nutrientOrder: order });
  });

  it("rejects malformed preferences", async () => {
    for (const preferences of [
      { nutrientOrder: ["protein", "kcal"] },
      { nutrientOrder: ["protein", "protein", "fat", "carbs"] },
      { nutrientOrder: ["protein", "kcal", "fat", "sugar"] },
      { theme: "dark" },
    ]) {
      const result = await api("PATCH", "/me", { body: { preferences }, token: session.accessToken });
      assert.equal(result.status, 400, JSON.stringify(preferences));
    }
  });

  it("rejects unknown locales, countries, time zones and fields", async () => {
    for (const body of [{ locale: "xx" }, { country: "Atlantis" }, { timezone: "Mars/Olympus" }, { email: "x@y.z" }]) {
      const result = await api("PATCH", "/me", { body, token: session.accessToken });
      assert.equal(result.status, 400, JSON.stringify(body));
    }
  });

  it("serves the option lists without auth", async () => {
    const result = await api("GET", "/meta/options");
    assert.equal(result.status, 200);
    assert.ok(result.body.countries.length > 50);
    assert.ok(result.body.timeZones.includes("Europe/Madrid"));
    assert.deepEqual(result.body.locales, ["en", "ru", "es", "de", "fr", "it", "pt"]);
  });
});

describe("goals", () => {
  it("saves daily goals and the weight goal together", async () => {
    const saved = await api("PUT", "/me/goals", {
      body: { caloriesPerDay: 1600, goalWeightKg: 55, proteinGPerDay: 120 },
      token: session.accessToken,
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.caloriesPerDay, 1600);
    assert.equal(saved.body.proteinGPerDay, 120);
    assert.equal(saved.body.goalWeightKg, 55);

    const cleared = await api("PUT", "/me/goals", { body: { proteinGPerDay: null }, token: session.accessToken });
    assert.equal(cleared.body.proteinGPerDay, null);
    assert.equal(cleared.body.caloriesPerDay, 1600, "untouched goals stay");
  });

  it("rejects goals outside the allowed range", async () => {
    const result = await api("PUT", "/me/goals", { body: { caloriesPerDay: 50 }, token: session.accessToken });
    assert.equal(result.status, 400);
  });
});

describe("reminders", () => {
  it("lists default check-ins once a time zone is set and updates them", async () => {
    const listed = await api("GET", "/me/reminders", { token: session.accessToken });
    assert.equal(listed.status, 200);
    assert.deepEqual(listed.body.reminders.map((row: { label: string }) => row.label).sort(), ["breakfast", "dinner", "lunch", "summary"]);

    const updated = await api("PUT", "/me/reminders", {
      body: { reminders: [{ enabled: false, label: "lunch" }, { hour: 8, label: "breakfast", minute: 30 }] },
      token: session.accessToken,
    });
    assert.equal(updated.status, 200);
    const byLabel = Object.fromEntries(updated.body.reminders.map((row: { label: string }) => [row.label, row]));
    assert.equal(byLabel.lunch.enabled, false);
    assert.equal(byLabel.breakfast.hour, 8);
    assert.equal(byLabel.breakfast.minute, 30);
  });

  it("asks for a time zone before reminders can change", async () => {
    const other = await signIn("no-timezone@example.com", {});
    const result = await api("PUT", "/me/reminders", { body: { reminders: [{ enabled: false, label: "lunch" }] }, token: other.accessToken });
    assert.equal(result.status, 400);
    assert.equal(result.body.error.code, "invalid_reminder");
  });
});

describe("devices and linking", () => {
  it("registers a push token once and moves it to whoever signed in last", async () => {
    const token = "ExponentPushToken[abc123def456]";
    const first = await api("POST", "/me/devices", { body: { platform: "ios", token }, token: session.accessToken });
    assert.equal(first.status, 201);
    const other = await signIn("device-two@example.com", {});
    const moved = await api("POST", "/me/devices", { body: { platform: "ios", token }, token: other.accessToken });
    assert.equal(moved.body.id, first.body.id);
    assert.equal((await api("DELETE", `/me/devices/${encodeURIComponent(token)}`, { token: other.accessToken })).status, 204);
  });

  it("creates link codes and rejects invalid ones", async () => {
    const created = await api("POST", "/me/link-codes", { token: session.accessToken });
    assert.equal(created.status, 201);
    assert.ok(created.body.code.length >= 4);
    const invalid = await api("POST", "/me/link-codes/consume", { body: { code: "NOPE99" }, token: session.accessToken });
    assert.equal(invalid.status, 400);
  });
});
