import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { api, closeDatabase, installFakes, resetDatabase, signIn, type Session } from "./test/harness.ts";

let kira: Session;
let sam: Session;
let mealId: string;

const SOUP = { carbohydrates100g: 4.1, energyKcal100g: 22, fat100g: 0.1, proteins100g: 0.9 };

before(async () => {
  installFakes();
  await resetDatabase();
  kira = await signIn("kira@example.com");
  sam = await signIn("sam@example.com");
  await api("PATCH", "/me", { body: { name: "Kira" }, token: kira.accessToken });
  const logged = await api("POST", "/meals/items", {
    body: {
      items: [
        { amount: 250, name: "Chicken soup", nutrimentsPer100g: SOUP, unit: "ml" },
        { amount: 60, brand: "Hacendado", name: "Toast", nutrimentsPer100g: { energyKcal100g: 290, proteins100g: 9 }, unit: "g" },
      ],
      label: "lunch",
    },
    token: kira.accessToken,
  });
  assert.equal(logged.status, 201, JSON.stringify(logged.body));
  mealId = logged.body.meal.id;
});
after(closeDatabase);

describe("sharing a meal", () => {
  it("makes a link that shows the foods to someone else, who adds them to their own meal", async () => {
    const shared = await api("POST", `/meals/${mealId}/share`, { token: kira.accessToken });
    assert.equal(shared.status, 201, JSON.stringify(shared.body));
    const { token, url } = shared.body.share;
    assert.match(url, new RegExp(`/api/v1/shared/${token}$`));
    assert.equal(shared.body.share.items.length, 2);

    const seen = await api("GET", `/shared-meals/${token}`, { token: sam.accessToken });
    assert.equal(seen.status, 200);
    assert.equal(seen.body.share.sharedBy, "Kira");
    assert.equal(seen.body.share.label, "lunch");
    assert.deepEqual(seen.body.share.items.map((item: { name: string }) => item.name), ["Chicken soup", "Toast"]);
    assert.equal(Math.round(seen.body.share.totals.energyKcal), 229);

    const added = await api("POST", `/shared-meals/${token}/log`, { body: { label: "dinner" }, token: sam.accessToken });
    assert.equal(added.status, 201, JSON.stringify(added.body));
    assert.equal(added.body.meal.label, "dinner");
    assert.deepEqual(added.body.meal.items.map((item: { name: string; amount: number }) => [item.name, item.amount]), [
      ["Chicken soup", 250],
      ["Toast", 60],
    ]);
    const samDiary = await api("GET", "/diary", { token: sam.accessToken });
    assert.equal(samDiary.body.day.meals.length, 1);
  });

  it("keeps what was shared even if the original meal changes", async () => {
    const shared = await api("POST", `/meals/${mealId}/share`, { token: kira.accessToken });
    const meal = await api("GET", "/diary", { token: kira.accessToken });
    const toast = meal.body.day.meals[0].items.find((item: { name: string }) => item.name === "Toast");
    await api("DELETE", `/meal-items/${toast.id}`, { token: kira.accessToken });
    const seen = await api("GET", `/shared-meals/${shared.body.share.token}`, { token: sam.accessToken });
    assert.equal(seen.body.share.items.length, 2);
  });

  it("adds only the foods picked, in the amounts chosen", async () => {
    const shared = await api("POST", `/meals/${mealId}/share`, { token: kira.accessToken });
    const token = shared.body.share.token;
    const added = await api("POST", `/shared-meals/${token}/log`, {
      body: { items: [{ amount: 300, index: 0 }], label: "snack" },
      token: sam.accessToken,
    });
    assert.equal(added.status, 201, JSON.stringify(added.body));
    assert.deepEqual(added.body.meal.items.map((item: { name: string; amount: number }) => [item.name, item.amount]), [["Chicken soup", 300]]);
    const bad = await api("POST", `/shared-meals/${token}/log`, {
      body: { items: [{ amount: 10, index: 9 }], label: "snack" },
      token: sam.accessToken,
    });
    assert.equal(bad.status, 400);
  });

  it("keeps the serving a food was logged in, through edits, copies and shares", async () => {
    const logged = await api("POST", "/meals/items", {
      body: {
        items: [
          {
            amount: 60,
            name: "Rye bread",
            nutrimentsPer100g: { energyKcal100g: 250 },
            serving: { grams: 30, label: "slices (30 g)" },
            unit: "g",
          },
        ],
        label: "breakfast",
      },
      token: kira.accessToken,
    });
    assert.equal(logged.status, 201, JSON.stringify(logged.body));
    const bread = logged.body.meal.items.find((item: { name: string }) => item.name === "Rye bread");
    assert.deepEqual(bread.serving, { grams: 30, label: "slices (30 g)" });

    const shared = await api("POST", `/meals/${logged.body.meal.id}/share`, { token: kira.accessToken });
    const seen = await api("GET", `/shared-meals/${shared.body.share.token}`, { token: sam.accessToken });
    const sharedBread = seen.body.share.items.find((item: { name: string }) => item.name === "Rye bread");
    assert.deepEqual(sharedBread.serving, { grams: 30, label: "slices (30 g)" });
    const added = await api("POST", `/shared-meals/${shared.body.share.token}/log`, { body: { label: "lunch" }, token: sam.accessToken });
    const samBread = added.body.meal.items.find((item: { name: string }) => item.name === "Rye bread");
    assert.deepEqual(samBread.serving, { grams: 30, label: "slices (30 g)" });

    const today = (await api("GET", "/diary", { token: kira.accessToken })).body.today;
    const copied = await api("POST", `/meals/${logged.body.meal.id}/copy`, { body: { date: today, label: "dinner" }, token: kira.accessToken });
    assert.equal(copied.status, 201, JSON.stringify(copied.body));
    const copiedBread = copied.body.meal.items.find((item: { name: string }) => item.name === "Rye bread");
    assert.deepEqual(copiedBread.serving, { grams: 30, label: "slices (30 g)" });

    const cleared = await api("PATCH", `/meal-items/${bread.id}`, { body: { serving: null }, token: kira.accessToken });
    assert.equal(cleared.status, 200, JSON.stringify(cleared.body));
    assert.equal(cleared.body.meal.items.find((item: { id: string }) => item.id === bread.id).serving, null);
  });

  it("only shares your own meals, and unknown links say so", async () => {
    const other = await api("POST", `/meals/${mealId}/share`, { token: sam.accessToken });
    assert.equal(other.status, 404);
    const missing = await api("GET", "/shared-meals/nope", { token: sam.accessToken });
    assert.equal(missing.status, 404);
  });

  it("opens as a page in a browser, with a button into the app", async () => {
    const shared = await api("POST", `/meals/${mealId}/share`, { token: kira.accessToken });
    const token = shared.body.share.token;
    const page = await api("GET", `/shared/${token}`);
    assert.equal(page.status, 200);
    assert.match(String(page.body), /Kira shared Lunch/);
    assert.match(String(page.body), new RegExp(`heroui-native-app://shared-meal/${token}`));
    const gone = await api("GET", "/shared/nope");
    assert.equal(gone.status, 404);
  });

  it("tells people without the app how to get it", async () => {
    const shared = await api("POST", `/meals/${mealId}/share`, { token: kira.accessToken });
    const token = shared.body.share.token;
    const previous = process.env.APP_DOWNLOAD_URL;
    try {
      delete process.env.APP_DOWNLOAD_URL;
      const plain = String((await api("GET", `/shared/${token}`)).body);
      assert.match(plain, /Don’t have Btr.me yet\?/);
      assert.doesNotMatch(plain, /Get the app/);

      process.env.APP_DOWNLOAD_URL = "https://testflight.apple.com/join/abc123";
      const linked = String((await api("GET", `/shared/${token}`)).body);
      assert.match(linked, /href="https:\/\/testflight\.apple\.com\/join\/abc123"[^>]*>Get the app</);

      process.env.APP_DOWNLOAD_URL = "javascript:alert(1)";
      assert.doesNotMatch(String((await api("GET", `/shared/${token}`)).body), /Get the app/);
    } finally {
      if (previous === undefined) delete process.env.APP_DOWNLOAD_URL;
      else process.env.APP_DOWNLOAD_URL = previous;
    }
  });
});
