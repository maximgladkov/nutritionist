import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TELEGRAM_ACK_SYSTEM,
  coalesceTelegramAckTurns,
  telegramAckErrorMessage,
  telegramAckFileSummary,
  telegramAckFiles,
  telegramAckMessages,
  telegramAckSystem,
  telegramAckUserContent,
} from "./telegram-ack.ts";

describe("telegramAckUserContent", () => {
  it("uses the latest user text as the model turn", () => {
    assert.equal(
      telegramAckUserContent({ caption: "ignored caption", text: "Logged yogurt?" }),
      "Logged yogurt?",
    );
  });

  it("falls back to caption when text is empty", () => {
    assert.equal(
      telegramAckUserContent({
        caption: "Lunch photo",
        files: [{ format: "jpeg", kind: "photo" }],
        text: "  ",
      }),
      "Lunch photo",
    );
  });

  it("names a photo-only message when there is no text", () => {
    assert.equal(
      telegramAckUserContent({ caption: "", files: [{ format: "jpeg", kind: "photo" }], text: "" }),
      "(photo)",
    );
  });

  it("names each kind when several files have no text", () => {
    assert.equal(
      telegramAckUserContent({
        caption: "",
        files: [
          { format: "jpeg", kind: "photo" },
          { format: "ogg", kind: "voice" },
        ],
        text: "",
      }),
      "(photo, voice note)",
    );
  });
});

describe("telegramAckFiles", () => {
  it("classifies photo, voice, audio, and video attachments", () => {
    assert.deepEqual(
      telegramAckFiles([
        { fileName: "photo.jpg", kind: "photo", mediaType: "image/jpeg" },
        { fileName: "voice.ogg", kind: "document", mediaType: "audio/ogg" },
        { fileName: "meal.mp3", kind: "document", mediaType: "audio/mpeg" },
        { fileName: "plate.mp4", kind: "document", mediaType: "video/mp4" },
        { fileName: "label.pdf", kind: "document", mediaType: "application/pdf" },
      ]),
      [
        { format: "jpeg", kind: "photo" },
        { format: "ogg", kind: "voice" },
        { format: "mp3", kind: "audio" },
        { format: "mp4", kind: "video" },
        { format: "pdf", kind: "file" },
      ],
    );
  });
});

describe("telegramAckFileSummary", () => {
  it("describes a single file kind and format", () => {
    assert.equal(
      telegramAckFileSummary([{ format: "ogg", kind: "voice" }]),
      "The latest user message includes a voice note (ogg).",
    );
  });

  it("lists each format when there are several attachments", () => {
    assert.equal(
      telegramAckFileSummary([
        { format: "jpeg", kind: "photo" },
        { format: "ogg", kind: "voice" },
        { format: "mp4", kind: "video" },
      ]),
      "The latest user message includes 3 attachments: photo (jpeg), voice note (ogg), video (mp4).",
    );
  });
});

describe("telegramAckMessages", () => {
  it("sends only the latest user prompt", () => {
    const input = {
      caption: "",
      files: [] as const,
      text: "И кофе",
    };
    assert.deepEqual(telegramAckMessages(input), [{ role: "user", content: "И кофе" }]);
    assert.match(telegramAckSystem(input), /same language as the latest user message/);
    assert.match(
      telegramAckSystem({ caption: "", files: [{ format: "jpeg", kind: "photo" }], text: "" }),
      /photo \(jpeg\)/,
    );
    assert.match(TELEGRAM_ACK_SYSTEM, /Checking calories/);
    assert.match(TELEGRAM_ACK_SYSTEM, /Listening/);
    assert.match(TELEGRAM_ACK_SYSTEM, /Watching the video/);
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

describe("telegramAckErrorMessage", () => {
  it("reads Error.message", () => {
    assert.equal(telegramAckErrorMessage(new Error("telegram ack timed out")), "telegram ack timed out");
  });
});
