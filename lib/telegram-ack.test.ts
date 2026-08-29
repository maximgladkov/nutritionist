import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TELEGRAM_ACK_HISTORY_MAX_CHARS,
  TELEGRAM_ACK_SYSTEM,
  clipTelegramAckHistory,
  parseTelegramAckHistory,
  telegramAckConversationIsRussian,
  telegramAckFallback,
  telegramAckIntent,
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

describe("telegramAckIntent", () => {
  it("treats a calorie question as a check", () => {
    assert.equal(
      telegramAckIntent({ caption: "", hasFiles: false, text: "А что по калориям?" }),
      "check",
    );
  });

  it("treats a photo as a photo look", () => {
    assert.equal(telegramAckIntent({ hasFiles: true, text: "" }), "photo");
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
  it("uses a short English check for a calorie question", () => {
    assert.equal(
      telegramAckFallback({ hasFiles: false, text: "What about calories?" }),
      "Checking…",
    );
  });

  it("uses a short Russian check for a calorie question", () => {
    assert.equal(
      telegramAckFallback({ hasFiles: false, text: "А что по калориям?" }),
      "Смотрю…",
    );
  });

  it("mentions a photo in Russian when the conversation is Russian", () => {
    assert.equal(
      telegramAckFallback({
        hasFiles: true,
        history: [{ role: "user", text: "Запиши йогурт" }],
      }),
      "Смотрю фото…",
    );
  });

  it("follows Russian conversation history for a generic follow-up", () => {
    assert.equal(
      telegramAckFallback({
        hasFiles: false,
        history: [{ role: "assistant", text: "Записала. 140 ккал." }],
        text: "ok",
      }),
      "Секунду…",
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
