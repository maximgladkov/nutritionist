import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mediaRef } from "./media-ref.ts";
import { isImageMediaType, looksLikeImageFilename, sniffImageMediaType } from "./image-bytes.ts";
import {
  filesForTurnMediaPersist,
} from "./persist-turn-media.ts";
import {
  attachTelegramVision,
  isAudioMediaType,
  isVideoMediaType,
  looksLikeAudioFilename,
  looksLikeVideoFilename,
  persistScopeFromDeliver,
  referToTelegramFiles,
} from "./telegram-vision.ts";

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("sniffImageMediaType", () => {
  it("recognizes jpeg, png, gif, and webp", () => {
    assert.equal(sniffImageMediaType(jpeg), "image/jpeg");
    assert.equal(sniffImageMediaType(png), "image/png");
    assert.equal(sniffImageMediaType(Buffer.from("GIF89a")), "image/gif");
    assert.equal(
      sniffImageMediaType(Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])),
      "image/webp",
    );
    assert.equal(sniffImageMediaType(Buffer.from("%PDF-1.4")), null);
  });
});

describe("image filename and media type helpers", () => {
  it("accepts specific image types and common extensions", () => {
    assert.equal(isImageMediaType("image/jpeg"), true);
    assert.equal(isImageMediaType("application/octet-stream"), false);
    assert.equal(looksLikeImageFilename("photo.jpg"), true);
    assert.equal(looksLikeImageFilename("label.pdf"), false);
  });

  it("accepts audio and video types used by Telegram", () => {
    assert.equal(isAudioMediaType("audio/ogg"), true);
    assert.equal(isAudioMediaType("audio/*"), false);
    assert.equal(looksLikeAudioFilename("voice.ogg"), true);
    assert.equal(isVideoMediaType("video/mp4"), true);
    assert.equal(looksLikeVideoFilename("plate.mp4"), true);
    assert.equal(looksLikeVideoFilename("voice.ogg"), false);
  });
});

describe("referToTelegramFiles", () => {
  it("names photos, voice notes and videos, and leaves the rest to eve", () => {
    const pdf = { data: "eve-url:telegram-file:doc", filename: "label.pdf", mediaType: "application/pdf", type: "file" as const };
    const content = referToTelegramFiles([
      { text: "Add 100 ml", type: "text" },
      { data: new URL("telegram-file:photo1?filename=photo.jpg"), filename: "photo.jpg", mediaType: "application/octet-stream", type: "file" },
      { data: "eve-url:telegram-file:voice1", filename: "voice.ogg", mediaType: "audio/ogg", type: "file" },
      { data: "telegram-file:video1", filename: "plate.mp4", mediaType: "video/mp4", type: "file" },
      pdf,
    ]);
    assert.deepEqual(content, [
      { text: "Add 100 ml", type: "text" },
      { data: mediaRef("telegram", "photo1"), filename: "photo.jpg", mediaType: "image/jpeg", type: "file" },
      { data: mediaRef("telegram", "voice1"), filename: "voice.ogg", mediaType: "audio/ogg", type: "file" },
      { data: mediaRef("telegram", "video1"), filename: "plate.mp4", mediaType: "video/mp4", type: "file" },
      pdf,
    ]);
    assert.deepEqual(JSON.parse(JSON.stringify(content)), content);
  });

  it("remembers the files so the turn keeps them", async () => {
    const channel = { adapter: { deliver: async (payload: Record<string, unknown>) => payload } };
    attachTelegramVision(channel);
    await channel.adapter.deliver(
      { message: [{ data: "telegram-file:kept", filename: "photo.jpg", mediaType: "image/jpeg", type: "file" }] },
      // @ts-expect-error the adapter passes the context second
      { session: { id: "sess-deliver" } },
    );
    assert.deepEqual(filesForTurnMediaPersist("sess-deliver", [{ type: "file", mediaType: "image/jpeg" }]), [
      { fileId: "kept", filename: "photo.jpg", index: 0, mediaType: "image/jpeg" },
    ]);
  });
});

describe("persistScopeFromDeliver", () => {
  it("builds a persist scope from telegram deliver context without a turn id", () => {
    const pending = persistScopeFromDeliver({
      session: {
        id: "sess_1",
        auth: { current: { principalId: "user_1", principalType: "user" } },
      },
    });
    assert.deepEqual(pending, {
      channel: "telegram",
      sessionId: "sess_1",
      turnId: "pending",
      userId: "user_1",
    });
    const withTurn = persistScopeFromDeliver({
      session: { id: "sess_1", turn: { id: "turn_9" } },
    });
    assert.equal(withTurn?.turnId, "turn_9");
    assert.equal(persistScopeFromDeliver({}), null);
  });
});
