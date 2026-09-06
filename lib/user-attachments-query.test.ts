import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  adminAttachmentUrl,
  attachmentBlobPath,
  catalogImageUrl,
  decodeDataUrl,
  isAdminAttachmentUrl,
  isCatalogImageUrl,
  isHttpOrHttpsUrl,
  isOversizeBytes,
  recoverableAttachmentKind,
  safeAttachmentFilename,
  telegramFileIdFromUrl,
  USER_ATTACHMENT_MAX_BYTES,
} from "./user-attachments-query.ts";

describe("decodeDataUrl", () => {
  it("decodes a jpeg data URL", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff]);
    const decoded = decodeDataUrl(`data:image/jpeg;base64,${jpeg.toString("base64")}`);
    assert.deepEqual(decoded, { bytes: jpeg, mediaType: "image/jpeg" });
  });

  it("rejects a missing payload", () => {
    assert.equal(decodeDataUrl("data:image/jpeg;base64,"), null);
    assert.equal(decodeDataUrl("https://example.com/a.jpg"), null);
  });
});

describe("attachment naming", () => {
  it("sanitizes filenames and builds blob paths", () => {
    assert.equal(safeAttachmentFilename("../../meal photo.JPG", 0, "image/jpeg"), "meal_photo.JPG");
    assert.equal(safeAttachmentFilename(undefined, 2, "image/png"), "file-2.png");
    assert.equal(
      attachmentBlobPath("sess", "turn", "meal.jpg"),
      "attachments/sess/turn/0-meal.jpg",
    );
    assert.equal(
      attachmentBlobPath("sess", "pending", "meal.jpg", 1),
      "attachments/sess/pending/1-meal.jpg",
    );
  });
});

describe("size and URL helpers", () => {
  it("rejects oversized payloads", () => {
    assert.equal(isOversizeBytes(USER_ATTACHMENT_MAX_BYTES), false);
    assert.equal(isOversizeBytes(USER_ATTACHMENT_MAX_BYTES + 1), true);
  });

  it("recognizes stored attachment URLs", () => {
    assert.equal(isAdminAttachmentUrl(adminAttachmentUrl("abc")), true);
    assert.equal(isCatalogImageUrl(catalogImageUrl("img1")), true);
    assert.equal(isHttpOrHttpsUrl("https://cdn.example/a.jpg"), true);
    assert.equal(isHttpOrHttpsUrl("telegram-file:1"), false);
  });

  it("classifies recoverable part URLs", () => {
    assert.equal(recoverableAttachmentKind(undefined), "none");
    assert.equal(recoverableAttachmentKind(adminAttachmentUrl("abc")), "persisted");
    assert.equal(recoverableAttachmentKind("data:image/jpeg;base64,abc"), "data");
    assert.equal(recoverableAttachmentKind("https://cdn.example/a.jpg"), "http");
    assert.equal(
      recoverableAttachmentKind("eve-url:telegram-file:AgAC123?filename=photo.jpg"),
      "telegram",
    );
    assert.equal(
      telegramFileIdFromUrl("telegram-file:AgAC123?filename=photo.jpg&mediaType=image%2Fjpeg"),
      "AgAC123",
    );
    assert.equal(telegramFileIdFromUrl("https://api.telegram.org/file/bot/x"), null);
  });
});
