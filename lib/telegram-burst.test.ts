import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mergeTelegramBurstItems,
  selectTelegramBurstClaim,
  TELEGRAM_BURST_MEDIA_DELAY_MS,
  telegramBurstDelayMs,
  telegramMediaGroupId,
} from "./telegram-burst.ts";

describe("telegramBurstDelayMs", () => {
  it("waits only for the newest album part", () => {
    assert.equal(telegramBurstDelayMs([{ attachments: [] }]), 0);
    assert.equal(telegramBurstDelayMs([{ attachments: [{ fileId: "a", kind: "photo" }] }]), 0);
    assert.equal(
      telegramBurstDelayMs([{ attachments: [{ fileId: "a", kind: "photo" }], mediaGroupId: "grp" }]),
      TELEGRAM_BURST_MEDIA_DELAY_MS,
    );
    assert.equal(
      telegramBurstDelayMs([
        { attachments: [{ fileId: "a", kind: "photo" }], mediaGroupId: "grp" },
        { attachments: [], text: "that's lunch" },
      ]),
      0,
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

describe("telegramMediaGroupId", () => {
  it("reads Telegram media_group_id from the raw update", () => {
    assert.equal(telegramMediaGroupId({ media_group_id: "abc" }), "abc");
    assert.equal(telegramMediaGroupId({ media_group_id: 12 }), "12");
    assert.equal(telegramMediaGroupId({}), undefined);
  });
});
