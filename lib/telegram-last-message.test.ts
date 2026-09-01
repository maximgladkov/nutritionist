import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChannelSource } from "eve/channels";
import { sendTelegramLastMessageTurn, wrapTelegramLastMessageSend } from "./telegram-last-message-turn.ts";

type TestSource = ChannelSource<{ chatId: string }>;

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
      auth: {
        attributes: { channel: "telegram" },
        authenticator: "app",
        issuer: "nutritionist",
        principalId: "user_1",
        principalType: "user",
      },
      state: { chatId: "1" },
    });
    assert.deepEqual(order, ["clear", "send:yogurt"]);
    assert.equal(session.id, "session_9");
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
});
