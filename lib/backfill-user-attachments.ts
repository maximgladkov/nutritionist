import { Prisma } from "../generated/prisma/client.ts";
import { parseTranscript, type AgentTurnTranscript } from "./agent-turn-model.ts";
import {
  collectBackfillFileParts,
  isFilenameOnlyImagePart,
  patchTranscriptPartUrl,
  type BackfillFilePart,
} from "./backfill-user-attachments-query.ts";
import { prisma } from "./prisma.ts";
import { listTurnAttachments as loadTurnAttachments, persistUserAttachment, type PersistedUserAttachment } from "./user-attachments.ts";
import { decodeDataUrl, isHttpOrHttpsUrl, recoverableAttachmentKind } from "./user-attachments-query.ts";
import { fetchTelegramFileBytes } from "./telegram-file.ts";

export type BackfillUserAttachmentsResult = {
  fileParts: number;
  patchedTurns: number;
  persisted: number;
  scannedTurns: number;
  skipped: number;
};

type BackfillTurn = {
  channel: string;
  id: string;
  messages: unknown;
  sessionId: string;
  turnId: string;
  userId: string | null;
};

export type BackfillUserAttachmentsStore = {
  listTurns(): AsyncIterable<BackfillTurn>;
  listTurnAttachments?(sessionId: string, turnId: string): Promise<PersistedUserAttachment[]>;
  saveMessages(id: string, messages: AgentTurnTranscript): Promise<void>;
};

export async function backfillUserAttachments(input: {
  dryRun?: boolean;
  loadBytes?: (part: BackfillFilePart["part"]) => Promise<{ bytes: Uint8Array; mediaType: string } | null>;
  persist?: typeof persistUserAttachment;
  store?: BackfillUserAttachmentsStore;
}): Promise<BackfillUserAttachmentsResult> {
  const dryRun = input.dryRun === true;
  const loadBytes = input.loadBytes ?? loadPartBytes;
  const persist = input.persist ?? persistUserAttachment;
  const store = input.store ?? prismaTurnStore();
  const result: BackfillUserAttachmentsResult = {
    fileParts: 0,
    patchedTurns: 0,
    persisted: 0,
    scannedTurns: 0,
    skipped: 0,
  };

  for await (const turn of store.listTurns()) {
    result.scannedTurns += 1;
    const transcript = parseTranscript(turn.messages);
    const parts = collectBackfillFileParts(transcript);
    if (parts.length === 0) {
      continue;
    }
    const unused = [...(await listStoredTurnAttachments(store, turn.sessionId, turn.turnId))];
    result.fileParts += parts.length;
    let next = transcript;
    let changed = false;
    for (const candidate of parts) {
      if (dryRun) {
        const kind = recoverableAttachmentKind(candidate.part.url);
        if (kind === "data" || kind === "http" || kind === "telegram") {
          result.persisted += 1;
        } else if (isFilenameOnlyImagePart(candidate.part) && takeMatchingAttachment(unused, candidate.part)) {
          result.persisted += 1;
        } else {
          result.skipped += 1;
        }
        continue;
      }
      const loaded = await loadBytes(candidate.part);
      if (loaded === null) {
        const existing = isFilenameOnlyImagePart(candidate.part)
          ? takeMatchingAttachment(unused, candidate.part)
          : undefined;
        if (existing) {
          result.persisted += 1;
          next = patchTranscriptPartUrl(next, candidate.itemIndex, candidate.partIndex, existing.id);
          changed = true;
          continue;
        }
        result.skipped += 1;
        continue;
      }
      const stored = await persist({
        bytes: loaded.bytes,
        channel: turn.channel,
        filename: candidate.part.filename,
        index: candidate.partIndex,
        mediaType: loaded.mediaType,
        sessionId: turn.sessionId,
        turnId: turn.turnId,
        userId: turn.userId,
      });
      if (stored === null) {
        result.skipped += 1;
        continue;
      }
      result.persisted += 1;
      next = patchTranscriptPartUrl(next, candidate.itemIndex, candidate.partIndex, stored.id);
      changed = true;
    }
    if (changed) {
      await store.saveMessages(turn.id, next);
      result.patchedTurns += 1;
    }
  }

  return result;
}

async function loadPartBytes(
  part: BackfillFilePart["part"],
): Promise<{ bytes: Uint8Array; mediaType: string } | null> {
  const kind = recoverableAttachmentKind(part.url);
  if (kind === "data" && part.url) {
    const decoded = decodeDataUrl(part.url);
    if (decoded === null) {
      return null;
    }
    return { bytes: decoded.bytes, mediaType: part.mediaType ?? decoded.mediaType };
  }
  if (kind === "telegram" && part.url) {
    const fetched = await fetchTelegramFileBytes(part.url);
    if (fetched === null) {
      return null;
    }
    return { bytes: fetched.bytes, mediaType: part.mediaType ?? "application/octet-stream" };
  }
  if (kind === "http" && part.url && isHttpOrHttpsUrl(part.url)) {
    try {
      const response = await fetch(part.url);
      if (!response.ok) {
        return null;
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length === 0) {
        return null;
      }
      const mediaType =
        part.mediaType ?? response.headers.get("content-type")?.split(";")[0]?.trim() ?? "application/octet-stream";
      return { bytes, mediaType };
    } catch (error) {
      console.error("user attachment backfill fetch failed", error);
      return null;
    }
  }
  return null;
}

function prismaTurnStore(): BackfillUserAttachmentsStore {
  return {
    async *listTurns() {
      let cursor: string | undefined;
      for (;;) {
        const rows = await prisma.agentTurn.findMany({
          orderBy: { id: "asc" },
          select: {
            channel: true,
            id: true,
            messages: true,
            sessionId: true,
            turnId: true,
            userId: true,
          },
          take: 50,
          ...(cursor === undefined ? {} : { skip: 1, cursor: { id: cursor } }),
        });
        if (rows.length === 0) {
          return;
        }
        for (const row of rows) {
          yield row;
          cursor = row.id;
        }
        if (rows.length < 50) {
          return;
        }
      }
    },
    listTurnAttachments(sessionId, turnId) {
      return loadTurnAttachments(sessionId, turnId);
    },
    async saveMessages(id, messages) {
      await prisma.agentTurn.update({
        data: { messages: messages as Prisma.InputJsonValue },
        where: { id },
      });
    },
  };
}

async function listStoredTurnAttachments(
  store: BackfillUserAttachmentsStore,
  sessionId: string,
  turnId: string,
): Promise<PersistedUserAttachment[]> {
  if (store.listTurnAttachments) {
    return store.listTurnAttachments(sessionId, turnId);
  }
  return [];
}

function takeMatchingAttachment(
  unused: PersistedUserAttachment[],
  part: { filename?: string },
): PersistedUserAttachment | undefined {
  if (unused.length === 0) {
    return undefined;
  }
  const byName = unused.findIndex(
    (row) => part.filename !== undefined && row.filename === part.filename,
  );
  const index = byName >= 0 ? byName : 0;
  return unused.splice(index, 1)[0];
}
