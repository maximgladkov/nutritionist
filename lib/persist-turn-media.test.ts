import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyTranscript } from "./agent-turn-model.ts";
import {
  applyStoredAttachmentsToTranscript,
  persistTurnMediaFilesFromMessage,
  persistTurnMediaFilesFromParts,
} from "./persist-turn-media.ts";
import type { PersistedUserAttachment } from "./user-attachments.ts";

describe("persistTurnMediaFilesFromMessage", () => {
  it("collects telegram file ids from eve-url and telegram-file parts", () => {
    assert.deepEqual(
      persistTurnMediaFilesFromMessage([
        { type: "text", text: "lunch" },
        {
          type: "file",
          mediaType: "image/jpeg",
          filename: "photo-0.jpg",
          data: "eve-url:telegram-file:AgAC1?filename=photo-0.jpg",
        },
        {
          type: "file",
          mediaType: "image/jpeg",
          filename: "photo-1.jpg",
          data: "telegram-file:AgAC2",
        },
      ]),
      [
        { fileId: "AgAC1", filename: "photo-0.jpg", index: 0, mediaType: "image/jpeg" },
        { fileId: "AgAC2", filename: "photo-1.jpg", index: 1, mediaType: "image/jpeg" },
      ],
    );
  });

  it("skips text-only messages", () => {
    assert.deepEqual(persistTurnMediaFilesFromMessage("hello"), []);
  });

  it("collects telegram file ids from received hook parts", () => {
    assert.deepEqual(
      persistTurnMediaFilesFromParts([
        { type: "text", text: "lunch" },
        {
          type: "file",
          filename: "photo-0.jpg",
          mediaType: "image/jpeg",
          url: "telegram-file:AgAC1",
        },
        { type: "file", filename: "photo-1.jpg", mediaType: "image/jpeg" },
      ]),
      [{ fileId: "AgAC1", filename: "photo-0.jpg", index: 0, mediaType: "image/jpeg" }],
    );
  });
});

describe("applyStoredAttachmentsToTranscript", () => {
  it("writes admin URLs onto url-less file parts and synthesizes leftovers", () => {
    const stored: PersistedUserAttachment[] = [
      storedAttachment("att-a", "photo-0.jpg"),
      storedAttachment("att-b", "photo-1.jpg"),
    ];
    const patched = applyStoredAttachmentsToTranscript(
      {
        ...emptyTranscript(),
        items: [
          {
            at: "2026-09-06T11:00:00.000Z",
            parts: [
              { type: "text", text: "lunch" },
              { type: "file", filename: "photo-0.jpg", mediaType: "image/jpeg" },
            ],
            text: "lunch",
            type: "user",
          },
        ],
      },
      stored,
    );
    const user = patched.items[0];
    assert.equal(user?.type, "user");
    if (user?.type !== "user") {
      return;
    }
    assert.equal(user.parts?.[1]?.url, "/admin/attachments/att-a");
    assert.equal(user.parts?.[2]?.url, "/admin/attachments/att-b");
  });
});

function storedAttachment(id: string, filename: string): PersistedUserAttachment {
  return {
    blobPath: `attachments/sess/turn/${filename}`,
    blobUrl: `https://blob.example/${id}`,
    filename,
    id,
    mediaType: "image/jpeg",
    size: 12,
  };
}
