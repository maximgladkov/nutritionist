import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyTranscript, type AgentTurnTranscript } from "./agent-turn-model.ts";
import {
  backfillPartSkipReason,
  collectBackfillFileParts,
  patchTranscriptPartUrl,
} from "./backfill-user-attachments-query.ts";

describe("collectBackfillFileParts", () => {
  it("finds file parts that are not already persisted", () => {
    const transcript = userTranscript([
      { type: "file", filename: "photo.jpg", mediaType: "image/jpeg" },
      { type: "file", mediaType: "image/png", url: "/admin/attachments/att1" },
      { type: "text", text: "hi" },
    ]);
    const parts = collectBackfillFileParts(transcript);
    assert.equal(parts.length, 1);
    assert.equal(parts[0]?.part.filename, "photo.jpg");
    assert.equal(backfillPartSkipReason(parts[0]!.part), "unrecoverable");
    const persisted = parts.length === 1 ? transcript.items[0] : undefined;
    const persistedPart = persisted?.type === "user" ? persisted.parts?.[1] : undefined;
    assert.equal(persistedPart ? backfillPartSkipReason(persistedPart) : null, "persisted");
  });
});

describe("patchTranscriptPartUrl", () => {
  it("writes the durable admin URL onto the selected part", () => {
    const transcript = userTranscript([
      { type: "file", filename: "front.jpg", mediaType: "image/jpeg" },
    ]);
    const patched = patchTranscriptPartUrl(transcript, 0, 0, "att9");
    assert.equal(patched.items[0]?.type === "user" ? patched.items[0].parts?.[0]?.url : undefined, "/admin/attachments/att9");
  });
});

function userTranscript(parts: AgentTurnTranscript["items"][number] extends never ? never : { filename?: string; mediaType?: string; text?: string; type: string; url?: string }[]): AgentTurnTranscript {
  const transcript = emptyTranscript();
  return {
    ...transcript,
    items: [
      {
        at: "2026-01-01T00:00:00.000Z",
        parts,
        text: "[image: image/jpeg]",
        type: "user",
      },
    ],
  };
}
