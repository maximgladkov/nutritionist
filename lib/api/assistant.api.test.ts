import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { turnChannel } from "../agent-turn-model.ts";
import { recordIdea, recordLogged, withItemIds } from "../assistant/actions.ts";
import { ASSISTANT_BURST, assistantLimit } from "../assistant/limits.ts";
import { loadConversation } from "../assistant/conversation.ts";
import { coverage } from "../assistant/home-card.ts";
import { TALK_HOURLY_CALLS } from "../assistant/talk.ts";
import { copyMeal, upsertMealItems } from "../meals.ts";
import { prisma } from "../prisma.ts";
import { resolveReachTarget } from "../reminders.ts";
import { setApiDeps } from "./deps.ts";
import { api, closeDatabase, installFakes, resetDatabase, signIn, talkSetup, type Session } from "./test/harness.ts";

const CHICKEN = { amount: 150, name: "Chicken", nutrimentsPer100g: { energyKcal100g: 200, proteins100g: 30 }, unit: "g" as const };
const POTATO = { amount: 100, name: "Potatoes", nutrimentsPer100g: { energyKcal100g: 80, proteins100g: 2 }, unit: "g" as const };

let session: Session;
let other: Session;

beforeEach(async () => {
  installFakes();
  await resetDatabase();
  session = await signIn("assistant@example.com");
  other = await signIn("other@example.com");
});
after(closeDatabase);

async function turn(input: { at: Date; channel?: string; id: string; items?: object[]; status?: "completed" | "failed" | "running"; userId?: string }) {
  await prisma.agentTurn.create({
    data: {
      channel: input.channel ?? "app",
      messages: { items: input.items ?? [{ at: input.at.toISOString(), text: `Question ${input.id}`, type: "user" }], steps: [] },
      sessionId: "s1",
      startedAt: input.at,
      status: input.status ?? "completed",
      turnId: input.id,
      turnSequence: 0,
      userId: input.userId ?? session.userId,
    },
  });
}

async function logged(callId = "call-log") {
  const items = withItemIds([CHICKEN, POTATO]);
  const meal = await upsertMealItems({ items, label: "lunch", userId: session.userId });
  return (await recordLogged({ addedItemIds: items.map((item) => item.id), callId, meal, sessionId: "s1", userId: session.userId }))!;
}

function itemNames(): Promise<string[]> {
  return prisma.mealItem
    .findMany({ orderBy: { name: "asc" }, where: { meal: { userId: session.userId } } })
    .then((rows) => rows.map((row) => row.name));
}

describe("assistant conversation", () => {
  it("shows the app's turns, oldest first, and nobody else's", async () => {
    const now = Date.now();
    await turn({ at: new Date(now - 2000), id: "t2" });
    await turn({ at: new Date(now - 3000), id: "t1" });
    await turn({ at: new Date(now - 1000), channel: "telegram", id: "t3" });
    await turn({ at: new Date(now - 1000), id: "t4", userId: other.userId });
    const { body, status } = await api("GET", "/assistant/conversation", { token: session.accessToken });
    assert.equal(status, 200, JSON.stringify(body));
    assert.deepEqual(body.turns.map((row: { text: string }) => row.text), ["Question t1", "Question t2"]);
    assert.equal(body.next, null);
    assert.equal((await api("GET", "/assistant/conversation")).status, 401);
  });

  it("keeps the answer, what was checked, the card and the voice note, and drops narration", async () => {
    const card = await logged();
    const at = new Date();
    await api("POST", "/assistant/voice-notes", {
      body: { durationMs: 4000, id: "v1", levels: [0.2, 0.8], sessionId: "s1", text: "Log lunch" },
      token: session.accessToken,
    });
    const tool = { at: at.toISOString(), stepIndex: 0, type: "tool" };
    await turn({
      at,
      id: "t1",
      items: [
        { at: at.toISOString(), text: "Log lunch", type: "user" },
        { at: at.toISOString(), finishReason: "tool-calls", stepIndex: 0, text: "Let me look", type: "assistant" },
        { ...tool, callId: "c0", toolName: "get_my_goals" },
        { ...tool, callId: "c1", isError: true, toolName: "list_meals" },
        { ...tool, callId: "call-log", toolName: "log_meal" },
        { at: at.toISOString(), finishReason: "stop", stepIndex: 1, text: "Done.", type: "assistant" },
      ],
    });
    const { body } = await api("GET", "/assistant/conversation", { token: session.accessToken });
    const [shown] = body.turns;
    assert.equal(shown.reply, "Done.");
    assert.deepEqual(shown.checked, ["Goals"]);
    assert.deepEqual(shown.voice, { durationMs: 4000, levels: [0.2, 0.8] });
    assert.deepEqual(shown.cards, [card]);
    assert.equal(card.kcal, 380);
  });

  it("pages back, and marks a reply that never finished as failed", async () => {
    const start = Date.now() - 3_600_000;
    for (let index = 0; index < 32; index += 1) {
      await turn({ at: new Date(start + index * 1000), id: `t${index}`, status: "running" });
    }
    const first = (await api("GET", "/assistant/conversation", { token: session.accessToken })).body;
    assert.equal(first.turns.length, 30);
    assert.equal(first.turns[0].text, "Question t2");
    assert.equal(first.turns[0].status, "failed");
    const older = (await api("GET", `/assistant/conversation?before=${encodeURIComponent(first.next)}`, { token: session.accessToken })).body;
    assert.deepEqual(older.turns.map((row: { text: string }) => row.text), ["Question t0", "Question t1"]);
    assert.equal(older.greeting, null);
  });

  it("continues the latest app session, not a web, old or foreign one", async () => {
    const now = new Date("2026-12-10T12:00:00Z");
    const sessionId = async () => (await loadConversation({ now, userId: session.userId })).sessionId;
    await prisma.agentSession.createMany({
      data: [
        { channel: "web", eveSessionId: "web", userId: session.userId },
        { channel: "app", eveSessionId: "theirs", userId: other.userId },
        { channel: "app", createdAt: new Date(now.getTime() - 26 * 86_400_000), eveSessionId: "old", userId: session.userId },
        { channel: "app", createdAt: new Date("2026-11-25T12:00:00Z"), eveSessionId: "before eve 1.0", userId: session.userId },
      ],
    });
    assert.equal(await sessionId(), null);
    await prisma.agentSession.create({ data: { channel: "app", createdAt: now, eveSessionId: "mine", userId: session.userId } });
    assert.equal(await sessionId(), "mine");
    // Nor does the app's session take check-ins away from the web one.
    assert.deepEqual(await resolveReachTarget(session.userId), { channel: "web", sessionId: "web" });
  });

  it("shows a question the coach asked, and their answer as the next exchange", async () => {
    const question = { callId: "q", input: { options: [{ description: "Midday.", label: "Lunch" }], question: "Which meal is it?" }, stepIndex: 0, toolName: "ask_question", type: "tool" };
    const save = (items: unknown[]) =>
      prisma.agentTurn.upsert({
        create: { channel: "app", messages: { items, steps: [] } as object, sessionId: "s1", startedAt: new Date(), status: "running", turnId: "ask", turnSequence: 0, userId: session.userId },
        update: { messages: { items, steps: [] } as object },
        where: { sessionId_turnId: { sessionId: "s1", turnId: "ask" } },
      });
    const shown = async () =>
      (await loadConversation({ now: new Date(), userId: session.userId })).turns.map((turn) => [turn.text, turn.reply, turn.status, turn.question]);
    await save([{ text: "Log the soup", type: "user" }, question]);
    assert.deepEqual(await shown(), [["Log the soup", "Which meal is it?", "completed", { multiple: false, options: [{ description: "Midday.", label: "Lunch" }] }]]);
    const answered = { ...question, output: { answer: "Dinner", status: "answered" } };
    const reply = { finishReason: "stop", text: "Logged.", type: "assistant" };
    await save([{ text: "Log the soup", type: "user" }, answered, reply]);
    assert.deepEqual(await shown(), [["Log the soup", "Which meal is it?", "completed", null], ["Dinner", "Logged.", "running", null]]);
  });

  it("greets once a day, with what was left at the time", async () => {
    await api("PUT", "/me/goals", { body: { caloriesPerDay: 1600, proteinGPerDay: 120 }, token: session.accessToken });
    await logged();
    const read = async () => (await api("GET", "/assistant/conversation", { token: session.accessToken })).body.greeting;
    const first = await read();
    assert.match(first.text, /Lunch is logged: \*\*380 kcal\*\*\. Here's what's left for today\./);
    assert.deepEqual(first.remaining, { energyKcal: 1220, proteins: 73 });
    await logged("call-2");
    assert.deepEqual(await read(), first);
  });

  it("won't attach a voice note to someone else's conversation", async () => {
    await prisma.agentSession.create({ data: { channel: "app", eveSessionId: "theirs", userId: other.userId } });
    const sent = await api("POST", "/assistant/voice-notes", {
      body: { durationMs: 1, id: "v", levels: [], sessionId: "theirs", text: "hi" },
      token: session.accessToken,
    });
    assert.equal(sent.status, 404);
  });
});

describe("assistant cards", () => {
  it("logs an idea only when it's added, and only once", async () => {
    const { card, proteins } = await recordIdea({ callId: "c", items: [CHICKEN, POTATO], label: "lunch", sessionId: "s1", userId: session.userId });
    assert.equal(card.kcal, 380);
    assert.equal(proteins, 47);
    assert.deepEqual(await itemNames(), []);
    const path = `/assistant/cards/${card.id}/add`;
    assert.equal((await api("POST", path, { token: other.accessToken })).status, 404);
    const [a, b] = await Promise.all([api("POST", path, { token: session.accessToken }), api("POST", path, { token: session.accessToken })]);
    assert.equal(a.body.card.state, "added", JSON.stringify(a.body));
    assert.equal(b.body.card.state, "added");
    assert.deepEqual(await itemNames(), ["Chicken", "Potatoes"]);
  });

  it("leaves an idea open when it couldn't be logged", async () => {
    const { card } = await recordIdea({ callId: "c", items: [CHICKEN], label: "lunch", sessionId: "s1", userId: session.userId });
    await prisma.assistantAction.update({ data: { payload: { inputs: [], items: [], kcal: null, label: "lunch" } }, where: { id: card.id } });
    assert.equal((await api("POST", `/assistant/cards/${card.id}/add`, { token: session.accessToken })).status, 400);
    assert.equal((await prisma.assistantAction.findUnique({ where: { id: card.id } }))?.state, "open");
  });

  it("undoes only its own foods, even when some are already gone", async () => {
    await upsertMealItems({ items: [{ ...POTATO, name: "Soup" }], label: "lunch", userId: session.userId });
    const card = await logged();
    const chicken = await prisma.mealItem.findFirstOrThrow({ where: { name: "Chicken" } });
    await api("DELETE", `/meal-items/${chicken.id}`, { token: session.accessToken });
    const path = `/assistant/cards/${card.id}/undo`;
    assert.equal((await api("POST", path, { token: other.accessToken })).status, 404);
    assert.equal((await api("POST", path, { token: session.accessToken })).body.card.state, "undone");
    assert.equal((await api("POST", path, { token: session.accessToken })).status, 200);
    assert.deepEqual(await itemNames(), ["Soup"]);
  });

  it("knows which foods a copied meal added", async () => {
    const yesterday = new Date(Date.now() - 86_400_000);
    await upsertMealItems({ eatenAt: yesterday, items: [CHICKEN], label: "lunch", userId: session.userId });
    const from = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date(yesterday.getTime() - 4 * 3_600_000));
    const copied = await copyMeal({ from, label: "lunch", userId: session.userId });
    assert.ok(copied.copied);
    assert.deepEqual(copied.addedItemIds, copied.meal.items.map((item) => item.id));
  });
});

describe("assistant limits and channels", () => {
  it("counts only this person's app messages", async () => {
    for (let index = 0; index < ASSISTANT_BURST.max; index += 1) {
      await turn({ at: new Date(), id: `t${index}` });
      await turn({ at: new Date(), channel: "telegram", id: `g${index}`, userId: other.userId });
    }
    assert.match((await assistantLimit(session.userId)) ?? "", /few minutes/);
    assert.equal(await assistantLimit(other.userId), null);
  });

  it("tells the app from the web on the same channel", () => {
    assert.equal(turnChannel("http", { channel: "app" }), "app");
    assert.equal(turnChannel("http", { channel: "web" }), "web");
    assert.equal(turnChannel("channel:telegram", { channel: "app" }), "telegram");
  });
});

describe("talking", () => {
  const start = (token = session.accessToken) => api("POST", "/assistant/talk", { token });

  it("hands out a one-time key and never the server's own", async () => {
    process.env.AI_GATEWAY_API_KEY = "server-secret";
    const { body, headers, status } = await start();
    delete process.env.AI_GATEWAY_API_KEY;
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.token, "one-time");
    assert.equal(headers.get("cache-control"), "no-store");
    assert.ok(!JSON.stringify(body).includes("server-secret"));
    assert.equal((await api("POST", "/assistant/talk")).status, 401);
  });

  it("limits calls per person, even when started together", async () => {
    const started = await Promise.all(Array.from({ length: TALK_HOURLY_CALLS + 2 }, () => start()));
    assert.equal(started.filter((row) => row.status === 200).length, TALK_HOURLY_CALLS);
    assert.equal(started.filter((row) => row.status === 429).length, 2);
    assert.equal((await start(other.accessToken)).status, 200);
  });

  it("doesn't count a call that couldn't start", async () => {
    talkSetup.fails = true;
    for (let index = 0; index < TALK_HOURLY_CALLS + 1; index += 1) assert.equal((await start()).status, 502);
    talkSetup.fails = false;
    assert.equal((await start()).status, 200);
  });

  it("is off, and says so, until it's set up", async () => {
    talkSetup.available = false;
    assert.equal((await start()).status, 503);
    assert.equal((await api("GET", "/assistant/card", { token: session.accessToken })).body.talk, false);
    talkSetup.available = true;
    assert.equal((await api("GET", "/assistant/conversation", { token: session.accessToken })).body.talk, true);
  });
});

describe("what was said in a call", () => {
  const start = async () => (await api("POST", "/assistant/talk", { token: session.accessToken })).body.id as string;
  const save = (id: string, lines: object[], token = session.accessToken) =>
    api("PUT", `/assistant/talk/${id}`, { body: { lines }, token });
  const read = async (query = "") => (await api("GET", `/assistant/conversation${query}`, { token: session.accessToken })).body;
  const LINES = [
    { atMs: 0, speaker: "user", text: "Hi" },
    { atMs: 900, speaker: "assistant", text: "Hello!" },
    { atMs: 4000, speaker: "user", text: "Plan lunch" },
  ];

  it("is kept line by line, over the agent turns it covers, with their cards", async () => {
    const id = await start();
    const { card } = await recordIdea({ callId: "idea", items: [CHICKEN], label: "lunch", sessionId: "s1", userId: session.userId });
    const at = new Date();
    await turn({ at, id: "spoken", items: [{ at: at.toISOString(), callId: "idea", stepIndex: 0, toolName: "suggest_meal", type: "tool" }] });
    await turn({ at: new Date(Date.now() - 3_600_000), id: "typed-before" });
    assert.equal((await save(id, LINES.slice(0, 1))).status, 204);
    assert.equal((await save(id, LINES)).status, 204);
    await turn({ at: new Date(Date.now() + 1000), id: "typed-after" });
    const { talks, turns } = await read();
    assert.equal(talks.length, 1);
    assert.deepEqual(talks[0].lines, LINES);
    assert.deepEqual(talks[0].turnIds, ["s1:spoken"]);
    assert.deepEqual(talks[0].cards, [card]);
    // Older apps show the agent's turns, which are still all there.
    assert.equal(turns.length, 3);
  });

  it("isn't shown for a call with nothing written down, or to anyone else", async () => {
    const id = await start();
    assert.deepEqual((await read()).talks, []);
    assert.equal((await save(id, LINES, other.accessToken)).status, 404);
    assert.equal((await save("nope", LINES)).status, 404);
    assert.equal((await save(id, [{ atMs: 0, speaker: "coach", text: "x" }])).status, 400);
    assert.deepEqual((await read()).talks, []);
  });

  it("can't be rewritten long after", async () => {
    const id = await start();
    await prisma.assistantAction.update({ data: { createdAt: new Date(Date.now() - 2 * 3_600_000) }, where: { id } });
    assert.equal((await save(id, LINES)).status, 404);
  });

  it("covers turns on both sides of a page edge", async () => {
    const base = Date.now() - 1_000_000;
    for (let index = 0; index < 35; index += 1) await turn({ at: new Date(base + index * 1000), id: `t${index}` });
    const id = await start();
    // Begins before turn 5, the first page's oldest, and runs past turn 6.
    await prisma.assistantAction.update({
      data: { createdAt: new Date(base + 3500), payload: { endedAt: new Date(base + 6500).toISOString(), lines: LINES } },
      where: { id },
    });
    const first = await read();
    assert.deepEqual(first.talks.map((talk: { id: string }) => talk.id), [id]);
    assert.deepEqual(first.talks[0].turnIds, ["s1:t4", "s1:t5", "s1:t6"]);
    const second = await read(`?before=${encodeURIComponent(first.next)}`);
    // The app shows a call once, by id; both pages know which turns it covers.
    assert.deepEqual(second.talks.map((talk: { id: string }) => talk.id), [id]);
  });
});

describe("assistant home card", () => {
  const at = (iso: string) => setApiDeps({ now: () => new Date(iso) });
  const card = async () => (await api("GET", "/assistant/card", { token: session.accessToken })).body.messages as { id: string; text: string }[];
  const eat = (iso: string, items = [CHICKEN]) => upsertMealItems({ eatenAt: new Date(iso), items, label: "breakfast", userId: session.userId });

  it("often has nothing to say", async () => {
    at("2026-03-10T08:00:00Z");
    assert.deepEqual(await card(), []);
  });

  it("says how much protein is left, with a food that helps", async () => {
    at("2026-03-10T12:00:00Z");
    await api("PUT", "/me/goals", { body: { proteinGPerDay: 120 }, token: session.accessToken });
    await eat("2026-03-10T08:00:00Z");
    assert.deepEqual((await card()).map((m) => m.text), ["You still need 75 grams of protein. Chicken covers most of it."]);
    assert.equal(coverage(10, 100), null);
    assert.equal(coverage(30, 100), "covers about a third");
  });

  it("doesn't praise a week far under the goal", async () => {
    at("2026-03-10T08:00:00Z");
    await api("PUT", "/me/goals", { body: { caloriesPerDay: 1600 }, token: session.accessToken });
    for (const day of ["05", "06", "07"]) await eat(`2026-03-${day}T09:00:00Z`);
    assert.deepEqual((await card()).map((m) => m.text), ["You logged 300 kcal a day this week, well under your goal. Is anything missing?"]);
  });

  it("asks about an empty day, but not first thing in the morning", async () => {
    at("2026-03-10T12:00:00Z");
    assert.deepEqual((await card()).map((m) => m.id), ["empty:2026-03-10"]);
  });
});
