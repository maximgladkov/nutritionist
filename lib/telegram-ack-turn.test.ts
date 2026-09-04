import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TELEGRAM_ACK_TURN_CONTEXT } from "./telegram-ack.ts";
import type { TelegramAckGeneration } from "./telegram-ack.ts";
import {
  oldestUnclaimedPendingAck,
  pendingAckIsReady,
} from "./agent-turn-ack.ts";
import {
  shouldDeliverTelegramAck,
  startTelegramAckTurn,
  type TelegramAckTurnStore,
} from "./telegram-ack-turn.ts";
import type { PendingAgentTurnAck } from "./agent-turn-ack.ts";

const ack: TelegramAckGeneration = {
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  costUsd: 0.0001,
  inputTokens: 12,
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
