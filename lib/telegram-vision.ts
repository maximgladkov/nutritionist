import type { MessageContent } from "eve/channels";
import { normalizeChannelKind } from "./agent-turn-model.ts";
import { isImageMediaType, looksLikeImageFilename } from "./image-bytes.ts";
import { mediaRef, replaceDelivered } from "./media-ref.ts";
import { rememberTelegramTurnMedia } from "./persist-turn-media.ts";
import { PENDING_ATTACHMENT_TURN_ID, telegramFileIdFromUrl } from "./user-attachments-query.ts";

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

// Photos, voice notes and videos go on as references, put in place when the model is called.
export function referToTelegramFiles(content: MessageContent, sessionId?: string): MessageContent {
  if (typeof content === "string") {
    return content;
  }
  return content.map((part, index) => {
    if (part.type !== "file" || !shouldInlineTelegramFile(part.mediaType, part.filename)) {
      return part;
    }
    const fileId = telegramFileIdFromUrl(filePartUrl(part.data) ?? undefined);
    if (fileId === null) {
      return part;
    }
    const mediaType = resolvedMediaType(part);
    if (sessionId) {
      rememberTelegramTurnMedia(sessionId, {
        fileId,
        index,
        ...(part.filename === undefined ? {} : { filename: part.filename }),
        mediaType,
      });
    }
    return { ...part, data: mediaRef("telegram", fileId) as unknown as string, mediaType };
  });
}

export function attachTelegramVision<T extends object>(channel: T): T {
  return replaceDelivered(channel, (message, ctx) => referToTelegramFiles(message, persistScopeFromDeliver(ctx)?.sessionId));
}

function resolvedMediaType(part: { filename?: string; mediaType: string }): string {
  if (isInlineMediaType(part.mediaType)) return part.mediaType;
  if (looksLikeAudioFilename(part.filename)) return "audio/ogg";
  if (looksLikeVideoFilename(part.filename)) return "video/mp4";
  return "image/jpeg";
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

function isInlineMediaType(mediaType: string | undefined): mediaType is string {
  return isImageMediaType(mediaType) || isAudioMediaType(mediaType) || isVideoMediaType(mediaType);
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

export function persistScopeFromDeliver(ctx: unknown): {
  channel: string;
  sessionId: string;
  turnId: string;
  userId: string | null;
} | null {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
