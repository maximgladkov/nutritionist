import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { prisma } from "../prisma.ts";
import { fatSecretDateInt } from "../fatsecret.ts";
import { fatSecretEntryToItem } from "../fatsecret-import.ts";
import { setApiDeps } from "./deps.ts";
import {
  api,
  closeDatabase,
  fatSecretDiary,
  flushBackground,
  installFakes,
  pushes,
  resetDatabase,
  signIn,
  type Session,
} from "./test/harness.ts";

const RETURN_URL = "heroui-native-app://linked-accounts";
const TODAY = "2026-11-23";

let session: Session;

function entry(id: string, date: string, overrides: Partial<Parameters<typeof fatSecretEntryToItem>[0]> = {}) {
  return {
    calories: "55",
    carbohydrate: "10.30",
    date_int: String(fatSecretDateInt(date)),
    fat: "0.30",
    food_entry_description: "1 :custom:1 porción, 250 ml DIA Sopa de Pollo con Fideos",
    food_entry_id: id,
    food_entry_name: "DIA Sopa de Pollo con Fideos",
    food_id: "8827497",
    meal: "Breakfast",
    number_of_units: "1.000",
    protein: "2.30",
    saturated_fat: "0",
    serving_id: "8467189",
    sugar: "0.30",
    ...overrides,
  };
}

function seedDiary(): void {
  fatSecretDiary.entries.set(fatSecretDateInt(TODAY), [
    entry("e1", TODAY),
    entry("e2", TODAY, {
      calories: "196",
      fat: "15",
      food_entry_description: "2 large Fried Egg",
      food_entry_name: "Fried Egg",
      food_id: "3096",
      meal: "Lunch",
      number_of_units: "2.000",
      protein: "13.6",
      serving_id: "egg-large",
    }),
  ]);
  fatSecretDiary.servings.set("3096", [
    { metric_serving_amount: "46.000", metric_serving_unit: "g", number_of_units: "1.000", serving_id: "egg-large" },
  ]);
  // An older stretch with a gap of empty months in between.
  fatSecretDiary.entries.set(fatSecretDateInt("2026-09-10"), [
    entry("e3", "2026-09-10", { food_entry_description: "1 snack bar", food_entry_name: "Granola bar", meal: "Other" }),
  ]);
  fatSecretDiary.weights.set(fatSecretDateInt(TODAY), 88);
  fatSecretDiary.weights.set(fatSecretDateInt("2026-09-10"), 90.04);
}

async function connect(): Promise<void> {
  const started = await api("POST", "/integrations/fatsecret/connect", { body: { returnUrl: RETURN_URL }, token: session.accessToken });
  assert.equal(started.status, 201, JSON.stringify(started.body));
  const token = new URL(started.body.authorizeUrl).searchParams.get("oauth_token")!;
  const callback = await api("GET", `/integrations/fatsecret/callback?oauth_token=${token}&oauth_verifier=good-verifier`);
  assert.equal(callback.status, 302);
  assert.equal(callback.headers.get("location"), `${RETURN_URL}?fatsecret=connected`);
  await flushBackground();
}

async function importedItems() {
  return prisma.mealItem.findMany({
    include: { meal: { select: { eatenAt: true, label: true } } },
    orderBy: { name: "asc" },
    where: { meal: { userId: session.userId } },
  });
}

before(async () => {
  installFakes();
});
beforeEach(async () => {
  installFakes();
  setApiDeps({ now: () => new Date(`${TODAY}T12:00:00Z`) });
  await resetDatabase();
  session = await signIn("fatsecret@example.com");
  seedDiary();
});
after(closeDatabase);

describe("FatSecret import", () => {
  it("connects, imports the diary and weights in the background, and reports when done", async () => {
    const before = await api("GET", "/integrations", { token: session.accessToken });
    assert.deepEqual(before.body.fatsecret, { available: true, import: null, status: "disconnected" });

    await connect();

    const status = await api("GET", "/integrations", { token: session.accessToken });
    assert.equal(status.body.fatsecret.status, "connected");
    assert.equal(status.body.fatsecret.import.status, "done");
    assert.equal(status.body.fatsecret.import.entries, 3);
    assert.equal(status.body.fatsecret.import.days, 2);
    assert.equal(status.body.fatsecret.import.weights, 2);
    assert.equal(status.body.fatsecret.import.oldestDate, "2026-09-10");
    assert.equal(status.body.fatsecret.import.report, "Imported 3 foods across 2 days and 2 weigh-ins.");
    assert.equal(pushes.length, 0, "no push device registered, so nothing is sent");

    const items = await importedItems();
    const soup = items.find((item) => item.name === "DIA Sopa de Pollo con Fideos")!;
    assert.equal(soup.meal.label, "breakfast");
    assert.equal(soup.unit, "ml");
    assert.equal(soup.amount, 250);
    assert.equal(soup.energyKcal, 55);
    // 08:30 in Madrid on the day it was logged.
    assert.equal(soup.meal.eatenAt.toISOString(), "2026-11-23T07:30:00.000Z");

    const eggs = items.find((item) => item.name === "Fried Egg")!;
    assert.equal(eggs.meal.label, "lunch");
    assert.equal(eggs.amount, 92, "two large eggs at 46 g each, from FatSecret's serving data");
    assert.equal(eggs.energyKcal, 196);

    const bar = items.find((item) => item.name === "Granola bar")!;
    assert.equal(bar.meal.label, "snack");
    assert.equal(bar.amount, 100, "no weight known: one unit counts as 100 g");
    assert.equal(bar.energyKcal, 55);

    const weights = await prisma.weightEntry.findMany({ orderBy: { date: "asc" }, where: { userId: session.userId } });
    assert.deepEqual(
      weights.map((row) => [row.date, row.weightKg]),
      [
        ["2026-09-10", 90],
        ["2026-11-23", 88],
      ],
    );
  });

  it("never duplicates entries or brings back deleted ones when importing again", async () => {
    await connect();
    const soup = (await importedItems()).find((item) => item.name.startsWith("DIA Sopa"))!;
    await prisma.mealItem.delete({ where: { id: soup.id } });

    const again = await api("POST", "/integrations/fatsecret/import", { token: session.accessToken });
    assert.equal(again.status, 201);
    assert.equal(again.body.fatsecret.import.status, "running");
    await flushBackground();

    const status = await api("GET", "/integrations", { token: session.accessToken });
    assert.equal(status.body.fatsecret.import.entries, 0);
    assert.equal(status.body.fatsecret.import.report, "Nothing new to bring over from FatSecret.");
    assert.equal((await importedItems()).length, 2);
  });

  it("looks a food up only when its serving text has no weight", async () => {
    await connect();
    // The soup's text says 250 ml, so only the eggs ("2 large") and the bar ("1 snack bar") are
    // looked up.
    assert.deepEqual([...fatSecretDiary.lookups].sort(), ["3096", "8827497"]);
    assert.equal(fatSecretDiary.lookups.length, 2);
  });

  it("keeps a weight already logged here", async () => {
    await prisma.weightEntry.create({ data: { date: TODAY, userId: session.userId, weightKg: 87.2 } });
    await connect();
    const today = await prisma.weightEntry.findUnique({ where: { userId_date: { date: TODAY, userId: session.userId } } });
    assert.equal(today?.weightKg, 87.2);
  });

  it("sends a push with the report when the import finishes", async () => {
    await api("POST", "/me/devices", { body: { platform: "ios", token: "ExponentPushToken[test]" }, token: session.accessToken });
    await connect();
    assert.equal(pushes.length, 1);
    assert.equal(pushes[0]!.title, "FatSecret import done");
    assert.equal(pushes[0]!.body, "Imported 3 foods across 2 days and 2 weigh-ins.");
  });

  it("stores FatSecret tokens sealed, not as plain text", async () => {
    await connect();
    const row = await prisma.fatSecretConnection.findUniqueOrThrow({ where: { userId: session.userId } });
    assert.ok(row.accessToken?.startsWith("v1."));
    assert.ok(!JSON.stringify(row).includes("access-token"));
    assert.ok(!JSON.stringify(row).includes("access-secret"));
  });

  it("only sends people back to the app, and handles cancelled or stale sign-ins", async () => {
    const bad = await api("POST", "/integrations/fatsecret/connect", {
      body: { returnUrl: "https://evil.example/steal" },
      token: session.accessToken,
    });
    assert.equal(bad.status, 400);

    const stale = await api("GET", "/integrations/fatsecret/callback?oauth_token=nope&oauth_verifier=x");
    assert.equal(stale.status, 200);
    assert.match(String(stale.body), /expired/);

    const started = await api("POST", "/integrations/fatsecret/connect", { body: { returnUrl: RETURN_URL }, token: session.accessToken });
    const token = new URL(started.body.authorizeUrl).searchParams.get("oauth_token")!;
    const cancelled = await api("GET", `/integrations/fatsecret/callback?oauth_token=${token}`);
    assert.equal(cancelled.headers.get("location"), `${RETURN_URL}?fatsecret=cancelled`);
    const status = await api("GET", "/integrations", { token: session.accessToken });
    assert.equal(status.body.fatsecret.status, "disconnected");
  });

  it("disconnects without touching what was imported", async () => {
    await connect();
    const removed = await api("DELETE", "/integrations/fatsecret", { token: session.accessToken });
    assert.equal(removed.status, 204);
    const status = await api("GET", "/integrations", { token: session.accessToken });
    assert.equal(status.body.fatsecret.status, "disconnected");
    assert.equal((await importedItems()).length, 3);
    const again = await api("POST", "/integrations/fatsecret/import", { token: session.accessToken });
    assert.equal(again.status, 409);
  });
});
