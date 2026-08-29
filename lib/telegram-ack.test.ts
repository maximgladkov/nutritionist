import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TELEGRAM_ACK_HISTORY_MAX_CHARS,
  TELEGRAM_ACK_SYSTEM,
  clipTelegramAckHistory,
  coalesceTelegramAckTurns,
  parseTelegramAckHistory,
  telegramAckErrorMessage,
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
      { role: "user", content: "Запиши йогурт" },
      { role: "assistant", content: "Записала. 140 ккал." },
      { role: "user", content: "И кофе" },
    ]);
    assert.match(telegramAckSystem(input), /same language as the recent conversation/);
    assert.match(TELEGRAM_ACK_SYSTEM, /Do not repeat an acknowledgement/);
    assert.match(TELEGRAM_ACK_SYSTEM, /Checking calories/);
    assert.match(TELEGRAM_ACK_SYSTEM, /Listening/);
    assert.ok(telegramAckSystem(input).startsWith(TELEGRAM_ACK_SYSTEM));
  });
});

describe("coalesceTelegramAckTurns", () => {
  it("merges consecutive assistant turns and drops a leading assistant", () => {
    assert.deepEqual(
      coalesceTelegramAckTurns([
        { role: "assistant", content: "Секунду…" },
        { role: "user", content: "а обед?" },
        { role: "assistant", content: "Секунду…" },
        { role: "assistant", content: "На обед можно курицу." },
        { role: "user", content: "а ужин?" },
      ]),
      [
        { role: "user", content: "а обед?" },
        { role: "assistant", content: "Секунду…\nНа обед можно курицу." },
        { role: "user", content: "а ужин?" },
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

describe("telegramAckErrorMessage", () => {
  it("reads Error.message", () => {
    assert.equal(telegramAckErrorMessage(new Error("telegram ack timed out")), "telegram ack timed out");
  });
});
