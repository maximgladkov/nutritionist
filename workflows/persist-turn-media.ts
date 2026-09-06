import { sleep } from "workflow";
import type { PersistTurnMediaInput } from "../lib/persist-turn-media.ts";

async function persistTurnMediaStep(input: PersistTurnMediaInput) {
  "use step";
  const { persistTurnMedia } = await import("../lib/persist-turn-media.ts");
  console.log("persist turn media", input.sessionId, input.turnId, String(input.files.length));
  return persistTurnMedia(input);
}

async function patchTurnTranscriptStep(input: PersistTurnMediaInput) {
  "use step";
  const { patchTurnTranscriptWithAttachments } = await import("../lib/persist-turn-media.ts");
  console.log("patch turn transcript attachments", input.sessionId, input.turnId);
  return patchTurnTranscriptWithAttachments(input);
}

export async function persistTurnMediaWorkflow(input: PersistTurnMediaInput) {
  "use workflow";
  const first = await persistTurnMediaStep(input);
  if (first.patched) {
    return first;
  }
  await sleep("2s");
  return patchTurnTranscriptStep(input);
}
