import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { DEFAULT_SETTINGS, readSettings, settingsInstructions } from "../assistant/settings.ts";
import { APP_INSTRUCTIONS } from "../assistant/app-instructions.ts";
import { FREE_WEEKLY_MINUTES } from "../assistant/usage.ts";
import type { HomeWordsInput } from "../assistant/home-words.ts";
import { prisma } from "../prisma.ts";
import { appendAppLanguageReminder } from "../require-write-tools.ts";
import { setApiDeps } from "./deps.ts";
import { api, closeDatabase, installFakes, resetDatabase, signIn, type Session } from "./test/harness.ts";

// A Wednesday.
const NOW = new Date("2026-03-11T14:00:00Z");
const before = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

let session: Session;

beforeEach(async () => {
  installFakes();
  await resetDatabase();
  session = await signIn("assistant@example.com");
  setApiDeps({ now: () => NOW });
});
after(closeDatabase);

let turns = 0;
async function turn(input: { at: Date; channel?: string; seconds: number; status?: "completed" | "failed"; text?: string }) {
  turns += 1;
  await prisma.agentTurn.create({
    data: {
      channel: input.channel ?? "app",
      durationMs: input.seconds * 1000,
      messages: { items: [{ at: input.at.toISOString(), text: input.text ?? "Hi", type: "user" }], steps: [] },
      sessionId: "s1",
      startedAt: input.at,
      status: input.status ?? "completed",
      turnId: `t${turns}`,
      turnSequence: 0,
      userId: session.userId,
    },
  });
}
const action = (kind: string, createdAt: Date, payload: object) =>
  prisma.assistantAction.create({ data: { callId: `${kind}:${turns++}`, createdAt, kind, payload, sessionId: "s1", userId: session.userId } });
const get = async (path: string) => (await api("GET", path, { token: session.accessToken })).body;
const usage = () => get("/assistant/usage");

describe("time with the coach", () => {
  it("counts chat, voice notes, calls and messages on Today, each once", async () => {
    await turn({ at: before(100), seconds: 20 });
    await turn({ at: before(99), seconds: 1 });
    await turn({ at: before(98), seconds: 9999 });
    await turn({ at: before(90), seconds: 12, text: "Log lunch" });
    await action("voice", before(90), { durationMs: 8000, text: "Log lunch" });
    await action("talk", before(60), { endedAt: before(57).toISOString(), lines: [] });
    // Answered the call above.
    await turn({ at: before(59), seconds: 30 });
    await action("home", before(50), { ai: true, shownAt: before(50).toISOString() });
    await action("home", before(50), { ai: true });
    await action("home", before(49), { ai: false, shownAt: before(49).toISOString() });
    const body = await usage();
    assert.deepEqual(body.split, { chat: 20 + 5 + 120, suggestions: 5, talk: 180, voice: 20 });
    assert.equal(body.used, 350);
    assert.equal(body.limit, FREE_WEEKLY_MINUTES * 60);
    assert.equal(body.asleep, false);
    assert.equal((await api("GET", "/assistant/usage")).status, 401);
  });

  it("leaves out failed replies, other channels, last week and unfinished calls", async () => {
    await turn({ at: before(10), seconds: 20, status: "failed" });
    await turn({ at: before(10), channel: "telegram", seconds: 20 });
    await turn({ at: new Date(NOW.getTime() - 5 * 86_400_000), seconds: 20 });
    await action("talk", before(60), {});
    assert.equal((await usage()).used, 0);
  });

  it("falls asleep when the minutes are gone, until Monday", async () => {
    for (let index = 0; index < FREE_WEEKLY_MINUTES / 2; index += 1) await turn({ at: before(200 - index), seconds: 120 });
    const body = await usage();
    assert.equal(body.asleep, true);
    assert.match(body.resetsAt, /^2026-03-16T/);
    const message = await get("/assistant/message");
    assert.equal(message.asleep, true);
    assert.equal(message.message, null);
    const talk = await api("POST", "/assistant/talk", { token: session.accessToken });
    assert.equal(talk.status, 403);
    assert.equal(talk.body.error.code, "asleep");
    assert.match(talk.body.error.message, /next week.*upgrade/);
    assert.equal((await get("/assistant/conversation")).usage.asleep, true);
    setApiDeps({ now: () => new Date("2026-03-16T09:00:00Z") });
    assert.equal((await usage()).asleep, false);
  });

  it("lets a call last only as long as what's left", async () => {
    await action("talk", before(60), { endedAt: before(50).toISOString() });
    await action("talk", before(40), { endedAt: before(30).toISOString() });
    await action("talk", before(20), { endedAt: before(11).toISOString() });
    const { body } = await api("POST", "/assistant/talk", { token: session.accessToken });
    assert.equal(body.maxSeconds, 60);
  });
});

describe("assistant settings", () => {
  const save = (assistant: object) => api("PATCH", "/me", { body: { preferences: { assistant } }, token: session.accessToken });

  it("are kept beside the other preferences, and only known values", async () => {
    await api("PATCH", "/me", { body: { preferences: { nutrientOrder: ["fat", "kcal", "protein", "carbs"] } }, token: session.accessToken });
    const { body, status } = await save({ ...DEFAULT_SETTINGS, language: "ru", tone: "direct", voice: "vesper" });
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.preferences.assistant.voice, "vesper");
    assert.deepEqual(body.preferences.nutrientOrder[0], "fat");
    assert.equal((await save({ voice: "nope" })).status, 400);
    assert.equal((await save({ plan: "pro" })).status, 400);
    assert.deepEqual(readSettings({ assistant: { tone: "rude" } }), DEFAULT_SETTINGS);
  });

  it("reach calls, replies and messages on Today", async () => {
    await save({ ...DEFAULT_SETTINGS, language: "ru", tone: "direct", voice: "vesper" });
    const talk = (await api("POST", "/assistant/talk", { token: session.accessToken })).body;
    assert.equal(talk.voice, "vesper");
    assert.match(talk.instructions, /Always speak Russian/);
    const system = { content: `${APP_INSTRUCTIONS}\n\n${settingsInstructions({ ...DEFAULT_SETTINGS, language: "ru" })}`, role: "system" as const };
    const prompt = appendAppLanguageReminder([system, { content: [{ text: "Hi", type: "text" }], role: "user" }]);
    assert.match(JSON.stringify(prompt.at(-1)), /reply in Russian/);
    let seen: HomeWordsInput | null = null;
    setApiDeps({
      async writeHome(input) {
        seen = input;
        return [];
      },
    });
    await get("/assistant/message");
    assert.equal(seen!.language, "Russian");
    assert.match(seen!.tone, /direct/);
  });

  it("turn messages on Today off, or down to some kinds", async () => {
    await save({ ...DEFAULT_SETTINGS, homeMessages: false });
    assert.equal((await get("/assistant/message")).message, null);
    await save({ ...DEFAULT_SETTINGS, homeTopics: ["progress"] });
    assert.equal((await get("/assistant/message")).message, null);
    await save(DEFAULT_SETTINGS);
    assert.ok((await get("/assistant/message")).message);
  });
});
