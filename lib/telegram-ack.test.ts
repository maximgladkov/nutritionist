import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TELEGRAM_ACK_HISTORY_MAX_CHARS,
  TELEGRAM_ACK_SYSTEM,
  clipTelegramAckHistory,
  parseTelegramAckHistory,
  telegramAckConversationIsRussian,
  telegramAckFallback,
  telegramAckMessages,
  telegramAckSystem,
  telegramAckUserContent,
} from "./telegram-ack.ts";

describe("telegramAckUserContent", () => {
  it("uses the latest user text as the model turn", () => {
    assert.equal(
      telegramAckUserContent({ caption: "ignored caption", hasFiles: false, text: "Logged yogurt?" }),
      "Logged yogurt?",
    );
  });

  it("falls back to caption when text is empty", () => {
    assert.equal(
      telegramAckUserContent({ caption: "Lunch photo", hasFiles: true, text: "  " }),
      "Lunch photo",
    );
  });

  it("marks a photo-only message as having files and no text", () => {
    assert.equal(
      telegramAckUserContent({ caption: "", hasFiles: true, text: "" }),
      "(attached file)",
    );
  });
});

describe("telegramAckConversationIsRussian", () => {
  it("detects Russian from recent conversation", () => {
    assert.equal(
      telegramAckConversationIsRussian({
        hasFiles: false,
        history: [
          { role: "user", text: "Запиши йогурт" },
          { role: "assistant", text: "Записала. 140 ккал." },
        ],
        text: "ok",
      }),
      true,
    );
  });

  it("is false when conversation text has no Cyrillic", () => {
    assert.equal(
      telegramAckConversationIsRussian({ hasFiles: false, text: "Log yogurt" }),
      false,
    );
  });
});

describe("telegramAckMessages", () => {
  it("puts recent conversation turns before the current user prompt", () => {
    const input = {
      caption: "",
      hasFiles: false,
      history: [
        { role: "user" as const, text: "Запиши йогурт" },
        { role: "assistant" as const, text: "Записала. 140 ккал." },
      ],
      text: "И кофе",
    };
    assert.deepEqual(telegramAckMessages(input), [
      { role: "system", content: telegramAckSystem(input) },
      { role: "user", content: "Запиши йогурт" },
      { role: "assistant", content: "Записала. 140 ккал." },
      { role: "user", content: "И кофе" },
    ]);
    assert.match(telegramAckSystem(input), /same language as the recent conversation/);
    assert.ok(telegramAckSystem(input).startsWith(TELEGRAM_ACK_SYSTEM));
  });
});

describe("clipTelegramAckHistory", () => {
  it("keeps the latest turns and clips long text", () => {
    const long = "a".repeat(TELEGRAM_ACK_HISTORY_MAX_CHARS + 20);
    const clipped = clipTelegramAckHistory([
      { role: "user", text: "old" },
      { role: "assistant", text: "  " },
      { role: "user", text: long },
      { role: "assistant", text: "ok" },
    ]);
    assert.equal(clipped.length, 3);
    assert.equal(clipped[0]?.text, "old");
    assert.equal(clipped[1]?.text.length, TELEGRAM_ACK_HISTORY_MAX_CHARS);
    assert.equal(clipped[2]?.text, "ok");
  });
});

describe("telegramAckFallback", () => {
  it("uses English when conversation text is not Russian", () => {
    assert.equal(
      telegramAckFallback({ hasFiles: false }),
      "Got it — looking into this now and I'll get back to you.",
    );
  });

  it("mentions a photo in Russian when the conversation is Russian", () => {
    assert.equal(
      telegramAckFallback({
        hasFiles: true,
        history: [{ role: "user", text: "Запиши йогурт" }],
      }),
      "Получила фото, сейчас разберусь и вернусь с результатом.",
    );
  });

  it("follows Russian conversation history", () => {
    assert.equal(
      telegramAckFallback({
        hasFiles: false,
        history: [{ role: "assistant", text: "Записала. 140 ккал." }],
        text: "ok",
      }),
      "Поняла, сейчас разберусь и вернусь с результатом.",
    );
  });
});

describe("parseTelegramAckHistory", () => {
  it("ignores malformed entries", () => {
    assert.deepEqual(
      parseTelegramAckHistory([
        { role: "user", text: "hi" },
        { role: "system", text: "nope" },
        { role: "assistant" },
        null,
      ]),
      [{ role: "user", text: "hi" }],
    );
  });
});
