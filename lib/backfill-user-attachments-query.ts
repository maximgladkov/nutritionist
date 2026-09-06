import type { AgentTurnTranscript, AgentTurnUserPart } from "./agent-turn-model.ts";
import { isImageMediaType, looksLikeImageFilename } from "./image-bytes.ts";
import { adminAttachmentUrl, isAdminAttachmentUrl, recoverableAttachmentKind } from "./user-attachments-query.ts";

export type BackfillFilePart = {
  itemIndex: number;
  partIndex: number;
  part: AgentTurnUserPart;
};

export function collectBackfillFileParts(transcript: AgentTurnTranscript): BackfillFilePart[] {
  const found: BackfillFilePart[] = [];
  for (const [itemIndex, item] of transcript.items.entries()) {
    if (item.type !== "user" || item.parts === undefined) {
      continue;
    }
    for (const [partIndex, part] of item.parts.entries()) {
      if ((part.type === "file" || part.type === "image") && !isAdminAttachmentUrl(part.url)) {
        found.push({ itemIndex, partIndex, part });
      }
    }
  }
  return found;
}

export function patchTranscriptPartUrl(
  transcript: AgentTurnTranscript,
  itemIndex: number,
  partIndex: number,
  attachmentId: string,
): AgentTurnTranscript {
  const items = transcript.items.map((item, currentItem) => {
    if (currentItem !== itemIndex || item.type !== "user" || item.parts === undefined) {
      return item;
    }
    return {
      ...item,
      parts: item.parts.map((part, currentPart) =>
        currentPart === partIndex ? { ...part, url: adminAttachmentUrl(attachmentId) } : part,
      ),
    };
  });
  return { ...transcript, items };
}

export function isFilenameOnlyImagePart(part: AgentTurnUserPart): boolean {
  return (
    (part.type === "file" || part.type === "image") &&
    recoverableAttachmentKind(part.url) === "none" &&
    (isImageMediaType(part.mediaType) || looksLikeImageFilename(part.filename))
  );
}

export function backfillPartSkipReason(part: AgentTurnUserPart): "persisted" | "unrecoverable" | null {
  const kind = recoverableAttachmentKind(part.url);
  if (kind === "persisted") {
    return "persisted";
  }
  if (kind === "none") {
    return isFilenameOnlyImagePart(part) ? null : "unrecoverable";
  }
  return null;
}
