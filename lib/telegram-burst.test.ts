import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mergeTelegramBurstItems,
  selectTelegramBurstClaim,
  TELEGRAM_BURST_MEDIA_DELAY_MS,
  TELEGRAM_BURST_TEXT_DELAY_MS,
  telegramBurstDelayMs,
} from "./telegram-burst.ts";

describe("telegramBurstDelayMs", () => {
  it("waits longer when any item has attachments", () => {
    assert.equal(telegramBurstDelayMs([{ attachments: [] }]), TELEGRAM_BURST_TEXT_DELAY_MS);
    assert.equal(
      telegramBurstDelayMs([{ attachments: [{ fileId: "a", kind: "photo" }] }]),
      TELEGRAM_BURST_MEDIA_DELAY_MS,
    );
    assert.equal(
      telegramBurstDelayMs([{ attachments: [{ fileId: "a", kind: "photo" }] }, { attachments: [] }]),
      TELEGRAM_BURST_MEDIA_DELAY_MS,
    );
  });
});

describe("mergeTelegramBurstItems", () => {
  it("concatenates photos then follow-up text in arrival order", () => {
    assert.deepEqual(
      mergeTelegramBurstItems([
        {
          attachments: [{ fileId: "p1", fileName: "photo-0.jpg", kind: "photo", mediaType: "image/jpeg" }],
          caption: "",
          messageId: "1",
          text: "",
        },
        {
          attachments: [{ fileId: "p2", kind: "photo", mediaType: "image/jpeg" }],
          caption: "front",
          messageId: "2",
          text: "",
        },
        {
          attachments: [],
          caption: "",
          messageId: "3",
          text: "this is lunch",
        },
      ]),
      {
        attachments: [
          { fileId: "p1", fileName: "photo-0.jpg", kind: "photo", mediaType: "image/jpeg" },
          { fileId: "p2", kind: "photo", mediaType: "image/jpeg" },
        ],
        caption: "",
        text: "front\nthis is lunch",
      },
    );
  });

  it("dedupes the same file id across album parts", () => {
    const merged = mergeTelegramBurstItems([
      {
        attachments: [{ fileId: "same", kind: "photo" }],
        caption: "",
        messageId: "1",
        text: "",
      },
      {
        attachments: [{ fileId: "same", kind: "photo" }],
        caption: "",
        messageId: "2",
        text: "",
      },
    ]);
    assert.equal(merged.attachments.length, 1);
    assert.equal(merged.attachments[0]?.fileId, "same");
  });
});

describe("selectTelegramBurstClaim", () => {
  it("lets the newest message claim the whole unconsumed set", () => {
    const rows = [{ messageId: "1" }, { messageId: "2" }, { messageId: "3" }];
    assert.deepEqual(selectTelegramBurstClaim(rows, "3"), rows);
  });

  it("returns null when an older webhook is superseded", () => {
    assert.equal(selectTelegramBurstClaim([{ messageId: "1" }, { messageId: "2" }], "1"), null);
    assert.equal(selectTelegramBurstClaim([], "1"), null);
  });
});
