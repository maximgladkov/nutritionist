import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TelegramMessage } from "eve/channels/telegram";
import {
  applyTelegramHiddenMedia,
  telegramHiddenMediaFromMessage,
  telegramMessageHasInboundContent,
} from "./telegram-media.ts";

function message(overrides: Partial<TelegramMessage> & { raw?: Record<string, unknown> }): TelegramMessage {
  return {
    attachments: [],
    caption: "",
    chat: { id: "1", type: "private" },
    messageId: "1",
    raw: {},
    text: "",
    ...overrides,
  };
}

describe("telegramHiddenMediaFromMessage", () => {
  it("reads a voice note", () => {
    assert.deepEqual(
      telegramHiddenMediaFromMessage(
        message({
          raw: { voice: { file_id: "AwACVoice", mime_type: "audio/ogg; codecs=opus", duration: 4 } },
        }),
      ),
      [{ fileId: "AwACVoice", fileName: "voice.ogg", mediaType: "audio/ogg" }],
    );
  });

  it("reads an audio file", () => {
    assert.deepEqual(
      telegramHiddenMediaFromMessage(
        message({
          raw: {
            audio: { file_id: "CQACAudio", file_name: "meal.mp3", mime_type: "audio/mpeg" },
          },
        }),
      ),
      [{ fileId: "CQACAudio", fileName: "meal.mp3", mediaType: "audio/mpeg" }],
    );
  });

  it("reads a video and a video note", () => {
    assert.deepEqual(
      telegramHiddenMediaFromMessage(
        message({
          raw: {
            video: { file_id: "BAACVideo", file_name: "plate.mp4", mime_type: "video/mp4", file_size: 1200 },
          },
        }),
      ),
      [{ fileId: "BAACVideo", fileName: "plate.mp4", mediaType: "video/mp4", size: 1200 }],
    );
    assert.deepEqual(
      telegramHiddenMediaFromMessage(message({ raw: { video_note: { file_id: "DQACNote" } } })),
      [{ fileId: "DQACNote", fileName: "video_note.mp4", mediaType: "video/mp4" }],
    );
  });

  it("ignores photo-only messages already in attachments", () => {
    assert.deepEqual(
      telegramHiddenMediaFromMessage(
        message({
          attachments: [
            { fileId: "AgACPhoto", kind: "photo", fileName: "photo.jpg", mediaType: "image/jpeg" },
          ],
          raw: { photo: [{ file_id: "AgACPhoto" }] },
        }),
      ),
      [],
    );
  });

  it("does not duplicate a file already present as a document", () => {
    assert.deepEqual(
      telegramHiddenMediaFromMessage(
        message({
          attachments: [{ fileId: "AwACVoice", kind: "document", mediaType: "audio/ogg" }],
          raw: { voice: { file_id: "AwACVoice" } },
        }),
      ),
      [],
    );
  });
});

describe("telegramMessageHasInboundContent", () => {
  it("treats voice-only and video-only messages as dispatchable", () => {
    assert.equal(
      telegramMessageHasInboundContent(message({ raw: { voice: { file_id: "AwACVoice" } } })),
      true,
    );
    assert.equal(
      telegramMessageHasInboundContent(message({ raw: { video: { file_id: "BAACVideo" } } })),
      true,
    );
  });

  it("drops empty messages with no files or hidden media", () => {
    assert.equal(telegramMessageHasInboundContent(message({ caption: "  ", text: "  " })), false);
  });

  it("keeps text, captions, and photo attachments dispatchable", () => {
    assert.equal(telegramMessageHasInboundContent(message({ text: "yogurt" })), true);
    assert.equal(telegramMessageHasInboundContent(message({ caption: "lunch" })), true);
    assert.equal(
      telegramMessageHasInboundContent(
        message({
          attachments: [{ fileId: "AgACPhoto", kind: "photo" }],
        }),
      ),
      true,
    );
  });
});

describe("applyTelegramHiddenMedia", () => {
  it("adds voice and video as document attachments for eve to fetch", () => {
    const inbound = message({
      caption: "lunch",
      raw: { voice: { file_id: "AwACVoice", mime_type: "audio/ogg" } },
    });
    applyTelegramHiddenMedia(inbound);
    assert.deepEqual(inbound.attachments, [
      { fileId: "AwACVoice", fileName: "voice.ogg", kind: "document", mediaType: "audio/ogg" },
    ]);
    assert.equal(inbound.caption, "lunch");
  });

  it("appends hidden media after existing photo attachments", () => {
    const inbound = message({
      attachments: [{ fileId: "AgACPhoto", kind: "photo", fileName: "photo.jpg", mediaType: "image/jpeg" }],
      raw: { video: { file_id: "BAACVideo" } },
    });
    applyTelegramHiddenMedia(inbound);
    assert.equal(inbound.attachments.length, 2);
    assert.equal(inbound.attachments[1]?.fileId, "BAACVideo");
    assert.equal(inbound.attachments[1]?.kind, "document");
    assert.equal(inbound.attachments[1]?.mediaType, "video/mp4");
  });
});
