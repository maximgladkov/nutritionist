import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { telegramAckUserContent } from "./telegram-ack.ts";

describe("telegramAckUserContent", () => {
  it("uses text when present", () => {
    assert.equal(
      telegramAckUserContent({ caption: "ignored caption", hasFiles: false, text: "Logged yogurt?" }),
      "User message: Logged yogurt?\nHas attached files: no",
    );
  });

  it("falls back to caption when text is empty", () => {
    assert.equal(
      telegramAckUserContent({ caption: "Lunch photo", hasFiles: true, text: "  " }),
      "User message: Lunch photo\nHas attached files: yes",
    );
  });

  it("marks a photo-only message as having files and no text", () => {
    assert.equal(
      telegramAckUserContent({ caption: "", hasFiles: true, text: "" }),
      "User message: (none)\nHas attached files: yes",
    );
  });
});
