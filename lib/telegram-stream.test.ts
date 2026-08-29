import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TELEGRAM_STREAM_EDIT_INTERVAL_MS,
  appendTelegramStream,
  clearTelegramStream,
  clipTelegramText,
  completeTelegramStream,
  isTelegramMessageUnmodified,
  shouldOpenTelegramStream,
  shouldRefreshTelegramStream,
  telegramStreamKey,
  type TelegramStreamState,
} from "./telegram-stream.ts";

describe("telegram stream gating", () => {
  it("opens after a complete first word or a longer fragment", () => {
    assert.equal(shouldOpenTelegramStream(""), false);
    assert.equal(shouldOpenTelegramStream("Looking"), false);
    assert.equal(shouldOpenTelegramStream("Looking up"), true);
    assert.equal(shouldOpenTelegramStream("Checking the label now."), true);
    assert.equal(shouldOpenTelegramStream("Line one\n"), true);
  });

  it("throttles edits", () => {
    assert.equal(shouldRefreshTelegramStream(1000, undefined), true);
    assert.equal(shouldRefreshTelegramStream(1000, 1000 - TELEGRAM_STREAM_EDIT_INTERVAL_MS + 1), false);
    assert.equal(shouldRefreshTelegramStream(1000, 1000 - TELEGRAM_STREAM_EDIT_INTERVAL_MS), true);
  });

  it("clips to Telegram's text cap", () => {
    assert.equal(clipTelegramText("ok"), "ok");
    assert.equal(clipTelegramText("a".repeat(4097)).length, 4096);
  });

  it("treats unmodified edits as success", () => {
    assert.equal(
      isTelegramMessageUnmodified({
        body: { description: "Bad Request: message is not modified" },
        ok: false,
        status: 400,
      }),
      true,
    );
    assert.equal(isTelegramMessageUnmodified({ body: null, ok: true, status: 200 }), false);
    assert.equal(
      isTelegramMessageUnmodified({
        body: { description: "Bad Request: message is not modified", ok: false },
        ok: true,
        status: 200,
      }),
      true,
    );
  });
});

describe("telegram stream delivery", () => {
  it("posts the first fragment, edits while streaming, then finalizes HTML", async () => {
    const telegram = createFakeTelegram();
    const state: TelegramStreamState = {};
    await appendTelegramStream(
      telegram,
      state,
      {
        messageSoFar: "Looking up",
        sequence: 0,
        turnId: "turn_1",
      },
      0,
    );
    await appendTelegramStream(
      telegram,
      state,
      { messageSoFar: "Looking up that yogurt.", sequence: 0, turnId: "turn_1" },
      TELEGRAM_STREAM_EDIT_INTERVAL_MS,
    );
    await completeTelegramStream(telegram, state, {
      message: "Looking up that **yogurt**.",
      sequence: 0,
      turnId: "turn_1",
    });
    assert.deepEqual(
      telegram.calls.map((call) => call.method),
      ["post", "editMessageText", "editMessageText"],
    );
    assert.equal(telegram.calls[0]?.body.parse_mode, undefined);
    assert.equal(telegram.calls[2]?.body.parse_mode, "HTML");
    assert.equal(telegram.calls[2]?.body.text, "Looking up that <b>yogurt</b>.");
    assert.equal(state.streamMessageId, null);
    assert.equal(telegramStreamKey("turn_1", 0), "turn_1:0");
  });

  it("posts a completed message when nothing was streamed", async () => {
    const telegram = createFakeTelegram();
    const state: TelegramStreamState = {};
    await completeTelegramStream(telegram, state, {
      message: "Logged **yogurt**.",
      sequence: 1,
      turnId: "turn_1",
    });
    assert.equal(telegram.calls.length, 1);
    assert.equal(telegram.calls[0]?.method, "post");
    assert.equal(telegram.calls[0]?.body.parse_mode, "HTML");
  });

  it("does not post a second message for the same block", async () => {
    const telegram = createFakeTelegram();
    const state: TelegramStreamState = {};
    await appendTelegramStream(telegram, state, {
      messageSoFar: "Looking up",
      sequence: 0,
      turnId: "turn_1",
    });
    await appendTelegramStream(telegram, state, {
      messageSoFar: "Looking up that yogurt.",
      sequence: 0,
      turnId: "turn_1",
    });
    assert.equal(telegram.calls.length, 1);
    clearTelegramStream(state);
    assert.equal(state.streamKey, null);
  });
});

function createFakeTelegram() {
  const calls: Array<{ body: Record<string, unknown>; method: string }> = [];
  let nextId = 1;
  return {
    calls,
    botUsername: undefined,
    chatId: "99",
    chatType: undefined,
    conversationId: undefined,
    messageThreadId: undefined,
    async post(message: string | { parse_mode?: string; text: string }) {
      const body = typeof message === "string" ? { text: message } : message;
      calls.push({ method: "post", body });
      return { id: String(nextId++), raw: null };
    },
    async request(method: string, body?: Record<string, unknown>) {
      calls.push({ method, body: body ?? {} });
      return { body: { ok: true }, ok: true, status: 200 };
    },
    async editMessageText() {
      throw new Error("use request");
    },
  } as unknown as import("eve/channels/telegram").TelegramHandle & {
    calls: Array<{ body: Record<string, unknown>; method: string }>;
  };
}
