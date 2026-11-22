import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { api, closeDatabase, installFakes, resetDatabase, seedOffProduct, setRecognizer, signIn, uploadPng, type Session } from "./test/harness.ts";

const CHEESE = "8437000000013";
const SOY_DRINK = "8437000000020";
let kira: Session;
let other: Session;

before(async () => {
  installFakes();
  await resetDatabase();
  await seedOffProduct({
    barcode: CHEESE,
    brands: "Hacendado",
    name: "Processed cheese slices",
    nutriments: { carbohydrates100g: 10, energyKcal100g: 287, fat100g: 20, proteins100g: 17 },
    quantity: "200 g",
    servingSize: "20 g",
  });
  await seedOffProduct({
    barcode: SOY_DRINK,
    brands: "Hacendado",
    name: "Vanilla soy drink",
    nutriments: { carbohydrates100ml: 0.9, energyKcal100ml: 31, fat100ml: 1.6, proteins100ml: 3 },
    quantity: "1 l",
  });
  kira = await signIn("foods@example.com");
  other = await signIn("foods-other@example.com");
});
after(closeDatabase);

describe("foods", () => {
  it("searches the catalog", async () => {
    const result = await api("GET", "/foods/search?q=cheese", { token: kira.accessToken });
    assert.equal(result.status, 200);
    const cheese = result.body.foods.find((food: { barcode: string }) => food.barcode === CHEESE);
    assert.ok(cheese, JSON.stringify(result.body));
    assert.equal(cheese.kcalPer100, 287);
    assert.equal(cheese.unit, "g");
    assert.equal(cheese.nutrimentsPer100g.proteins100g, 17);
    assert.deepEqual(cheese.servings.map((serving: { amount: number }) => serving.amount), [100, 20, 200]);
    assert.equal((await api("GET", "/foods/search?q=a", { token: kira.accessToken })).status, 400);
  });

  it("looks up a barcode with servings in the right unit", async () => {
    const cheese = await api("GET", `/foods/barcode/${CHEESE}`, { token: kira.accessToken });
    assert.equal(cheese.status, 200);
    assert.deepEqual(
      cheese.body.servings.map((serving: { amount: number }) => serving.amount),
      [100, 20, 200],
    );
    assert.equal(cheese.body.per100.proteins, 17);

    const drink = await api("GET", `/foods/${SOY_DRINK}`, { token: kira.accessToken });
    assert.equal(drink.body.unit, "ml");
    assert.deepEqual(drink.body.servings.map((serving: { amount: number }) => serving.amount), [100, 1000]);
  });

  it("explains an unknown barcode so the app can offer a label scan", async () => {
    const result = await api("GET", "/foods/barcode/4000000000006", { token: kira.accessToken });
    assert.equal(result.status, 404);
    assert.equal(result.body.error.code, "food_not_found");
  });

  it("saves a custom food from a label with photos and finds it by id and barcode", async () => {
    const uploadId = await uploadPng(kira.accessToken);
    const saved = await api("POST", "/foods", {
      body: {
        barcode: "4000000000006",
        brand: "La Carloteña",
        name: "Roast chicken drumstick",
        nutrimentsPer100g: { carbohydrates100g: 0.8, energyKcal100g: 173, fat100g: 10, proteins100g: 19.6 },
        photos: [{ kind: "nutrition", uploadId }],
        servingSize: "108 g",
      },
      token: kira.accessToken,
    });
    assert.equal(saved.status, 201, JSON.stringify(saved.body));
    assert.equal(saved.body.status, "created");
    assert.equal(saved.body.food.images.length, 1);

    const byBarcode = await api("GET", "/foods/barcode/4000000000006", { token: kira.accessToken });
    assert.equal(byBarcode.status, 200);
    assert.equal(byBarcode.body.brand, "La Carloteña");

    // The next scan of the same barcode lands on the saved product instead of food_not_found.
    const rescan = await api("POST", "/log/analyze", { body: { barcode: "4000000000006", source: "barcode" }, token: kira.accessToken });
    assert.equal(rescan.status, 200, JSON.stringify(rescan.body));
    assert.equal(rescan.body.items[0].match, "barcode");
    assert.equal(rescan.body.items[0].foodId, saved.body.food.id);
    assert.equal(rescan.body.items[0].amount, 108);

    const stranger = await api("POST", "/foods", {
      body: { name: "Thief", nutrimentsPer100g: { energyKcal100g: 1 }, photos: [{ kind: "front", uploadId }] },
      token: other.accessToken,
    });
    assert.equal(stranger.status, 404, "another user's upload can't be attached");
  });

  it("saves a food without a barcode under a catalog id", async () => {
    const saved = await api("POST", "/foods", {
      body: { name: "Grandma's lentil stew", nutrimentsPer100g: { energyKcal100g: 120, proteins100g: 8 } },
      token: kira.accessToken,
    });
    assert.equal(saved.status, 201);
    assert.match(saved.body.food.id, /^catalog:/);
    const loaded = await api("GET", `/foods/${encodeURIComponent(saved.body.food.id)}`, { token: kira.accessToken });
    assert.equal(loaded.body.name, "Grandma's lentil stew");

    const logged = await api("POST", "/meals/items", {
      body: { items: [{ amount: 250, foodId: saved.body.food.id, unit: "g" }], label: "dinner" },
      token: kira.accessToken,
    });
    assert.equal(logged.status, 201);
    assert.equal(Math.round(logged.body.meal.items[0].metrics.energyKcal), 300);
  });
});

describe("saved meals", () => {
  it("saves a logged meal, renames it, logs it and deletes it", async () => {
    const logged = await api("POST", "/meals/items", {
      body: {
        items: [
          { amount: 40, barcode: CHEESE, unit: "g" },
          { amount: 100, barcode: SOY_DRINK, unit: "ml" },
        ],
        label: "breakfast",
      },
      token: kira.accessToken,
    });
    const created = await api("POST", "/saved-meals", { body: { fromMealId: logged.body.meal.id, name: "Usual breakfast" }, token: kira.accessToken });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const saved = created.body.savedMeal;
    assert.equal(saved.itemCount, 2);
    assert.equal(Math.round(saved.totals.energyKcal), 115 + 31);

    const renamed = await api("PATCH", `/saved-meals/${saved.id}`, { body: { name: "Weekday breakfast" }, token: kira.accessToken });
    assert.equal(renamed.body.savedMeal.name, "Weekday breakfast");

    const loggedAgain = await api("POST", `/saved-meals/${saved.id}/log`, { body: { label: "snack" }, token: kira.accessToken });
    assert.equal(loggedAgain.status, 201);
    assert.equal(loggedAgain.body.meal.label, "snack");
    assert.equal(loggedAgain.body.meal.items.length, 2);
    assert.equal(loggedAgain.body.meal.items[0].brand, "Hacendado");

    const listed = await api("GET", "/saved-meals", { token: kira.accessToken });
    assert.equal(listed.body.savedMeals.length, 1);
    assert.equal((await api("GET", `/saved-meals/${saved.id}`, { token: other.accessToken })).status, 404);
    assert.equal((await api("DELETE", `/saved-meals/${saved.id}`, { token: kira.accessToken })).status, 204);
    assert.equal((await api("GET", "/saved-meals", { token: kira.accessToken })).body.savedMeals.length, 0);
  });

  it("saves a meal from items and replaces its items", async () => {
    const created = await api("POST", "/saved-meals", {
      body: { items: [{ amount: 20, barcode: CHEESE, unit: "g" }], name: "Cheese" },
      token: kira.accessToken,
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const replaced = await api("PATCH", `/saved-meals/${created.body.savedMeal.id}`, {
      body: { items: [{ amount: 50, name: "Apple", nutrimentsPer100g: { energyKcal100g: 52 }, unit: "g" }] },
      token: kira.accessToken,
    });
    assert.equal(replaced.body.savedMeal.items.length, 1);
    assert.equal(replaced.body.savedMeal.items[0].name, "Apple");
  });
});

describe("analyze", () => {
  it("drafts a barcode scan at one serving without writing to the diary", async () => {
    const before = await api("GET", "/diary", { token: other.accessToken });
    const result = await api("POST", "/log/analyze", { body: { barcode: CHEESE, source: "barcode" }, token: other.accessToken });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    const [item] = result.body.items;
    assert.equal(item.match, "barcode");
    assert.equal(item.amount, 20);
    assert.equal(Math.round(item.metrics.energyKcal), 57);
    assert.equal(item.foodId, CHEESE);
    const after = await api("GET", "/diary", { token: other.accessToken });
    assert.equal(after.body.day.meals.length, before.body.day.meals.length);
  });

  it("drafts a nutrition label as a saveable product", async () => {
    const uploadId = await uploadPng(other.accessToken);
    setRecognizer(async (input) => {
      assert.equal(input.source, "label");
      assert.equal(input.images.length, 1);
      return {
        foods: [{ amount: 30, brand: "Brand", name: "Granola", nutrimentsPer100g: { energyKcal100g: 450, proteins100g: 10 }, searchQueries: ["granola"], servingSize: "30 g", unit: "g" }],
      };
    });
    const result = await api("POST", "/log/analyze", { body: { source: "label", uploadIds: [uploadId] }, token: other.accessToken });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    const [item] = result.body.items;
    assert.equal(item.match, "label");
    assert.equal(item.saveable, true);
    assert.equal(item.servingSize, "30 g", "the printed serving travels with the draft so saving keeps it");
    assert.ok(item.servings.some((serving: { amount: number }) => serving.amount === 30));
    assert.equal(item.per100.energyKcal, 450);
    assert.equal(Math.round(item.metrics.energyKcal), 135);
  });

  it("grounds recognized foods in the catalog and keeps estimates for the rest", async () => {
    setRecognizer(async (input) => {
      assert.equal(input.source, "text");
      assert.equal(input.text, "two slices of cheese and a mystery stew");
      return {
        foods: [
          { amount: 40, name: "cheese slices", position: { x: 0.3, y: 0.6 }, searchQueries: ["processed cheese slices"], unit: "g" },
          { amount: 300, name: "Mystery stew", nutrimentsPer100g: { energyKcal100g: 90 }, position: { x: 0.7, y: 0.4 }, searchQueries: ["qqqqzzzz"], unit: "g" },
        ],
        note: "Portion of stew is a guess.",
      };
    });
    const result = await api("POST", "/log/analyze", {
      body: { source: "text", text: "two slices of cheese and a mystery stew" },
      token: other.accessToken,
    });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    const [cheese, stew] = result.body.items;
    assert.equal(cheese.match, "catalog");
    assert.equal(cheese.barcode, CHEESE);
    assert.equal(stew.match, "estimate");
    assert.equal(Math.round(stew.metrics.energyKcal), 270);
    assert.deepEqual(cheese.position, { x: 0.3, y: 0.6 }, "catalog matches keep where the food is in the photo");
    assert.deepEqual(stew.position, { x: 0.7, y: 0.4 });
    assert.equal(result.body.note, "Portion of stew is a guess.");

    const committed = await api("POST", "/meals/items", {
      body: {
        items: [
          { amount: cheese.amount, foodId: cheese.foodId, unit: cheese.unit },
          { amount: stew.amount, name: stew.name, nutrimentsPer100g: stew.nutrimentsPer100g, unit: stew.unit },
        ],
        label: "dinner",
      },
      token: other.accessToken,
    });
    assert.equal(committed.status, 201, JSON.stringify(committed.body));
    assert.equal(committed.body.meal.items.length, 2);
  });

  it("reports model failures and empty results", async () => {
    setRecognizer(async () => {
      throw new Error("model down");
    });
    const failed = await api("POST", "/log/analyze", { body: { source: "text", text: "pizza" }, token: other.accessToken });
    assert.equal(failed.status, 502);
    assert.equal(failed.body.error.code, "analysis_failed");

    setRecognizer(async () => ({ foods: [] }));
    const empty = await api("POST", "/log/analyze", { body: { source: "text", text: "nothing" }, token: other.accessToken });
    assert.equal(empty.status, 400);
  });

  it("only reads the caller's own uploads", async () => {
    const uploadId = await uploadPng(kira.accessToken);
    const result = await api("POST", "/log/analyze", { body: { source: "photo", uploadIds: [uploadId] }, token: other.accessToken });
    assert.equal(result.status, 404);
  });
});
