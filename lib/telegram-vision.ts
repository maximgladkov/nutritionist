import type { FilePart, UserContent } from "ai";
import { normalizeChannelKind } from "./agent-turn-model.ts";
import { isImageMediaType, looksLikeImageFilename, sniffImageMediaType } from "./image-bytes.ts";
import type { TurnFilePersistScope } from "./persist-turn-files.ts";
import { PENDING_ATTACHMENT_TURN_ID } from "./user-attachments-query.ts";

export function isAudioMediaType(mediaType: string | undefined): boolean {
  return mediaType?.toLowerCase().startsWith("audio/") === true && mediaType.toLowerCase() !== "audio/*";
}

export function isVideoMediaType(mediaType: string | undefined): boolean {
  return mediaType?.toLowerCase().startsWith("video/") === true && mediaType.toLowerCase() !== "video/*";
}

export function looksLikeAudioFilename(filename: string | undefined): boolean {
  return /\.(aac|flac|m4a|mp3|oga|ogg|opus|wav)$/iu.test(filename ?? "");
}

export function looksLikeVideoFilename(filename: string | undefined): boolean {
  return /\.(3gp|3gpp|mov|mp4|mpeg|mpg|webm|wmv)$/iu.test(filename ?? "");
}

const EVE_URL_PREFIX = "eve-url:";

export type TelegramFileFetch = (
  url: string,
) => Promise<Buffer | { bytes: Buffer; mediaType?: string } | null>;

type ChannelAdapterLike = {
  deliver?: (payload: Record<string, unknown>, ctx: unknown) => unknown;
  fetchFile?: (
    url: string,
    context?: unknown,
  ) => Promise<Buffer | { bytes: Buffer; mediaType?: string } | null>;
};

export async function inlineTelegramImages(
  content: string | UserContent,
  fetchFile: TelegramFileFetch,
  persist?: TurnFilePersistScope,
): Promise<string | UserContent> {
  if (typeof content === "string" || !Array.isArray(content)) {
    return content;
  }
  let fileIndex = 0;
  const parts = [];
  for (const part of content) {
    const next = await inlineTelegramImagePart(part, fetchFile, persist, fileIndex);
    if (isFilePart(part)) {
      fileIndex += 1;
    }
    parts.push(next);
  }
  return parts as UserContent;
}

export function attachTelegramVision<T extends object>(channel: T, fetchFile: TelegramFileFetch): T {
  const adapter = (channel as { adapter?: ChannelAdapterLike }).adapter;
  if (!adapter) {
    return channel;
  }

  const originalFetch = adapter.fetchFile;
  adapter.fetchFile = async (url, context) => {
    const result = originalFetch === undefined ? await fetchFile(url) : await originalFetch(url, context);
    return withSniffedImageType(result);
  };

  const originalDeliver = adapter.deliver;
  adapter.deliver = async (payload, ctx) => {
    const delivered = originalDeliver === undefined ? undefined : await originalDeliver(payload, ctx);
    const step = isRecord(delivered) ? delivered : payload;
    if (!isRecord(step) || step.message === undefined) {
      return delivered ?? payload;
    }
    const persist = persistScopeFromDeliver(ctx);
    return {
      ...step,
      message: await inlineTelegramImages(
        step.message as string | UserContent,
        (url) => (adapter.fetchFile === undefined ? fetchFile(url) : adapter.fetchFile(url)),
        persist ?? undefined,
      ),
    };
  };

  return channel;
}

export function withSniffedImageType(
  result: Buffer | { bytes: Buffer; mediaType?: string } | null,
): Buffer | { bytes: Buffer; mediaType?: string } | null {
  if (result === null) {
    return null;
  }
  const bytes = Buffer.isBuffer(result) ? result : result.bytes;
  const sniffed = sniffImageMediaType(bytes);
  if (sniffed === null) {
    return result;
  }
  if (Buffer.isBuffer(result)) {
    return { bytes, mediaType: sniffed };
  }
  if (isImageMediaType(result.mediaType)) {
    return result;
  }
  return { ...result, mediaType: sniffed };
}

async function inlineTelegramImagePart(
  part: unknown,
  fetchFile: TelegramFileFetch,
  persist: TurnFilePersistScope | undefined,
  index: number,
) {
  if (!isFilePart(part)) {
    return part;
  }
  const url = filePartUrl(part.data);
  if (url === null) {
    const inlined = inlineLocalFilePart(part);
    return persistIfNeeded(inlined, persist, index, localFileBytes(part.data) ?? undefined);
  }
  if (!shouldInlineTelegramFile(part.mediaType, part.filename)) {
    return part;
  }
  try {
    const result = await fetchFile(url);
    if (result === null) {
      return part;
    }
    const bytes = Buffer.isBuffer(result) ? result : result.bytes;
    const fetchedType = Buffer.isBuffer(result) ? undefined : result.mediaType;
    const mediaType = resolvedInlineMediaType(bytes, fetchedType, part);
    if (mediaType === undefined) {
      return part;
    }
    return persistIfNeeded(visionFilePart(bytes, mediaType, part.filename), persist, index, bytes);
  } catch {
    return part;
  }
}

function inlineLocalFilePart(part: FilePart): FilePart {
  const bytes = localFileBytes(part.data);
  if (bytes === null || !shouldInlineTelegramFile(part.mediaType, part.filename)) {
    return part;
  }
  const mediaType = resolvedInlineMediaType(bytes, undefined, part);
  if (mediaType === undefined) {
    return part;
  }
  return visionFilePart(bytes, mediaType, part.filename);
}

function visionFilePart(bytes: Uint8Array, mediaType: string, filename?: string): FilePart {
  return {
    type: "file",
    mediaType,
    ...(filename === undefined ? {} : { filename }),
    data: { type: "data", data: Buffer.from(bytes).toString("base64") },
  };
}

function shouldInlineTelegramFile(mediaType: string | undefined, filename: string | undefined) {
  return (
    isImageMediaType(mediaType) ||
    isAudioMediaType(mediaType) ||
    isVideoMediaType(mediaType) ||
    looksLikeImageFilename(filename) ||
    looksLikeAudioFilename(filename) ||
    looksLikeVideoFilename(filename)
  );
}

function resolvedInlineMediaType(
  bytes: Uint8Array,
  fetchedType: string | undefined,
  part: Pick<FilePart, "filename" | "mediaType">,
) {
  const sniffed = sniffImageMediaType(bytes);
  if (sniffed !== null) {
    return sniffed;
  }
  if (isInlineMediaType(fetchedType)) {
    return fetchedType;
  }
  if (isInlineMediaType(part.mediaType)) {
    return part.mediaType;
  }
  if (looksLikeAudioFilename(part.filename)) {
    return "audio/ogg";
  }
  if (looksLikeVideoFilename(part.filename)) {
    return "video/mp4";
  }
  return undefined;
}

function isInlineMediaType(mediaType: string | undefined): mediaType is string {
  return isImageMediaType(mediaType) || isAudioMediaType(mediaType) || isVideoMediaType(mediaType);
}

function isFilePart(part: unknown): part is FilePart {
  return typeof part === "object" && part !== null && "type" in part && part.type === "file";
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
  if (data.startsWith("telegram-file:")) {
    return data;
  }
  return null;
}

function localFileBytes(data: unknown): Uint8Array | null {
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(data)) {
    return data;
  }
  if (data instanceof Uint8Array) {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  return null;
}

export function persistScopeFromDeliver(ctx: unknown): TurnFilePersistScope | null {
  if (!isRecord(ctx)) {
    return null;
  }
  const session = isRecord(ctx.session) ? ctx.session : null;
  if (session === null || typeof session.id !== "string" || session.id.length === 0) {
    return null;
  }
  const turn = isRecord(session.turn) ? session.turn : isRecord(ctx.turn) ? ctx.turn : null;
  const turnId =
    typeof turn?.id === "string" && turn.id.length > 0
      ? turn.id
      : typeof ctx.turnId === "string" && ctx.turnId.length > 0
        ? ctx.turnId
        : PENDING_ATTACHMENT_TURN_ID;
  const channel = isRecord(ctx.channel) ? ctx.channel : null;
  const kind = typeof channel?.kind === "string" ? channel.kind : "telegram";
  const auth = isRecord(session.auth) ? session.auth : null;
  const caller = isRecord(auth?.current) ? auth.current : isRecord(auth?.initiator) ? auth.initiator : null;
  const principalId = typeof caller?.principalId === "string" ? caller.principalId : null;
  return {
    channel: normalizeChannelKind(kind),
    sessionId: session.id,
    turnId,
    userId: principalId,
  };
}

async function persistIfNeeded(
  part: FilePart,
  persist: TurnFilePersistScope | undefined,
  index: number,
  bytes?: Uint8Array,
) {
  if (persist === undefined) {
    return part;
  }
  const payload = bytes ?? localFileBytes(part.data);
  if (payload === null) {
    return part;
  }
  const { persistInlineUserFile } = await import("./persist-turn-files.ts");
  await persistInlineUserFile({
    ...persist,
    bytes: payload,
    filename: part.filename,
    index,
    mediaType: part.mediaType,
  });
  return part;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
