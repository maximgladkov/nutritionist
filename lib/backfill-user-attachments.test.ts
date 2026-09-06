import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyTranscript, type AgentTurnTranscript } from "./agent-turn-model.ts";
import { backfillUserAttachments } from "./backfill-user-attachments.ts";
import type { PersistUserAttachmentInput, PersistedUserAttachment } from "./user-attachments.ts";

describe("backfillUserAttachments", () => {
  it("persists recoverable URLs and skips metadata-only parts", async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff]);
    const turns: AgentTurnTranscript[] = [
      userTranscript([
        { type: "file", filename: "plate.jpg", mediaType: "image/jpeg" },
        {
          type: "file",
          filename: "label.jpg",
          mediaType: "image/jpeg",
          url: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
        },
      ]),
    ];
    const persisted: PersistUserAttachmentInput[] = [];
    const result = await backfillUserAttachments({
      loadBytes: async (part) => {
        if (part.url?.startsWith("data:")) {
          return { bytes: jpeg, mediaType: "image/jpeg" };
        }
        return null;
      },
      persist: async (input) => {
        persisted.push(input);
        return stored("att-new");
      },
      store: {
        async *listTurns() {
          yield {
            channel: "telegram",
            id: "turn-row",
            messages: turns[0],
            sessionId: "sess",
            turnId: "turn",
            userId: "user-1",
          };
        },
        async saveMessages(id, messages) {
          assert.equal(id, "turn-row");
          turns[0] = messages;
        },
      },
    });

    assert.deepEqual(result, {
      fileParts: 2,
      patchedTurns: 1,
      persisted: 1,
      scannedTurns: 1,
      skipped: 1,
    });
    assert.equal(persisted[0]?.filename, "label.jpg");
    const patched = turns[0]?.items[0];
    assert.equal(patched?.type === "user" ? patched.parts?.[1]?.url : undefined, "/admin/attachments/att-new");
    assert.equal(patched?.type === "user" ? patched.parts?.[0]?.url : undefined, undefined);
  });

  it("patches filename-only image parts when a turn attachment already exists", async () => {
    const turns: AgentTurnTranscript[] = [
      userTranscript([{ type: "file", filename: "plate.jpg", mediaType: "image/jpeg" }]),
    ];
    const persisted: PersistUserAttachmentInput[] = [];
    const result = await backfillUserAttachments({
      loadBytes: async () => null,
      persist: async (input) => {
        persisted.push(input);
        return stored("att-should-not");
      },
      store: {
        async *listTurns() {
          yield {
            channel: "telegram",
            id: "turn-row",
            messages: turns[0],
            sessionId: "sess",
            turnId: "turn",
            userId: "user-1",
          };
        },
        async listTurnAttachments() {
          return [stored("att-existing")];
        },
        async saveMessages(id, messages) {
          assert.equal(id, "turn-row");
          turns[0] = messages;
        },
      },
    });

    assert.deepEqual(result, {
      fileParts: 1,
      patchedTurns: 1,
      persisted: 1,
      scannedTurns: 1,
      skipped: 0,
    });
    assert.equal(persisted.length, 0);
    const patched = turns[0]?.items[0];
    assert.equal(patched?.type === "user" ? patched.parts?.[0]?.url : undefined, "/admin/attachments/att-existing");
  });

  it("counts recoverable parts in dry-run without writing", async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff]);
    const saved: unknown[] = [];
    const result = await backfillUserAttachments({
      dryRun: true,
      persist: async () => {
        throw new Error("persist should not run");
      },
      store: {
        async *listTurns() {
          yield {
            channel: "web",
            id: "turn-row",
            messages: userTranscript([
              {
                type: "file",
                mediaType: "image/jpeg",
                url: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
              },
              { type: "file", mediaType: "image/jpeg" },
            ]),
            sessionId: "sess",
            turnId: "turn",
            userId: null,
          };
        },
        async listTurnAttachments() {
          return [];
        },
        async saveMessages() {
          saved.push("saved");
        },
      },
    });
    assert.deepEqual(result, {
      fileParts: 2,
      patchedTurns: 0,
      persisted: 1,
      scannedTurns: 1,
      skipped: 1,
    });
    assert.equal(saved.length, 0);
  });
});

function stored(id: string): PersistedUserAttachment {
  return {
    blobPath: `attachments/sess/turn/${id}.jpg`,
    blobUrl: `https://blob.example/${id}`,
    filename: `${id}.jpg`,
    id,
    mediaType: "image/jpeg",
    size: 3,
  };
}

function userTranscript(
  parts: { filename?: string; mediaType?: string; type: string; url?: string }[],
): AgentTurnTranscript {
  return {
    ...emptyTranscript(),
    items: [
      {
        at: "2026-01-01T00:00:00.000Z",
        parts,
        text: "",
        type: "user",
      },
    ],
  };
}
