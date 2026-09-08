import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TELEGRAM_ACK_TURN_CONTEXT } from "./telegram-ack.ts";
import type { TelegramAckGeneration } from "./telegram-ack.ts";
import {
  oldestUnclaimedPendingAck,
  pendingAckIsReady,
  pendingAckToClaim,
} from "./agent-turn-ack.ts";
import {
  shouldDeliverTelegramAck,
  startTelegramAckTurn,
  telegramAckPostedRecently,
  resetTelegramTurnReplyPosted,
  type TelegramAckTurnStore,
} from "./telegram-ack-turn.ts";
import { bindTelegramAckPosted, rememberTelegramAckPosted } from "./telegram-ack-posted.ts";
import type { PendingAgentTurnAck } from "./agent-turn-ack.ts";

const ack: TelegramAckGeneration = {
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  categories: ["none"],
  costUsd: 0.0001,
  inputTokens: 12,
  intents: [{ category: "none", text: "respond" }],
  model: "google/gemini-3.5-flash-lite",
  outputTokens: 4,
  text: "Checking calories…",
};

describe("oldestUnclaimedPendingAck", () => {
  it("claims reservations in webhook order even if a later ack finishes first", () => {
    const rows = [
      { createdAt: new Date("2026-09-04T10:00:01.000Z"), id: "second", sessionId: null as string | null },
      { createdAt: new Date("2026-09-04T10:00:00.000Z"), id: "first", sessionId: null },
    ];
    const first = oldestUnclaimedPendingAck(rows);
    assert.equal(first?.id, "first");
    if (first) {
      first.sessionId = "session-1";
    }
    const second = oldestUnclaimedPendingAck(rows);
    assert.equal(second?.id, "second");
  });

  it("skips an abandoned reservation so the next claim is not blocked", () => {
    const rows = [
      { createdAt: new Date("2026-09-04T10:00:00.000Z"), id: "failed", sessionId: "gone" as string | null },
      { createdAt: new Date("2026-09-04T10:00:01.000Z"), id: "next", sessionId: null },
    ];
    assert.equal(oldestUnclaimedPendingAck(rows)?.id, "next");
  });
});

describe("pendingAckToClaim", () => {
  it("skips a leftover ack from before the previous turn", () => {
    const leftover = {
      createdAt: new Date("2026-09-06T11:48:16.157Z"),
      id: "juice",
      sessionId: null as string | null,
    };
    const current = {
      createdAt: new Date("2026-09-06T12:40:15.357Z"),
      id: "calories",
      sessionId: null,
    };
    assert.equal(
      pendingAckToClaim([leftover, current], new Date("2026-09-06T12:08:35.748Z"))?.id,
      "calories",
    );
  });

  it("keeps webhook order for acks reserved while the previous turn was still running", () => {
    const first = {
      createdAt: new Date("2026-09-06T10:00:10.000Z"),
      id: "first",
      sessionId: null as string | null,
    };
    const second = {
      createdAt: new Date("2026-09-06T10:00:20.000Z"),
      id: "second",
      sessionId: null,
    };
    assert.equal(
      pendingAckToClaim([second, first], new Date("2026-09-06T10:00:00.000Z"))?.id,
      "first",
    );
  });

  it("falls back to the oldest unclaimed ack when all reservations predate the previous turn", () => {
    const queued = {
      createdAt: new Date("2026-09-06T10:00:20.000Z"),
      id: "queued",
      sessionId: null as string | null,
    };
    assert.equal(
      pendingAckToClaim([queued], new Date("2026-09-06T10:01:00.000Z"))?.id,
      "queued",
    );
  });
});

describe("pendingAckIsReady", () => {
  it("waits for generated text before attaching to a transcript", () => {
    assert.equal(pendingAckIsReady({ model: null, text: null }), false);
    assert.equal(pendingAckIsReady({ model: "google/gemini-3.5-flash-lite", text: "Checking…" }), true);
  });
});

describe("shouldDeliverTelegramAck", () => {
  it("sends while the turn is still running without an assistant reply", () => {
    assert.equal(
      shouldDeliverTelegramAck({ hasAssistant: false, replyPosted: false, status: "running" }),
      true,
    );
    assert.equal(
      shouldDeliverTelegramAck({ hasAssistant: false, replyPosted: false, status: null }),
      true,
    );
  });

  it("skips Telegram delivery after the main reply is already out", () => {
    assert.equal(
      shouldDeliverTelegramAck({ hasAssistant: true, replyPosted: false, status: "running" }),
      false,
    );
    assert.equal(
      shouldDeliverTelegramAck({ hasAssistant: false, replyPosted: true, status: "running" }),
      false,
    );
    assert.equal(
      shouldDeliverTelegramAck({ hasAssistant: false, replyPosted: false, status: "completed" }),
      false,
    );
  });
});

describe("startTelegramAckTurn", () => {
  it("returns context before ack generation resolves", async () => {
    const { generate, resolve } = deferredAck();
    const world = memoryAckStore();
    const started = await startTelegramAckTurn({
      generate,
      store: world.store,
      telegram: world.telegram,
      userId: "user_1",
    });
    assert.deepEqual(started.context, [TELEGRAM_ACK_TURN_CONTEXT]);
    assert.equal(world.sent.length, 0);
    assert.equal(world.reserved.length, 1);
    resolve(ack);
    await started.settled;
    assert.deepEqual(world.sent, [ack.text]);
  });

  it("persists a skipped late ack without sending it", async () => {
    const world = memoryAckStore({ deliveryAllowed: false });
    world.store.complete = async (id, generated) => {
      world.completed.push({ id, generated });
      return { sessionId: "session_1", turnId: "turn_1" };
    };
    const started = await startTelegramAckTurn({
      generate: Promise.resolve(ack),
      store: world.store,
      telegram: world.telegram,
      userId: "user_1",
    });
    await started.settled;
    assert.deepEqual(world.sent, []);
    assert.equal(world.completed.length, 1);
    assert.equal(world.attached.length, 1);
    assert.equal(world.attached[0]?.text, ack.text);
  });

  it("abandons a failed ack so the next reservation can be claimed", async () => {
    const world = memoryAckStore();
    const started = await startTelegramAckTurn({
      generate: Promise.resolve({ error: "telegram ack timed out" }),
      store: world.store,
      telegram: world.telegram,
      userId: "user_1",
    });
    await started.settled;
    assert.equal(world.abandoned.length, 1);
    assert.equal(world.abandoned[0], world.reserved[0]);
    assert.equal(world.completed.length, 0);
    assert.deepEqual(world.sent, ["Quick reply failed: telegram ack timed out"]);
  });
});

describe("telegramAckPostedRecently", () => {
  it("is true only after an ack is remembered and bound to the turn", () => {
    resetTelegramTurnReplyPosted();
    assert.equal(telegramAckPostedRecently("sess", "turn"), false);
    rememberTelegramAckPosted("pending_1");
    assert.equal(telegramAckPostedRecently("sess", "turn"), false);
    bindTelegramAckPosted("pending_1", "sess", "turn");
    assert.equal(telegramAckPostedRecently("sess", "turn"), true);
    assert.equal(telegramAckPostedRecently("sess", "turn", 0), false);
    resetTelegramTurnReplyPosted();
  });
});

function deferredAck() {
  let resolve!: (value: TelegramAckGeneration | { error: string }) => void;
  const generate = new Promise<TelegramAckGeneration | { error: string }>((next) => {
    resolve = next;
  });
  return { generate, resolve };
}

function memoryAckStore(options?: { deliveryAllowed?: boolean }) {
  const reserved: string[] = [];
  const abandoned: string[] = [];
  const completed: { id: string; generated: TelegramAckGeneration }[] = [];
  const attached: PendingAgentTurnAck[] = [];
  const sent: string[] = [];
  let nextId = 0;
  const store: TelegramAckTurnStore = {
    async abandon(id) {
      abandoned.push(id);
    },
    async attachToTurn(_sessionId, _turnId, pending) {
      attached.push(pending);
    },
    async complete(id, generated) {
      completed.push({ id, generated });
      return { sessionId: null, turnId: null };
    },
    async deliveryAllowed() {
      return options?.deliveryAllowed !== false;
    },
    async reserve() {
      const id = `pending_${String(++nextId)}`;
      reserved.push(id);
      return id;
    },
  };
  return {
    abandoned,
    attached,
    completed,
    reserved,
    sent,
    store,
    telegram: {
      async sendMessage(message: string) {
        sent.push(message);
      },
    },
  };
}
