import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { searchPastChats } from "../assistant/past-chats.ts";
import { prisma } from "../prisma.ts";
import { closeDatabase, installFakes, resetDatabase, signIn, type Session } from "./test/harness.ts";

let session: Session;
let other: Session;
before(async () => {
  installFakes();
  await resetDatabase();
  session = await signIn("assistant@example.com");
  other = await signIn("other@example.com");
  const turn = (userId: string, id: string, day: string, user: string, coach: string, channel = "app") =>
    prisma.agentTurn.create({
      data: {
        channel,
        messages: { items: [{ at: day, text: user, type: "user" }, { at: day, finishReason: "stop", stepIndex: 0, text: coach, type: "assistant" }], steps: [] },
        sessionId: "s",
        startedAt: new Date(`${day}T12:00:00Z`),
        status: "completed",
        turnId: id,
        turnSequence: 0,
        userId,
      },
    });
  await turn(session.userId, "1", "2026-03-01", "My left KNEE hurts", "Try swimming.");
  await turn(session.userId, "2", "2026-03-05", "What for dinner?", "Salmon with rice.");
  await turn(other.userId, "3", "2026-03-06", "knee", "theirs");
  await turn(session.userId, "4", "2026-03-06", "knee on telegram", "elsewhere", "telegram");
  await prisma.assistantAction.create({
    data: { callId: "talk:1", createdAt: new Date("2026-03-07T12:00:00Z"), kind: "talk", payload: { endedAt: "2026-03-07T12:05:00Z", lines: [{ atMs: 0, speaker: "user", text: "The knee is better" }] }, userId: session.userId },
  });
});
after(closeDatabase);

describe("searching past chats", () => {
  it("finds chats and calls in the app by what was said, newest first, and only theirs", async () => {
    const { chats } = await searchPastChats({ query: "knee", userId: session.userId });
    assert.deepEqual(chats.map((chat) => [chat.date, chat.user, chat.call ?? false]), [["2026-03-07", "The knee is better", true], ["2026-03-01", "My left KNEE hurts", false]]);
    assert.deepEqual((await searchPastChats({ query: "salmon dinner", userId: session.userId })).chats.map((chat) => chat.coach), ["Salmon with rice."]);
  });

  it("gives the latest without words, and older ones before a day", async () => {
    assert.equal((await searchPastChats({ userId: session.userId })).chats.length, 3);
    assert.deepEqual((await searchPastChats({ before: "2026-03-05", userId: session.userId })).chats.map((chat) => chat.date), ["2026-03-01"]);
  });
});
