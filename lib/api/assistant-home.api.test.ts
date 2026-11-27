import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { HOME_DAILY_RUNS, openingNotes, type HomeMessage } from "../assistant/home-message.ts";
import { dayInWords, mealNamed, namesWrongMeal, nextMeal } from "../assistant/home-day.ts";
import { acceptWords, numbersIn, type HomeWords, type HomeWordsInput } from "../assistant/home-words.ts";
import { upsertMealItems } from "../meals.ts";
import { prisma } from "../prisma.ts";
import { setApiDeps } from "./deps.ts";
import { api, closeDatabase, installFakes, resetDatabase, signIn, type Session } from "./test/harness.ts";

const CHICKEN = { amount: 150, name: "Chicken", nutrimentsPer100g: { energyKcal100g: 200, proteins100g: 30 }, unit: "g" as const };
const START = Date.parse("2026-03-10T14:00:00Z");

let session: Session;
let other: Session;
let calls: HomeWordsInput[];
let minutes = 0;

beforeEach(async () => {
  installFakes();
  await resetDatabase();
  session = await signIn("assistant@example.com");
  other = await signIn("other@example.com");
  await prisma.user.update({ data: { name: "Kira Petrova" }, where: { id: session.userId } });
  calls = [];
  at(0);
});
after(closeDatabase);

function at(later: number): Date {
  minutes = later;
  const now = new Date(START + later * 60_000);
  setApiDeps({ now: () => now });
  return now;
}

function model(write: (input: HomeWordsInput) => HomeWords[]) {
  setApiDeps({
    async writeHome(input) {
      calls.push(input);
      return write(input);
    },
  });
}

const three = (input: HomeWordsInput) =>
  input.facts.slice(0, 3).map((text, fact) => {
    const figure = /\d[\d,]*/u.exec(text)?.[0] ?? "nothing";
    return { fact, text: `Kira, here is thought ${"abc"[fact]} of call ${"abcdefghi"[calls.length]}: ${figure}.` };
  });

async function message(): Promise<HomeMessage> {
  const { body, status } = await api("GET", "/assistant/message", { token: session.accessToken });
  assert.equal(status, 200, JSON.stringify(body));
  return body.message;
}
const open = (id: string, token = session.accessToken) => api("POST", `/assistant/message/${id}/open`, { token });
const eat = () => upsertMealItems({ eatenAt: new Date(START + minutes * 60_000), items: [CHICKEN], label: "lunch", userId: session.userId });
const goals = () => api("PUT", "/me/goals", { body: { caloriesPerDay: 1600, proteinGPerDay: 120 }, token: session.accessToken });

describe("home message", () => {
  it("says something true with the name when the model can't", async () => {
    await goals();
    await eat();
    assert.match((await message()).text, /^Kira, you still need 75 grams of protein\.$/);
    assert.equal((await api("GET", "/assistant/message")).status, 401);
  });

  it("says it in the app's language when the model can't", async () => {
    await goals();
    await eat();
    const spanish = await api("GET", "/assistant/message", { headers: { "accept-language": "es" }, token: session.accessToken });
    assert.equal(spanish.body.message.text, "Kira, aún te faltan 75 gramos de proteína.");
    // Another language is another message, not the Spanish one already shown.
    const russian = await api("GET", "/assistant/message", { headers: { "accept-language": "ru" }, token: session.accessToken });
    assert.match(russian.body.message.text, /^Kira, [а-яё]/u);
    const french = await api("GET", "/assistant/message", { headers: { "accept-language": "fr" }, token: session.accessToken });
    assert.equal(french.body.message.text, "Kira, il te faut encore 75 grammes de protéines.");
  });

  it("says it in Italian when the model can't", async () => {
    // Its own test: a fourth language in a row is ranked after the facts already shown.
    await goals();
    await eat();
    const italian = await api("GET", "/assistant/message", { headers: { "accept-language": "it" }, token: session.accessToken });
    assert.equal(italian.body.message.text, "Kira, ti servono ancora 75 grammi di proteine.");
  });

  it("says it in Portuguese when the model can't", async () => {
    // Its own test too, for the same reason.
    await goals();
    await eat();
    const portuguese = await api("GET", "/assistant/message", { headers: { "accept-language": "pt-BR" }, token: session.accessToken });
    assert.equal(portuguese.body.message.text, "Kira, você ainda precisa de 75 gramas de proteínas.");
  });

  it("says it in Dutch when the model can't", async () => {
    // Its own test too, for the same reason.
    await goals();
    await eat();
    const dutch = await api("GET", "/assistant/message", { headers: { "accept-language": "nl-NL" }, token: session.accessToken });
    assert.equal(dutch.body.message.text, "Kira, je hebt nog 75 gram eiwit nodig.");
  });

  it("says it in Polish when the model can't", async () => {
    // Its own test too, for the same reason.
    await goals();
    await eat();
    const polish = await api("GET", "/assistant/message", { headers: { "accept-language": "pl-PL" }, token: session.accessToken });
    assert.equal(polish.body.message.text, "Kira, potrzebujesz jeszcze 75 g białka.");
  });

  it("says it in Turkish when the model can't", async () => {
    // Its own test too, for the same reason.
    await goals();
    await eat();
    const turkish = await api("GET", "/assistant/message", { headers: { "accept-language": "tr-TR" }, token: session.accessToken });
    assert.equal(turkish.body.message.text, "Kira, bugün 75 g protein daha alman gerekiyor.");
  });

  it("says it in Ukrainian when the model can't", async () => {
    // Its own test too, for the same reason.
    await goals();
    await eat();
    const ukrainian = await api("GET", "/assistant/message", { headers: { "accept-language": "uk-UA" }, token: session.accessToken });
    assert.equal(ukrainian.body.message.text, "Kira, тобі ще треба 75 г білків.");
  });

  it("gives the model only facts, the name and the time, and shows its words", async () => {
    model(three);
    await goals();
    await eat();
    assert.match((await message()).text, /^Kira, here is thought a of call b: /);
    assert.equal(calls[0]!.name, "Kira");
    assert.match(calls[0]!.localTime, /^Tuesday, \d+:\d\d$/);
    assert.ok(calls[0]!.facts.some((fact) => fact.includes("so 75 grams are left to eat")));
    assert.ok(!JSON.stringify(calls[0]).includes("assistant@example.com"));
  });

  it("writes in the app's language until they've written something to follow", async () => {
    model(three);
    await goals();
    await eat();
    const spanish = await api("GET", "/assistant/message", { headers: { "accept-language": "es" }, token: session.accessToken });
    assert.equal(spanish.status, 200, JSON.stringify(spanish.body));
    assert.equal(calls.at(-1)!.language, "Spanish");

    // English is what it wrote anyway, so nothing changes for it.
    at(60 * 24);
    await eat();
    await api("GET", "/assistant/message", { headers: { "accept-language": "en" }, token: session.accessToken });
    assert.equal(calls.at(-1)!.language, null);
  });

  it("follows the language they write in, or chose, over the app's", async () => {
    model(three);
    await goals();
    await eat();
    await prisma.userProfile.upsert({
      create: { preferences: { assistant: { language: "ru" } }, userId: session.userId },
      update: { preferences: { assistant: { language: "ru" } } },
      where: { userId: session.userId },
    });
    await api("GET", "/assistant/message", { headers: { "accept-language": "es" }, token: session.accessToken });
    assert.equal(calls.at(-1)!.language, "Russian");
  });

  it("stays while they're here, then moves on without another call", async () => {
    model(three);
    await goals();
    await eat();
    const first = await message();
    at(10);
    assert.deepEqual(await message(), first);
    at(35);
    assert.deepEqual(await message(), first);
    at(70);
    const second = await message();
    assert.match(second.text, /thought b/);
    assert.equal(calls.length, 1);
  });

  it("never shows a prepared message whose figures have changed", async () => {
    model(three);
    await goals();
    await eat();
    await message();
    at(40);
    await eat();
    const next = await message();
    const row = await prisma.assistantAction.findUniqueOrThrow({ where: { id: next.id } });
    assert.ok(!(row.payload as { fact: string }).fact.includes("75 grams are left"));
  });

  it("doesn't change at every food of a meal unless it stopped being true", async () => {
    model(three);
    const first = await message();
    at(2);
    await goals();
    await eat();
    const next = await message();
    const row = await prisma.assistantAction.findUniqueOrThrow({ where: { id: first.id } });
    if ((row.payload as { key: string }).key === "empty") assert.notEqual(next.id, first.id);
    assert.equal(calls.length, 1);
  });

  it("rejects a number that isn't in the fact, a missing name, markup and an unknown fact", () => {
    const facts = ["1,234 kcal left today; 75 grams of protein."];
    const ok = (text: string, fact = 0) => acceptWords({ fact, text }, facts, "Kira", true);
    assert.equal(ok("Kira, 1234 kcal left and 75 g of protein."), "Kira, 1234 kcal left and 75 g of protein.");
    assert.equal(ok("Kira, 1.234 kcal left today."), "Kira, 1.234 kcal left today.");
    assert.equal(ok("Kira, about 1,200 kcal left today."), null);
    assert.equal(ok("Kira, seven days in a row, well done."), null);
    assert.equal(ok("Кира, осталось семь граммов белка."), null);
    assert.equal(ok("Кира, осталось 75 граммов белка."), "Кира, осталось 75 граммов белка.");
    assert.equal(ok("Осталось 75 граммов белка."), null);
    // As seen: no figure, no name, and the opposite of what was true.
    assert.equal(ok("Вы уже почти все на сегодня распределили, так что вечером есть куда вписаться."), null);
    assert.equal(ok("Kira, almost everything is set for today."), null);
    assert.equal(ok("Кира, на сегодня осталось 1 234 ккал."), "Кира, на сегодня осталось 1 234 ккал.");
    assert.equal(ok("You have 1,234 kcal left today."), null);
    assert.equal(ok("Kira, **75** grams to go."), null);
    assert.equal(ok("Kira, 75 grams to go.", 4), null);
    assert.equal(ok(`Kira, ${"more ".repeat(40)}`), null);
    assert.deepEqual(numbersIn("0.8 kg, 0,8 kg, 12,345"), ["0.8", "0.8", "12345"]);
  });

  it("falls back when the model invents something or fails, and stops after the day's calls", async () => {
    await goals();
    await eat();
    model(() => [{ fact: 0, text: "Kira, you have 999 kcal left for dinner." }]);
    assert.ok(!(await message()).text.includes("999"));
    setApiDeps({
      async writeHome(input) {
        calls.push(input);
        throw new Error("timeout");
      },
    });
    for (let visit = 1; visit <= HOME_DAILY_RUNS + 2; visit += 1) {
      at(visit * 31);
      assert.match((await message()).text, /^Kira, /);
    }
    assert.equal(calls.length, HOME_DAILY_RUNS);
  });

  it("doesn't say the same kind of thing twice in a row", async () => {
    await goals();
    await eat();
    const keys: string[] = [];
    for (let visit = 0; visit < 4; visit += 1) {
      at(visit * 31);
      const row = await prisma.assistantAction.findUniqueOrThrow({ where: { id: (await message()).id } });
      keys.push((row.payload as { key: string }).key);
    }
    for (let index = 1; index < keys.length; index += 1) assert.notEqual(keys[index], keys[index - 1]);
  });

  it("knows which meals they've had and what comes next", () => {
    assert.equal(nextMeal(16, new Set(["breakfast", "lunch", "snack"])), "dinner");
    assert.equal(nextMeal(9, new Set()), "breakfast");
    assert.equal(nextMeal(12, new Set()), "lunch");
    assert.equal(nextMeal(10, new Set(["breakfast"])), "lunch");
    assert.equal(nextMeal(13, new Set(["lunch"])), "dinner");
    assert.equal(nextMeal(19, new Set(["dinner"])), null);
    assert.equal(nextMeal(23, new Set()), null);
    assert.equal(mealNamed("Мой завтрак"), "breakfast");
    assert.equal(mealNamed("Breakfast"), "breakfast");
    assert.equal(mealNamed("Lemon chicken"), null);
    // As seen, in the afternoon with breakfast logged.
    assert.equal(namesWrongMeal("Maxim, 1298 ккал осталось на сегодня. Твой сохранённый завтрак на 1156 ккал сюда спокойно влезет.", "dinner"), true);
    assert.equal(namesWrongMeal("Maxim, 1298 ккал осталось. Хочешь идею для ужина?", "dinner"), false);
    assert.equal(namesWrongMeal("Maxim, завтра продолжим. Это победа.", "dinner"), false);
    assert.equal(namesWrongMeal("Kira, dinner's next.", null), true);
    assert.match(dayInWords([{ at: { hour: 9, minute: 6 }, foods: ["Eggs"], label: "breakfast" }], "dinner"), /breakfast at 9:06 \(Eggs\)\. Next main meal: dinner/);
  });

  it("doesn't offer a saved breakfast in the afternoon, a whole day's food, or what they've just had", async () => {
    model(three);
    await goals();
    await eat();
    const save = (name: string, food: string, amount: number) =>
      prisma.savedMeal.create({
        data: { items: { create: [{ amount, name: food, nutrimentsPer100g: { energyKcal100g: 200, proteins100g: 30 }, sortOrder: 0, unit: "g" }] }, name, userId: session.userId },
      });
    await save("Breakfast", "Eggs", 100);
    await save("Feast", "Beef", 500);
    await save("Usual bowl", "Chicken", 150);
    await message();
    assert.ok(!calls[0]!.facts.some((fact) => fact.includes("saved meal")), calls[0]!.facts.join("\n"));
    assert.match(calls[0]!.day, /lunch at .*Chicken.*Next main meal: dinner/);
    await save("Salmon", "Salmon", 150);
    at(40);
    await eat();
    at(45);
    await message();
    at(80);
    await prisma.assistantAction.deleteMany({ where: { state: "ready" } });
    await message();
    assert.ok(calls.at(-1)!.facts.some((fact) => fact.includes('saved meal "Salmon" (Salmon) fits for dinner')), calls.at(-1)!.facts.join("\n"));
  });

  it("asks rather than praises when hardly anything is logged by evening", async () => {
    await goals();
    at(8 * 60);
    await eat();
    assert.equal((await message()).text, "Kira, only 300 kcal is logged today. Is anything missing?");
  });
});

describe("a flagged day", () => {
  // 250 g of cheese: 83 g of fat, over the 62 g that fits 1,600 kcal.
  const CHEESE = { amount: 250, name: "Cheese", nutrimentsPer100g: { energyKcal100g: 400, fat100g: 33, proteins100g: 25 }, unit: "g" as const };
  const cheese = () => upsertMealItems({ eatenAt: new Date(START + minutes * 60_000), items: [CHEESE], label: "lunch", userId: session.userId });
  const keyOf = async (id: string) => ((await prisma.assistantAction.findUniqueOrThrow({ where: { id } })).payload as { key: string }).key;

  it("says fat is over the limit, with what to do, before any tip", async () => {
    await goals();
    await cheese();
    assert.equal(
      (await message()).text,
      "Kira, fat is at 83 g of a 62 g limit today. For dinner, go lean: chicken or fish with vegetables, nothing fried or creamy.",
    );
  });

  it("gives the model the flag first and shows its words about it, even when it puts another first", async () => {
    model((input) => [
      { fact: 1, text: `Kira, a tip about ${/\d[\d,]*/u.exec(input.facts[1]!)?.[0]}.` },
      { fact: 0, text: "Kira, fat is at 83 of 62 g today. Go lean for dinner: fish and vegetables." },
    ]);
    await goals();
    await cheese();
    const shown = await message();
    assert.match(calls[0]!.facts[0]!, /^Fat today: 83 g of a 62 g limit/);
    assert.equal(shown.text, "Kira, fat is at 83 of 62 g today. Go lean for dinner: fish and vegetables.");
  });

  it("says the flag in plain words when the model skips it", async () => {
    model((input) => [{ fact: 1, text: `Kira, a tip about ${/\d[\d,]*/u.exec(input.facts[1]!)?.[0]}.` }]);
    await goals();
    await cheese();
    assert.match((await message()).text, /^Kira, fat is at 83 g of a 62 g limit today\./);
  });

  it("keeps to flags on later visits, not prepared tips", async () => {
    model(three);
    await goals();
    await cheese();
    assert.equal(await keyOf((await message()).id), "over:fat");
    for (const visit of [1, 2, 3]) {
      at(visit * 31);
      assert.match(await keyOf((await message()).id), /^(over|near):|^protein_low$/);
    }
  });

  it("is said even to someone who turned reminders and ideas off", async () => {
    await prisma.userProfile.upsert({
      create: { preferences: { assistant: { homeTopics: ["cheer"] } }, userId: session.userId },
      update: { preferences: { assistant: { homeTopics: ["cheer"] } } },
      where: { userId: session.userId },
    });
    await goals();
    await cheese();
    assert.equal(await keyOf((await message()).id), "over:fat");
  });
});

describe("a home message they tapped", () => {
  const conversation = async (query = "") => (await api("GET", `/assistant/conversation${query}`, { token: session.accessToken })).body;

  it("joins the conversation once, and only theirs", async () => {
    const shown = await message();
    assert.deepEqual((await conversation()).openers, []);
    assert.equal((await open(shown.id, other.accessToken)).status, 404);
    at(1);
    const { body } = await open(shown.id);
    at(5);
    assert.deepEqual((await open(shown.id)).body, body);
    assert.deepEqual((await conversation()).openers, [{ at: new Date(START + 60_000).toISOString(), id: shown.id, text: shown.text }]);
    assert.equal((await conversation(`?before=${new Date(START).toISOString()}`)).openers.length, 0);
  });

  it("makes way for another on the next look", async () => {
    const shown = await message();
    await open(shown.id);
    assert.notEqual((await message()).id, shown.id);
  });

  it("is told to the agent and to a call, with its facts, until it has answered", async () => {
    const shown = await message();
    assert.deepEqual(await openingNotes(session.userId, at(1)), []);
    await open(shown.id);
    const notes = await openingNotes(session.userId, at(2));
    assert.equal(notes.length, 1);
    assert.ok(notes[0]!.includes(JSON.stringify(shown.text)) && notes[0]!.startsWith("[App note, not from the user"));
    const talk = await api("POST", "/assistant/talk", { token: session.accessToken });
    assert.ok(talk.body.instructions.endsWith(notes[0]!));
    const turn = (status: "completed" | "failed", id: string) =>
      prisma.agentTurn.create({
        data: { channel: "app", messages: { items: [], steps: [] }, sessionId: "s", startedAt: new Date(START + 180_000), status, turnId: id, turnSequence: 0, userId: session.userId },
      });
    await turn("failed", "t1");
    assert.equal((await openingNotes(session.userId, at(4))).length, 1);
    await turn("completed", "t2");
    assert.deepEqual(await openingNotes(session.userId, at(4)), []);
    assert.deepEqual(await openingNotes(other.userId, at(4)), []);
  });

  it("can't open what was never shown", async () => {
    model(three);
    await goals();
    await eat();
    await message();
    const waiting = await prisma.assistantAction.findFirstOrThrow({ where: { state: "ready" } });
    assert.equal((await open(waiting.id)).status, 404);
  });
});
