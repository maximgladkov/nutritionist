import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { HOME_DAILY_RUNS, openingNotes, type HomeMessage } from "../assistant/home-message.ts";
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
    assert.match((await message()).text, /^Kira, you still need 75 grams of protein\. Chicken covers most of it\.$/);
    assert.equal((await api("GET", "/assistant/message")).status, 401);
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

  it("asks rather than praises when hardly anything is logged by evening", async () => {
    await goals();
    at(8 * 60);
    await eat();
    assert.equal((await message()).text, "Kira, only 300 kcal is logged today. Is anything missing?");
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
