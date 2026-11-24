import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { shiftYmd } from "../timezone.ts";
import { api, closeDatabase, installFakes, resetDatabase, seedOffProduct, signIn, uploadPng, type Session } from "./test/harness.ts";

const BREAD = "8480000123459";
let kira: Session;
let other: Session;
let today: string;
let yesterday: string;

before(async () => {
  installFakes();
  await resetDatabase();
  await seedOffProduct({
    barcode: BREAD,
    brands: "Hacendado",
    name: "Pan rústico natural",
    nutriments: { carbohydrates100g: 50, energyKcal100g: 265, fat100g: 3.2, proteins100g: 9 },
    quantity: "400 g",
    servingSize: "50 g",
  });
  kira = await signIn("kira@example.com");
  other = await signIn("other@example.com");
  await api("PUT", "/me/goals", { body: { caloriesPerDay: 1600, proteinGPerDay: 120 }, token: kira.accessToken });
  const diary = await api("GET", "/diary", { token: kira.accessToken });
  today = diary.body.today;
  yesterday = shiftYmd(today, -1);
});
after(closeDatabase);

describe("logging food", () => {
  it("logs a packaged food by barcode with its brand and per-100 nutrition", async () => {
    const result = await api("POST", "/meals/items", {
      body: { items: [{ amount: 75, barcode: BREAD, unit: "g" }], label: "breakfast" },
      token: kira.accessToken,
    });
    assert.equal(result.status, 201, JSON.stringify(result.body));
    const [item] = result.body.meal.items;
    assert.equal(result.body.meal.label, "breakfast");
    assert.equal(item.name, "Pan rústico natural");
    assert.equal(item.brand, "Hacendado");
    assert.equal(item.grams, 75);
    assert.equal(Math.round(item.metrics.energyKcal), 199);
    assert.equal(item.nutrimentsPer100g.energyKcal100g, 265);
    assert.deepEqual(result.body.meal.photos, []);
  });

  it("appends to the same meal and logs homemade food by name", async () => {
    const result = await api("POST", "/meals/items", {
      body: {
        items: [{ amount: 200, name: "Oat milk", nutrimentsPer100ml: undefined, nutrimentsPer100g: { energyKcal100g: 45, proteins100g: 1 }, unit: "g" }],
        label: "breakfast",
      },
      token: kira.accessToken,
    });
    assert.equal(result.status, 201, JSON.stringify(result.body));
    assert.equal(result.body.meal.items.length, 2, "same day and label append to one meal");
  });

  it("logs to an earlier day and refuses future days", async () => {
    const past = await api("POST", "/meals/items", {
      body: { date: yesterday, items: [{ amount: 100, barcode: BREAD, unit: "g" }], label: "breakfast" },
      token: kira.accessToken,
    });
    assert.equal(past.status, 201);
    const future = await api("POST", "/meals/items", {
      body: { date: shiftYmd(today, 1), items: [{ amount: 100, barcode: BREAD, unit: "g" }], label: "lunch" },
      token: kira.accessToken,
    });
    assert.equal(future.status, 400);
  });

  it("keeps client-chosen item ids and ignores a retried request", async () => {
    const id = "app_retry_item_000000000001";
    const body = { date: yesterday, items: [{ amount: 50, id, name: "Retry toast", nutrimentsPer100g: { energyKcal100g: 300 }, unit: "g" }], label: "dinner" };
    const first = await api("POST", "/meals/items", { body, token: kira.accessToken });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(first.body.meal.items[0].id, id);
    const retry = await api("POST", "/meals/items", { body, token: kira.accessToken });
    assert.equal(retry.status, 201, JSON.stringify(retry.body));
    assert.equal(retry.body.meal.items.filter((item: { id: string }) => item.id === id).length, 1, "the retry does not log it twice");
    const stolen = await api("POST", "/meals/items", { body, token: other.accessToken });
    assert.equal(stolen.status, 409);
    const edited = await api("PATCH", `/meal-items/${id}`, { body: { amount: 100 }, token: kira.accessToken });
    assert.equal(edited.status, 200, JSON.stringify(edited.body));
    assert.equal((await api("DELETE", `/meal-items/${id}`, { token: kira.accessToken })).status, 200);
  });

  it("validates items", async () => {
    const missing = await api("POST", "/meals/items", { body: { items: [{ amount: 10, unit: "g" }], label: "lunch" }, token: kira.accessToken });
    assert.equal(missing.status, 400);
    const unknown = await api("POST", "/meals/items", { body: { items: [{ amount: 10, barcode: "4000000000006", unit: "g" }], label: "lunch" }, token: kira.accessToken });
    assert.equal(unknown.status, 404);
    const badLabel = await api("POST", "/meals/items", { body: { items: [{ amount: 10, name: "x", unit: "g" }], label: "brunch" }, token: kira.accessToken });
    assert.equal(badLabel.status, 400);
  });
});

describe("diary", () => {
  it("returns today's meals, totals, what's left and the Monday-to-Sunday week", async () => {
    const result = await api("GET", "/diary", { token: kira.accessToken });
    assert.equal(result.status, 200);
    const { day, week } = result.body;
    assert.equal(day.date, today);
    assert.equal(day.meals.length, 1);
    assert.equal(day.meals[0].items.length, 2);
    const kcal = Math.round(day.totals.energyKcal);
    assert.equal(kcal, 199 + 90);
    assert.equal(Math.round(day.remaining.energyKcal), 1600 - kcal);
    assert.equal(day.remaining.sugars, undefined, "nutrients without a goal are not listed");

    assert.equal(week.length, 7);
    assert.equal(new Date(`${week[0].date}T12:00:00Z`).getUTCDay(), 1, "weeks start on Monday");
    const todayBucket = week.find((entry: { date: string }) => entry.date === today);
    assert.equal(todayBucket.logged, true);
    assert.equal(todayBucket.byLabel.breakfast, kcal);
    assert.equal(result.body.streak >= 1, true);
  });

  it("returns one day and a range of day buckets with per-meal calories", async () => {
    const day = await api("GET", `/diary/days/${yesterday}`, { token: kira.accessToken });
    assert.equal(day.status, 200);
    assert.equal(Math.round(day.body.totals.energyKcal), 265);

    const range = await api("GET", `/diary/days?from=${shiftYmd(today, -30)}&to=${shiftYmd(today, 2)}`, { token: kira.accessToken });
    assert.equal(range.status, 200);
    assert.equal(range.body.days.length, 33, "ranges longer than the 21-day summary window are stitched together");
    const future = range.body.days.at(-1);
    assert.equal(future.future, true);
    assert.equal(future.logged, false);
    assert.equal(range.body.days.find((entry: { date: string }) => entry.date === yesterday).byLabel.breakfast, 265);
  });

  it("rejects bad ranges", async () => {
    assert.equal((await api("GET", `/diary/days?from=${today}&to=${yesterday}`, { token: kira.accessToken })).status, 400);
    assert.equal((await api("GET", `/diary/days?from=${shiftYmd(today, -200)}&to=${today}`, { token: kira.accessToken })).status, 400);
    assert.equal((await api("GET", "/diary/days/2026-13-40", { token: kira.accessToken })).status, 400);
  });

  it("keeps each user's diary private", async () => {
    const result = await api("GET", "/diary", { token: other.accessToken });
    assert.equal(result.body.day.meals.length, 0);
  });
});

describe("editing meals", () => {
  it("changes an amount, moves an item to another meal and deletes items", async () => {
    const diary = await api("GET", "/diary", { token: kira.accessToken });
    const meal = diary.body.day.meals[0];
    const bread = meal.items.find((item: { name: string }) => item.name === "Pan rústico natural");

    const resized = await api("PATCH", `/meal-items/${bread.id}`, { body: { amount: 150 }, token: kira.accessToken });
    assert.equal(resized.status, 200);
    const updated = resized.body.meal.items.find((item: { id: string }) => item.id === bread.id);
    assert.equal(updated.amount, 150);
    assert.equal(Math.round(updated.metrics.energyKcal), 398);

    const moved = await api("PATCH", `/meal-items/${bread.id}`, { body: { label: "lunch" }, token: kira.accessToken });
    assert.equal(moved.body.meal.label, "lunch");

    const removed = await api("DELETE", `/meal-items/${bread.id}`, { token: kira.accessToken });
    assert.equal(removed.status, 200);
    assert.equal(removed.body.mealDeleted, true, "removing the last item removes the meal");
  });

  it("does not let another user touch the meal", async () => {
    const diary = await api("GET", "/diary", { token: kira.accessToken });
    const [meal] = diary.body.day.meals;
    const [item] = meal.items;
    assert.equal((await api("PATCH", `/meal-items/${item.id}`, { body: { amount: 1 }, token: other.accessToken })).status, 404);
    assert.equal((await api("DELETE", `/meal-items/${item.id}`, { token: other.accessToken })).status, 404);
    assert.equal((await api("DELETE", `/meals/${meal.id}`, { token: other.accessToken })).status, 404);
    assert.equal((await api("GET", `/meals/${meal.id}`, { token: other.accessToken })).status, 404);
  });

  it("copies yesterday's breakfast to today's lunch", async () => {
    const day = await api("GET", `/diary/days/${yesterday}`, { token: kira.accessToken });
    const [source] = day.body.meals;
    const copied = await api("POST", `/meals/${source.id}/copy`, { body: { date: today, label: "lunch" }, token: kira.accessToken });
    assert.equal(copied.status, 201, JSON.stringify(copied.body));
    assert.equal(copied.body.meal.label, "lunch");
    assert.equal(copied.body.meal.items[0].brand, "Hacendado");

    const same = await api("POST", `/meals/${source.id}/copy`, { body: { date: yesterday, label: "breakfast" }, token: kira.accessToken });
    assert.equal(same.status, 409);
  });

  it("attaches and removes meal photos", async () => {
    const diary = await api("GET", "/diary", { token: kira.accessToken });
    const [meal] = diary.body.day.meals;
    const uploadId = await uploadPng(kira.accessToken);
    const attached = await api("POST", `/meals/${meal.id}/photos`, { body: { uploadId }, token: kira.accessToken });
    assert.equal(attached.status, 201);
    assert.equal(attached.body.meal.photos.length, 1);
    assert.match(attached.body.meal.photos[0].url, /^\/api\/v1\/uploads\/.+\/content$/);

    const strangerUpload = await uploadPng(other.accessToken);
    const stolen = await api("POST", `/meals/${meal.id}/photos`, { body: { uploadId: strangerUpload }, token: kira.accessToken });
    assert.equal(stolen.status, 404, "only your own uploads can be attached");

    const photoId = attached.body.meal.photos[0].id;
    assert.equal((await api("DELETE", `/meals/${meal.id}/photos/${photoId}`, { token: kira.accessToken })).status, 204);
    const after = await api("GET", `/meals/${meal.id}`, { token: kira.accessToken });
    assert.equal(after.body.meal.photos.length, 0);
  });

  it("keeps meal photos in the order they were added, and in any order you set", async () => {
    const diary = await api("GET", "/diary", { token: kira.accessToken });
    const [meal] = diary.body.day.meals;
    const ids: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const uploadId = await uploadPng(kira.accessToken);
      const added = await api("POST", `/meals/${meal.id}/photos`, { body: { uploadId }, token: kira.accessToken });
      ids.push(added.body.meal.photos.at(-1).id);
    }
    const listed = await api("GET", `/meals/${meal.id}`, { token: kira.accessToken });
    assert.deepEqual(listed.body.meal.photos.map((photo: { id: string }) => photo.id), ids, "added at the end");

    const reversed = [...ids].reverse();
    const ordered = await api("PUT", `/meals/${meal.id}/photos/order`, { body: { photoIds: reversed }, token: kira.accessToken });
    assert.equal(ordered.status, 200);
    assert.deepEqual(ordered.body.meal.photos.map((photo: { id: string }) => photo.id), reversed);
    const day = await api("GET", "/diary", { token: kira.accessToken });
    const sameMeal = day.body.day.meals.find((entry: { id: string }) => entry.id === meal.id);
    assert.deepEqual(sameMeal.photos.map((photo: { id: string }) => photo.id), reversed, "the diary shows the new order");

    assert.equal((await api("PUT", `/meals/${meal.id}/photos/order`, { body: { photoIds: reversed.slice(1) }, token: kira.accessToken })).status, 400, "every photo must be listed");
    assert.equal((await api("PUT", `/meals/${meal.id}/photos/order`, { body: { photoIds: [ids[0], ids[0], ids[1]] }, token: kira.accessToken })).status, 400, "no repeats");
    assert.equal((await api("PUT", `/meals/${meal.id}/photos/order`, { body: { photoIds: reversed }, token: other.accessToken })).status, 404, "only your own meals");

    for (const id of ids) await api("DELETE", `/meals/${meal.id}/photos/${id}`, { token: kira.accessToken });
  });
});

describe("log food helpers", () => {
  it("suggests repeating yesterday's meal and the foods often eaten at it", async () => {
    const result = await api("GET", `/log/suggestions?label=breakfast&date=${today}`, { token: kira.accessToken });
    assert.equal(result.status, 200);
    assert.equal(result.body.repeat.date, yesterday);
    assert.equal(result.body.repeat.itemCount, 1);
    assert.equal(Math.round(result.body.repeat.totals.energyKcal), 265);
    const bread = result.body.often.find((entry: { barcode: string | null }) => entry.barcode === BREAD);
    assert.ok(bread, "bread was eaten at breakfast");
    assert.equal(bread.brand, "Hacendado");
    assert.equal(bread.nutrimentsPer100g.energyKcal100g, 265, "suggestions carry nutrition so the app can log them");
    assert.equal(result.body.repeat.items[0].nutrimentsPer100g.energyKcal100g, 265);
  });

  it("lists recent products and manages favorites", async () => {
    const recent = await api("GET", "/products?segment=recent", { token: kira.accessToken });
    assert.equal(recent.status, 200);
    const bread = recent.body.products.find((entry: { barcode: string | null }) => entry.barcode === BREAD);
    assert.ok(bread);
    assert.equal(bread.brand, "Hacendado");
    assert.equal(bread.nutrimentsPer100g.energyKcal100g, 265);

    const key = encodeURIComponent(bread.key);
    assert.equal((await api("PUT", `/products/favorites/${key}`, { body: { barcode: BREAD, name: bread.name }, token: kira.accessToken })).status, 200);
    const favorites = await api("GET", "/products?segment=favorites", { token: kira.accessToken });
    assert.equal(favorites.body.products.length, 1);
    assert.equal(favorites.body.products[0].favorite, true);

    assert.equal((await api("DELETE", `/products/favorites/${key}`, { token: kira.accessToken })).status, 204);
    const none = await api("GET", "/products?segment=favorites", { token: kira.accessToken });
    assert.equal(none.body.products.length, 0);
  });
});
