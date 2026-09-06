import type { UserContent } from "ai";
import { Prisma } from "../generated/prisma/client.ts";
import { enqueueAgentTurnPersist } from "./agent-turn-persist.ts";
import {
  parseTranscript,
  replaceUserMessageParts,
  type AgentTurnTranscript,
  type AgentTurnUserPart,
} from "./agent-turn-model.ts";
import { prisma } from "./prisma.ts";
import { fetchTelegramFileBytes } from "./telegram-file.ts";
import {
  adminAttachmentUrl,
  isAdminAttachmentUrl,
  listTurnAttachments,
  persistUserAttachment,
  telegramFileIdFromUrl,
  type PersistedUserAttachment,
} from "./user-attachments.ts";
import { EVE_URL_PREFIX, TELEGRAM_FILE_PREFIX } from "./user-attachments-query.ts";

export type PersistTurnMediaFile = {
  bytesBase64?: string;
  fileId: string;
  filename?: string;
  index: number;
  mediaType?: string;
};

const MAX_WORKFLOW_FILE_BYTES = 1024 * 1024;
const telegramFileBytes = new Map<string, Buffer>();
const telegramTurnMedia = new Map<string, PersistTurnMediaFile[]>();

export function rememberTelegramFileBytes(fileId: string, bytes: Buffer): void {
  telegramFileBytes.set(fileId, bytes);
}

export function rememberTelegramTurnMedia(
  sessionId: string,
  file: Omit<PersistTurnMediaFile, "bytesBase64">,
): void {
  const files = telegramTurnMedia.get(sessionId) ?? [];
  files.push(file);
  telegramTurnMedia.set(sessionId, files);
}

export function takeRememberedTelegramTurnMedia(sessionId: string): PersistTurnMediaFile[] {
  const files = telegramTurnMedia.get(sessionId) ?? [];
  telegramTurnMedia.delete(sessionId);
  return files.map((file) => {
    const bytesBase64 = telegramFileBytesBase64(file.fileId);
    return bytesBase64 === undefined ? file : { ...file, bytesBase64 };
  });
}

export function filesForTurnMediaPersist(
  sessionId: string,
  parts: readonly { filename?: string; mediaType?: string; type: string; url?: string }[] | undefined,
): PersistTurnMediaFile[] {
  const fromParts = persistTurnMediaFilesFromParts(parts);
  const remembered = takeRememberedTelegramTurnMedia(sessionId);
  if (fromParts.length === 0) {
    return remembered;
  }
  return fromParts.map((file) => {
    const match = remembered.find((row) => row.fileId === file.fileId);
    if (match?.bytesBase64 === undefined) {
      return file;
    }
    return { ...file, bytesBase64: match.bytesBase64 };
  });
}

export function resetTelegramFileBytes(): void {
  telegramFileBytes.clear();
  telegramTurnMedia.clear();
}

function telegramFileBytesBase64(fileId: string): string | undefined {
  const bytes = telegramFileBytes.get(fileId);
  if (!bytes || bytes.byteLength > MAX_WORKFLOW_FILE_BYTES) {
    return undefined;
  }
  return bytes.toString("base64");
}

export type PersistTurnMediaInput = {
  channel: string;
  files: readonly PersistTurnMediaFile[];
  sessionId: string;
  turnId: string;
  userId: string | null;
};

export function persistTurnMediaFilesFromMessage(message: string | UserContent): PersistTurnMediaFile[] {
  if (typeof message === "string" || !Array.isArray(message)) {
    return [];
  }
  const files: PersistTurnMediaFile[] = [];
  let index = 0;
  for (const part of message) {
    if (typeof part !== "object" || part === null || !("type" in part) || part.type !== "file") {
      continue;
    }
    const record = part as { data?: unknown; filename?: string; mediaType?: string };
    const fileId = telegramFileIdFromUrl(filePartUrl(record.data) ?? undefined);
    if (fileId === null) {
      index += 1;
      continue;
    }
    files.push({
      fileId,
      index,
      ...(record.filename === undefined ? {} : { filename: record.filename }),
      ...(record.mediaType === undefined ? {} : { mediaType: record.mediaType }),
    });
    index += 1;
  }
  return files;
}

export function persistTurnMediaFilesFromParts(
  parts: readonly { filename?: string; mediaType?: string; type: string; url?: string }[] | undefined,
): PersistTurnMediaFile[] {
  if (parts === undefined) {
    return [];
  }
  const files: PersistTurnMediaFile[] = [];
  let index = 0;
  for (const part of parts) {
    if (part.type !== "file" && part.type !== "image") {
      continue;
    }
    const fileId = telegramFileIdFromUrl(part.url);
    if (fileId === null) {
      index += 1;
      continue;
    }
    files.push({
      fileId,
      index,
      ...(part.filename === undefined ? {} : { filename: part.filename }),
      ...(part.mediaType === undefined ? {} : { mediaType: part.mediaType }),
    });
    index += 1;
  }
  return files;
}

export function applyStoredAttachmentsToTranscript(
  transcript: AgentTurnTranscript,
  stored: readonly PersistedUserAttachment[],
): AgentTurnTranscript {
  if (stored.length === 0) {
    return transcript;
  }
  const user = transcript.items.find((item) => item.type === "user");
  if (user?.type !== "user") {
    return transcript;
  }
  const unused = [...stored];
  const nextParts: AgentTurnUserPart[] = [];
  for (const part of user.parts ?? []) {
    if (part.type !== "file" && part.type !== "image") {
      nextParts.push(part);
      continue;
    }
    if (isAdminAttachmentUrl(part.url)) {
      nextParts.push(part);
      continue;
    }
    const matched = takeMatchingAttachment(unused, part);
    if (!matched) {
      nextParts.push(part);
      continue;
    }
    nextParts.push(withAttachmentUrl(part, matched));
  }
  for (const leftover of unused) {
    nextParts.push({
      filename: leftover.filename ?? undefined,
      mediaType: leftover.mediaType,
      size: leftover.size ?? undefined,
      type: "file",
      url: adminAttachmentUrl(leftover.id),
    });
  }
  return replaceUserMessageParts(transcript, nextParts);
}

export function transcriptHasUserMessage(transcript: AgentTurnTranscript) {
  return transcript.items.some((item) => item.type === "user");
}

export async function persistTurnMedia(input: PersistTurnMediaInput): Promise<{ patched: boolean }> {
  for (const file of input.files) {
    const fetched = await resolveTurnMediaBytes(file);
    if (fetched === null) {
      continue;
    }
    await persistUserAttachment({
      bytes: fetched.bytes,
      channel: input.channel,
      fileId: file.fileId,
      filename: file.filename,
      index: file.index,
      mediaType: file.mediaType ?? "application/octet-stream",
      sessionId: input.sessionId,
      turnId: input.turnId,
      userId: input.userId,
    });
  }
  return enqueueTranscriptAttachmentPatch(input);
}

export async function patchTurnTranscriptWithAttachments(input: {
  sessionId: string;
  turnId: string;
}): Promise<{ patched: boolean }> {
  const row = await prisma.agentTurn.findUnique({
    select: { id: true, messages: true },
    where: { sessionId_turnId: { sessionId: input.sessionId, turnId: input.turnId } },
  });
  if (!row) {
    return { patched: false };
  }
  const transcript = parseTranscript(row.messages);
  if (!transcriptHasUserMessage(transcript)) {
    return { patched: false };
  }
  const stored = await listTurnAttachments(input.sessionId, input.turnId);
  const next = applyStoredAttachmentsToTranscript(transcript, stored);
  await prisma.agentTurn.update({
    data: { messages: next as unknown as Prisma.InputJsonValue },
    where: { id: row.id },
  });
  return { patched: true };
}

export function schedulePersistTurnMedia(input: PersistTurnMediaInput): void {
  if (input.files.length === 0) {
    return;
  }
  const files = input.files.map((file) => {
    if (file.bytesBase64 !== undefined) {
      return file;
    }
    const bytesBase64 = telegramFileBytesBase64(file.fileId);
    return bytesBase64 === undefined ? file : { ...file, bytesBase64 };
  });
  void startPersistTurnMediaRun({ ...input, files });
}

async function resolveTurnMediaBytes(file: PersistTurnMediaFile): Promise<{ bytes: Buffer } | null> {
  if (file.bytesBase64 !== undefined) {
    return { bytes: Buffer.from(file.bytesBase64, "base64") };
  }
  const cached = telegramFileBytes.get(file.fileId);
  if (cached) {
    return { bytes: cached };
  }
  return fetchTelegramFileBytes(file.fileId);
}

async function enqueueTranscriptAttachmentPatch(input: PersistTurnMediaInput): Promise<{ patched: boolean }> {
  let patched = false;
  await enqueueAgentTurnPersist(input.sessionId, input.turnId, async () => {
    patched = (await patchTurnTranscriptWithAttachments(input)).patched;
  });
  return { patched };
}

async function startPersistTurnMediaRun(input: PersistTurnMediaInput): Promise<void> {
  try {
    const [{ start }, { persistTurnMediaWorkflow }] = await Promise.all([
      import("workflow/api"),
      import("../workflows/persist-turn-media.ts"),
    ]);
    const run = await start(persistTurnMediaWorkflow, [input]);
    void run.returnValue.catch((error: unknown) => {
      console.error("persist turn media workflow failed", error);
    });
  } catch (error) {
    console.error("persist turn media workflow start failed", error);
    void persistTurnMedia(input).catch((persistError) => {
      console.error("persist turn media failed", persistError);
    });
  }
}

function filePartUrl(data: unknown): string | null {
  if (data instanceof URL) {
    return data.protocol === "data:" ? null : data.href;
  }
  if (typeof data !== "string") {
    return null;
  }
  if (data.startsWith(EVE_URL_PREFIX)) {
    return data.slice(EVE_URL_PREFIX.length);
  }
  if (data.startsWith(TELEGRAM_FILE_PREFIX) || data.startsWith("https://") || data.startsWith("http://")) {
    return data;
  }
  return null;
}

function withAttachmentUrl(part: AgentTurnUserPart, stored: PersistedUserAttachment): AgentTurnUserPart {
  return {
    ...part,
    filename: part.filename ?? stored.filename ?? undefined,
    mediaType: part.mediaType ?? stored.mediaType,
    size: part.size ?? stored.size ?? undefined,
    url: adminAttachmentUrl(stored.id),
  };
}

function takeMatchingAttachment(
  unused: PersistedUserAttachment[],
  part: AgentTurnUserPart,
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
