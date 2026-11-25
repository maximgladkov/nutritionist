import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { saveRecipe, showFoods, showRecipe } from "../assistant/displays.ts";
import { INFO_SECTIONS, myInfo } from "../assistant/my-info.ts";
import { prisma } from "../prisma.ts";
import { composeRecipe } from "../recipes.ts";
import { upsertMealItems } from "../meals.ts";
import { api, closeDatabase, installFakes, resetDatabase, seedGenericFood, seedOffProduct, signIn, type Session } from "./test/harness.ts";

const ITEMS = [
  { amount: 300, name: "Chicken", nutrimentsPer100g: { energyKcal100g: 200, proteins100g: 30 }, unit: "g" as const },
  { amount: 200, name: "Rice", nutrimentsPer100g: { energyKcal100g: 130, proteins100g: 3 }, unit: "g" as const },
];
const RECIPE = { items: ITEMS, minutes: 25, name: "Chicken rice", servings: 2, steps: ["Cook the rice.", "Fry the chicken."] };

let session: Session;
let other: Session;

beforeEach(async () => {
  installFakes();
  await resetDatabase();
  session = await signIn("cook@example.com");
  other = await signIn("other@example.com");
});
after(closeDatabase);

const create = async () => (await api("POST", "/recipes", { body: RECIPE, token: session.accessToken })).body.recipe;

describe("recipes", () => {
  it("are kept with their nutrition per serving, and only for their owner", async () => {
    const recipe = await create();
    assert.equal(recipe.perServing.energyKcal, 430);
    assert.equal(recipe.perServing.proteins, 48);
    assert.deepEqual(recipe.steps, RECIPE.steps);
    const list = (await api("GET", "/recipes", { token: session.accessToken })).body.recipes;
    assert.deepEqual(list, [recipe]);
    assert.deepEqual((await api("GET", "/recipes", { token: other.accessToken })).body.recipes, []);
    for (const [method, path] of [["GET", ""], ["DELETE", ""], ["POST", "/log"]] as const) {
      const body = method === "POST" ? { label: "lunch" } : undefined;
      assert.equal((await api(method, `/recipes/${recipe.id}${path}`, { body, token: other.accessToken })).status, 404);
    }
    assert.equal((await api("GET", "/recipes")).status, 401);
  });

  it("log as many servings as were eaten", async () => {
    const recipe = await create();
    const { body, status } = await api("POST", `/recipes/${recipe.id}/log`, { body: { label: "dinner", servings: 0.5 }, token: session.accessToken });
    assert.equal(status, 201, JSON.stringify(body));
    assert.deepEqual(body.meal.items.map((item: { amount: number }) => item.amount).sort(), [50, 75]);
    assert.equal(Math.round(body.meal.totals.energyKcal), 215);
  });

  it("can be deleted, leaving what was logged", async () => {
    const recipe = await create();
    await api("POST", `/recipes/${recipe.id}/log`, { body: { label: "dinner" }, token: session.accessToken });
    assert.equal((await api("DELETE", `/recipes/${recipe.id}`, { token: session.accessToken })).status, 204);
    assert.equal((await api("GET", `/recipes/${recipe.id}`, { token: session.accessToken })).status, 404);
    assert.equal(await prisma.mealItem.count({ where: { meal: { userId: session.userId } } }), 2);
  });
});

describe("a suggested recipe", () => {
  it("is saved once, by its own person, and only when asked", async () => {
    const recipe = await composeRecipe(RECIPE);
    const display = await showRecipe({ callId: "r", recipe, sessionId: "s", userId: session.userId });
    assert.equal(await prisma.recipe.count(), 0);
    const path = `/assistant/displays/${display.id}/save`;
    assert.equal((await api("POST", path, { token: other.accessToken })).status, 404);
    const [a, b] = await Promise.all([api("POST", path, { token: session.accessToken }), api("POST", path, { token: session.accessToken })]);
    assert.deepEqual([a.status, b.status], [200, 200]);
    assert.equal(await prisma.recipe.count(), 1);
    const again = await saveRecipe({ id: display.id, userId: session.userId });
    const saved = await prisma.recipe.findFirstOrThrow();
    assert.equal(again?.display.kind === "recipe" && again.display.recipeId, saved.id);
    assert.equal(saved.name, "Chicken rice");
  });
});

describe("foods and recipes in the conversation", () => {
  it("come in their own field, so older apps never meet them", async () => {
    await seedOffProduct({ barcode: "5449000000996", name: "Cola", nutriments: { energyKcal100ml: 42, proteins100ml: 0 } });
    await seedGenericFood({ id: "usda:1", name: "Egg", nutriments: { energyKcal100g: 143, proteins100g: 12.6 } });
    const shown = await showFoods({ callId: "f", foods: [{ amount: 50, id: "usda:1" }, { id: "usda:404" }], sessionId: "s1", userId: session.userId });
    assert.deepEqual(shown.missing, ["usda:404"]);
    assert.ok(shown.display?.kind === "foods");
    assert.equal(shown.display.foods[0]?.name, "Egg");
    assert.equal(shown.display.foods[0]?.favoriteKey, "n:egg");
    assert.equal(Math.round(shown.display.foods[0]?.metrics.energyKcal ?? 0), 72);
    const at = new Date().toISOString();
    await prisma.agentTurn.create({
      data: {
        channel: "app",
        messages: { items: [{ at, text: "Eggs?", type: "user" }, { at, callId: "f", stepIndex: 0, toolName: "show_foods", type: "tool" }], steps: [] },
        sessionId: "s1",
        startedAt: new Date(),
        status: "completed",
        turnId: "t",
        turnSequence: 0,
        userId: session.userId,
      },
    });
    const [turn] = (await api("GET", "/assistant/conversation", { token: session.accessToken })).body.turns;
    assert.deepEqual(turn.cards, []);
    assert.deepEqual(turn.displays, [shown.display]);
  });

  it("shows nothing when none of the foods exist", async () => {
    const shown = await showFoods({ callId: "f", foods: [{ id: "usda:404" }], sessionId: "s1", userId: session.userId });
    assert.equal(shown.display, null);
  });
});

describe("what the agent can read", () => {
  it("is every section, all of it the person's own", async () => {
    const group = (await api("POST", "/groups", { body: { name: "Fit" }, token: other.accessToken })).body.group;
    await prisma.groupMember.create({ data: { groupId: group.id, role: "member", userId: session.userId } });
    const third = await signIn("third@example.com");
    await prisma.groupMember.create({ data: { groupId: group.id, role: "member", userId: third.userId } });
    const note = (toUserId: string, body: string) => prisma.groupMessage.create({ data: { body, fromUserId: other.userId, groupId: group.id, toUserId } });
    await note(session.userId, "For me");
    await note(third.userId, "Not for me");
    await create();
    await upsertMealItems({ items: [ITEMS[0]!], label: "lunch", userId: session.userId });
    await api("PATCH", "/me", { body: { birthDate: "1990-06-15", heightCm: 170 }, token: session.accessToken });
    await api("POST", "/me/weights", { body: { weightKg: 70 }, token: session.accessToken });

    const info = await myInfo(session.userId, INFO_SECTIONS, new Date("2026-03-10T12:00:00Z"));
    assert.deepEqual(Object.keys(info).sort(), [...INFO_SECTIONS].sort());
    const profile = info.profile as { age: number; currentWeightKg: number; heightCm: number };
    assert.deepEqual([profile.age, profile.heightCm, profile.currentWeightKg], [35, 170, 70]);
    assert.deepEqual((info.coach_comments as { text: string }[]).map((row) => row.text), ["For me"]);
    assert.deepEqual((info.recipes as { name: string }[]).map((row) => row.name), ["Chicken rice"]);
    const everything = JSON.stringify(info);
    for (const secret of ["Not for me", "@example.com", third.userId, other.userId, group.id]) {
      assert.ok(!everything.includes(secret), secret);
    }
    const theirs = JSON.stringify(await myInfo(third.userId, INFO_SECTIONS, new Date()));
    assert.ok(!theirs.includes("For me\"") && !theirs.includes("Chicken rice"));
  });

  it("loses the coach's comments when the person leaves the group", async () => {
    const group = (await api("POST", "/groups", { body: { name: "Fit" }, token: other.accessToken })).body.group;
    const member = await prisma.groupMember.create({ data: { groupId: group.id, role: "member", userId: session.userId } });
    await prisma.groupMessage.create({ data: { body: "Hi", fromUserId: other.userId, groupId: group.id, toUserId: session.userId } });
    await prisma.groupMember.delete({ where: { id: member.id } });
    assert.deepEqual((await myInfo(session.userId, ["coach_comments", "groups"], new Date())).coach_comments, []);
  });
});
