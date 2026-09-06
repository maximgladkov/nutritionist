import type { AgentTurnUserPart } from "./agent-turn-model.ts";
import { isImageMediaType } from "./image-bytes.ts";
import {
  adminAttachmentUrl,
  decodeDataUrl,
  isAdminAttachmentUrl,
  isHttpOrHttpsUrl,
  listTurnAttachments,
  telegramFileIdFromUrl,
  persistUserAttachment,
  type PersistedUserAttachment,
} from "./user-attachments.ts";

export type TurnFilePersistScope = {
  channel: string;
  sessionId: string;
  turnId: string;
  userId: string | null;
};

export type ReceivedTurnPart = {
  filename?: string;
  mediaType?: string;
  size?: number;
  text?: string;
  type: string;
  url?: string;
};

type SandboxFileReader = {
  getSandbox(): Promise<{
    readBinaryFile(input: { path: string }): PromiseLike<Uint8Array | null>;
    run(input: { command: string }): PromiseLike<{ stdout?: string }>;
  }>;
};

export async function persistTurnUserFiles(input: {
  ctx?: SandboxFileReader;
  parts: readonly ReceivedTurnPart[] | undefined;
  scope: TurnFilePersistScope;
}): Promise<AgentTurnUserPart[] | undefined> {
  const received = receivedParts(input.parts);
  const fileIndexes: number[] = [];
  if (received) {
    for (const [index, part] of received.entries()) {
      if (isFileLikePart(part)) {
        fileIndexes.push(index);
      }
    }
  }

  for (const index of fileIndexes) {
    const part = received?.[index];
    if (!part || isAdminAttachmentUrl(part.url)) {
      continue;
    }
    const fromUrl = await persistFromPartUrl(part, index, input.scope);
    if (fromUrl && received) {
      received[index] = withAttachmentUrl(part, fromUrl);
    }
  }

  const existing = await listTurnAttachments(input.scope.sessionId, input.scope.turnId);
  const usedIds = new Set(
    (received ?? [])
      .map((part) => attachmentIdFromPart(part))
      .filter((id): id is string => id !== null),
  );
  const unused = existing.filter((row) => !usedIds.has(row.id));

  if (received) {
    for (const index of fileIndexes) {
      const part = received[index];
      if (!part || isAdminAttachmentUrl(part.url)) {
        continue;
      }
      const matched = takeMatchingAttachment(unused, part);
      if (matched) {
        usedIds.add(matched.id);
        received[index] = withAttachmentUrl(part, matched);
      }
    }
  }

  const sandboxFiles = await readSandboxAttachments(input.ctx);
  for (const [sandboxIndex, file] of sandboxFiles.entries()) {
    const unmatchedIndex = fileIndexes.find((index) => {
      const part = received?.[index];
      return part !== undefined && isFileLikePart(part) && !isAdminAttachmentUrl(part.url);
    });
    const targetPart = unmatchedIndex === undefined ? undefined : received?.[unmatchedIndex];
    const stored = await persistUserAttachment({
      bytes: file.bytes,
      channel: input.scope.channel,
      filename: targetPart?.filename ?? file.filename,
      index: unmatchedIndex ?? sandboxIndex,
      mediaType: targetPart?.mediaType ?? file.mediaType,
      sessionId: input.scope.sessionId,
      turnId: input.scope.turnId,
      userId: input.scope.userId,
    });
    if (!stored) {
      continue;
    }
    usedIds.add(stored.id);
    if (unmatchedIndex !== undefined && received) {
      const part = received[unmatchedIndex];
      if (part) {
        received[unmatchedIndex] = withAttachmentUrl(part, stored);
      }
    }
  }

  return received;
}

export async function persistInlineUserFile(
  input: TurnFilePersistScope & {
    bytes: Uint8Array;
    filename?: string;
    index: number;
    mediaType: string;
  },
): Promise<PersistedUserAttachment | null> {
  try {
    return await persistUserAttachment({
      bytes: input.bytes,
      channel: input.channel,
      filename: input.filename,
      index: input.index,
      mediaType: input.mediaType,
      sessionId: input.sessionId,
      turnId: input.turnId,
      userId: input.userId,
    });
  } catch (error) {
    console.error("inline user attachment persist failed", error);
    return null;
  }
}

function receivedParts(parts: readonly ReceivedTurnPart[] | undefined): AgentTurnUserPart[] | undefined {
  if (parts === undefined || parts.length === 0) {
    return undefined;
  }
  return parts.map((part) => ({
    filename: part.filename,
    mediaType: part.mediaType,
    size: part.size,
    text: part.text,
    type: part.type,
    url: part.url,
  }));
}

function isFileLikePart(part: AgentTurnUserPart) {
  return part.type === "file" || part.type === "image";
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

function attachmentIdFromPart(part: AgentTurnUserPart): string | null {
  if (!isAdminAttachmentUrl(part.url) || part.url === undefined) {
    return null;
  }
  const encoded = part.url.slice("/admin/attachments/".length);
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

function takeMatchingAttachment(
  unused: PersistedUserAttachment[],
  part: AgentTurnUserPart,
): PersistedUserAttachment | undefined {
  const byName = unused.findIndex(
    (row) => part.filename !== undefined && row.filename === part.filename,
  );
  const index = byName >= 0 ? byName : 0;
  if (unused.length === 0) {
    return undefined;
  }
  return unused.splice(index, 1)[0];
}

async function persistFromPartUrl(
  part: AgentTurnUserPart,
  index: number,
  scope: TurnFilePersistScope,
): Promise<PersistedUserAttachment | null> {
  const url = part.url;
  if (url === undefined) {
    return null;
  }
  if (url.startsWith("data:")) {
    const decoded = decodeDataUrl(url);
    if (decoded === null) {
      return null;
    }
    return persistUserAttachment({
      bytes: decoded.bytes,
      channel: scope.channel,
      filename: part.filename,
      index,
      mediaType: part.mediaType ?? decoded.mediaType,
      sessionId: scope.sessionId,
      turnId: scope.turnId,
      userId: scope.userId,
    });
  }
  const telegramFileId = telegramFileIdFromUrl(url);
  if (telegramFileId !== null) {
    const { fetchTelegramFileBytes } = await import("./telegram-file.ts");
    const fetched = await fetchTelegramFileBytes(url);
    if (fetched === null) {
      return null;
    }
    return persistUserAttachment({
      bytes: fetched.bytes,
      channel: scope.channel,
      filename: part.filename,
      index,
      mediaType: part.mediaType ?? "application/octet-stream",
      sessionId: scope.sessionId,
      turnId: scope.turnId,
      userId: scope.userId,
    });
  }
  if (!isHttpOrHttpsUrl(url)) {
    return null;
  }
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    const mediaType = part.mediaType ?? response.headers.get("content-type")?.split(";")[0]?.trim() ?? "application/octet-stream";
    return persistUserAttachment({
      bytes,
      channel: scope.channel,
      filename: part.filename,
      index,
      mediaType,
      sessionId: scope.sessionId,
      turnId: scope.turnId,
      userId: scope.userId,
    });
  } catch (error) {
    console.error("user attachment fetch failed", error);
    return null;
  }
}

async function readSandboxAttachments(ctx: SandboxFileReader | undefined): Promise<
  { bytes: Uint8Array; filename: string; mediaType: string }[]
> {
  if (ctx === undefined) {
    return [];
  }
  try {
    const sandbox = await ctx.getSandbox();
    const listed = await sandbox.run({ command: "ls -1 /workspace/attachments" });
    const names = (listed.stdout ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.includes("/"));
    const files: { bytes: Uint8Array; filename: string; mediaType: string }[] = [];
    for (const filename of names) {
      try {
        const bytes = await sandbox.readBinaryFile({ path: `/workspace/attachments/${filename}` });
        if (bytes === null || bytes.byteLength === 0) {
          continue;
        }
        files.push({
          bytes,
          filename,
          mediaType: mediaTypeFromFilename(filename),
        });
      } catch {
        continue;
      }
    }
    return files;
  } catch {
    return [];
  }
}

function mediaTypeFromFilename(filename: string) {
  if (isImageMediaType(`image/${filename.split(".").at(-1) ?? ""}`)) {
    const ext = filename.split(".").at(-1)?.toLowerCase();
    if (ext === "jpg" || ext === "jpeg") {
      return "image/jpeg";
    }
    if (ext === "png") {
      return "image/png";
    }
    if (ext === "webp") {
      return "image/webp";
    }
    if (ext === "gif") {
      return "image/gif";
    }
  }
  if (/\.(ogg|opus)$/iu.test(filename)) {
    return "audio/ogg";
  }
  if (/\.mp4$/iu.test(filename)) {
    return "video/mp4";
  }
  return "application/octet-stream";
}
