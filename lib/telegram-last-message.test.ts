import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChannelSendOptions, ChannelSource } from "eve/channels";
import {
  createTelegramTurnTracker,
  sendTelegramLastMessageTurn,
  wrapTelegramLastMessageSend,
} from "./telegram-last-message-turn.ts";

type TestSource = ChannelSource<{ chatId: string }>;

const auth: ChannelSendOptions<{ chatId: string }>["auth"] = {
  attributes: { channel: "telegram" },
  authenticator: "app",
  issuer: "nutritionist",
  principalId: "user_1",
  principalType: "user",
};

function testSource(overrides?: Partial<TestSource>): TestSource {
  return {
    cancel: async () => ({ status: "no_active_turn" as const }),
    clear: async () => ({ status: "no_active_session" as const }),
    compact: async () => ({ status: "no_active_session" as const }),
    reset: async () => ({ status: "no_active_session" as const }),
    respond: async () => ({ id: "session_1" }) as never,
    send: async () => ({ id: "session_1" }) as never,
    ...overrides,
  };
}

describe("sendTelegramLastMessageTurn", () => {
  it("clears history before sending the latest message", async () => {
    const order: string[] = [];
    const source = testSource({
      clear: async () => {
        order.push("clear");
        return { status: "accepted" as const, sessionId: "session_9" };
      },
      send: async (message) => {
        order.push(`send:${String(message)}`);
        return { id: "session_9" } as never;
      },
    });
    const session = await sendTelegramLastMessageTurn(source, "yogurt", {
      auth,
      state: { chatId: "1" },
    });
    assert.deepEqual(order, ["clear", "send:yogurt"]);
    assert.equal(session.id, "session_9");
  });

  it("skips clear when the send overlaps an active turn", async () => {
    const order: string[] = [];
    const source = testSource({
      clear: async () => {
        order.push("clear");
        return { status: "accepted" as const, sessionId: "session_9" };
      },
      send: async (message) => {
        order.push(`send:${String(message)}`);
        return { id: "session_9" } as never;
      },
    });
    await sendTelegramLastMessageTurn(
      source,
      "and an apple",
      { auth, state: { chatId: "1" } },
      { overlapping: true },
    );
    assert.deepEqual(order, ["send:and an apple"]);
  });

  it("merges recent-turn context with existing context", async () => {
    let context: readonly string[] | undefined;
    const source = testSource({
      send: async (_message, options) => {
        context = options.context;
        return { id: "session_9" } as never;
      },
    });
    await sendTelegramLastMessageTurn(
      source,
      "yes",
      { auth, context: ["ack hint"], state: { chatId: "1" } },
      { recentContext: "User: yogurt\nAssistant: which one?" },
    );
    assert.deepEqual(context, ["ack hint", "User: yogurt\nAssistant: which one?"]);
  });
});

describe("wrapTelegramLastMessageSend", () => {
  it("delegates respond without clearing", async () => {
    let cleared = false;
    const source = testSource({
      clear: async () => {
        cleared = true;
        return { status: "accepted" as const, sessionId: "session_hitl" };
      },
      respond: async () => ({ id: "session_hitl" }) as never,
    });
    const wrapped = wrapTelegramLastMessageSend(source);
    const session = await wrapped.respond([{ id: "q1", outcome: "selected", selected: "yes" }] as never, {
      auth: null,
    });
    assert.equal(cleared, false);
    assert.equal(session.id, "session_hitl");
  });

  it("clears on idle send and skips clear for an overlapping send", async () => {
    const order: string[] = [];
    const tracker = createTelegramTurnTracker();
    const source = testSource({
      clear: async () => {
        order.push("clear");
        return { status: "accepted" as const, sessionId: "session_9" };
      },
      send: async (message) => {
        order.push(`send:${String(message)}`);
        return { id: "session_9" } as never;
      },
    });
    const wrapped = wrapTelegramLastMessageSend(source, { address: "chat:1", tracker });
    await wrapped.send("yogurt", { auth, state: { chatId: "1" } });
    await wrapped.send("and an apple", { auth, state: { chatId: "1" } });
    assert.deepEqual(order, ["clear", "send:yogurt", "send:and an apple"]);
    tracker.settle("chat:1");
    tracker.settle("chat:1");
    await wrapped.send("later", { auth, state: { chatId: "1" } });
    assert.deepEqual(order, ["clear", "send:yogurt", "send:and an apple", "clear", "send:later"]);
  });

  it("injects recent context only on idle sends", async () => {
    const contexts: Array<readonly string[] | undefined> = [];
    const tracker = createTelegramTurnTracker();
    const source = testSource({
      send: async (_message, options) => {
        contexts.push(options.context);
        return { id: "session_9" } as never;
      },
    });
    const wrapped = wrapTelegramLastMessageSend(source, {
      address: "chat:1",
      loadRecentContext: async () => "User: yogurt\nAssistant: which one?",
      tracker,
    });
    await wrapped.send("yes", { auth, context: ["ack hint"], state: { chatId: "1" } });
    await wrapped.send("the first", { auth, context: ["ack hint"], state: { chatId: "1" } });
    assert.deepEqual(contexts[0], ["ack hint", "User: yogurt\nAssistant: which one?"]);
    assert.deepEqual(contexts[1], ["ack hint"]);
  });

  it("keeps overlapping sends behind the in-flight dispatch", async () => {
    const order: string[] = [];
    const tracker = createTelegramTurnTracker();
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const source = testSource({
      clear: async () => {
        order.push("clear");
        return { status: "accepted" as const, sessionId: "session_9" };
      },
      send: async (message) => {
        order.push(`send:${String(message)}`);
        return { id: "session_9" } as never;
      },
    });
    const wrapped = wrapTelegramLastMessageSend(source, {
      address: "chat:1",
      loadRecentContext: async () => {
        order.push("load");
        await gate;
        return "recent";
      },
      tracker,
    });
    const first = wrapped.send("yogurt", { auth, state: { chatId: "1" } });
    const second = wrapped.send("apple", { auth, state: { chatId: "1" } });
    await Promise.resolve();
    assert.deepEqual(order, ["load"]);
    release?.();
    await Promise.all([first, second]);
    assert.deepEqual(order, ["load", "clear", "send:yogurt", "send:apple"]);
  });
});
