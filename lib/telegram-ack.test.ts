import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TELEGRAM_ACK_HISTORY_MAX_CHARS,
  TELEGRAM_ACK_SYSTEM,
  clipTelegramAckHistory,
  parseTelegramAckHistory,
  telegramAckMessages,
  telegramAckUserContent,
} from "./telegram-ack.ts";

describe("telegramAckUserContent", () => {
  it("uses text when present", () => {
    assert.equal(
      telegramAckUserContent({ caption: "ignored caption", hasFiles: false, text: "Logged yogurt?" }),
      "User message: Logged yogurt?\nHas attached files: no\nTelegram client language: unknown",
    );
  });

  it("falls back to caption when text is empty", () => {
    assert.equal(
      telegramAckUserContent({ caption: "Lunch photo", hasFiles: true, text: "  " }),
      "User message: Lunch photo\nHas attached files: yes\nTelegram client language: unknown",
    );
  });

  it("marks a photo-only message as having files and no text", () => {
    assert.equal(
      telegramAckUserContent({ caption: "", hasFiles: true, text: "" }),
      "User message: (none)\nHas attached files: yes\nTelegram client language: unknown",
    );
  });

  it("includes the Telegram client language when set", () => {
    assert.equal(
      telegramAckUserContent({
        caption: "",
        hasFiles: false,
        languageCode: "ru",
        text: "Привет",
      }),
      "User message: Привет\nHas attached files: no\nTelegram client language: ru",
    );
  });
});

describe("telegramAckMessages", () => {
  it("puts recent conversation turns before the current user prompt", () => {
    assert.deepEqual(
      telegramAckMessages({
        caption: "",
        hasFiles: false,
        history: [
          { role: "user", text: "Запиши йогурт" },
          { role: "assistant", text: "Записала. 140 ккал." },
        ],
        languageCode: "ru",
        text: "И кофе",
      }),
      [
        { role: "system", content: TELEGRAM_ACK_SYSTEM },
        { role: "user", content: "Запиши йогурт" },
        { role: "assistant", content: "Записала. 140 ккал." },
        {
          role: "user",
          content: "User message: И кофе\nHas attached files: no\nTelegram client language: ru",
        },
      ],
    );
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
