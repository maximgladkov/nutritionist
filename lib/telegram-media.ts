import type { TelegramAttachment, TelegramMessage } from "eve/channels/telegram";

export type TelegramHiddenMedia = {
  fileId: string;
  fileName: string;
  mediaType: string;
  size?: number;
};

export function telegramHiddenMediaFromMessage(
  message: Pick<TelegramMessage, "attachments" | "raw">,
): TelegramHiddenMedia[] {
  const seen = new Set(message.attachments.map((attachment) => attachment.fileId));
  const extras: TelegramHiddenMedia[] = [];
  for (const media of [
    parseTelegramVoice(message.raw.voice),
    parseTelegramAudioFile(message.raw.audio),
    parseTelegramVideo(message.raw.video),
    parseTelegramVideoNote(message.raw.video_note),
  ]) {
    if (media === null || seen.has(media.fileId)) {
      continue;
    }
    seen.add(media.fileId);
    extras.push(media);
  }
  return extras;
}

export function telegramMessageHasInboundContent(
  message: Pick<TelegramMessage, "attachments" | "caption" | "raw" | "text">,
) {
  const text = message.text || message.caption;
  return (
    text.trim().length > 0 ||
    message.attachments.length > 0 ||
    telegramHiddenMediaFromMessage(message).length > 0
  );
}

export function applyTelegramHiddenMedia(message: TelegramMessage) {
  const extras = telegramHiddenMediaFromMessage(message);
  if (extras.length === 0) {
    return extras;
  }
  const attachments: TelegramAttachment[] = [
    ...message.attachments,
    ...extras.map((media) => hiddenMediaAttachment(media)),
  ];
  Object.assign(message, { attachments });
  return extras;
}

function hiddenMediaAttachment(media: TelegramHiddenMedia): TelegramAttachment {
  return {
    fileId: media.fileId,
    fileName: media.fileName,
    kind: "document",
    mediaType: media.mediaType,
    ...(media.size === undefined ? {} : { size: media.size }),
  };
}

function parseTelegramVoice(value: unknown): TelegramHiddenMedia | null {
  return parseTelegramFile(value, { fileName: "voice.ogg", mediaType: "audio/ogg" });
}

function parseTelegramAudioFile(value: unknown): TelegramHiddenMedia | null {
  return parseTelegramFile(value, { fileName: "audio.mp3", mediaType: "audio/mpeg" });
}

function parseTelegramVideo(value: unknown): TelegramHiddenMedia | null {
  return parseTelegramFile(value, { fileName: "video.mp4", mediaType: "video/mp4" });
}

function parseTelegramVideoNote(value: unknown): TelegramHiddenMedia | null {
  return parseTelegramFile(value, { fileName: "video_note.mp4", mediaType: "video/mp4" });
}

function parseTelegramFile(
  value: unknown,
  fallback: { fileName: string; mediaType: string },
): TelegramHiddenMedia | null {
  if (!isRecord(value) || typeof value.file_id !== "string" || value.file_id.length === 0) {
    return null;
  }
  return {
    fileId: value.file_id,
    fileName:
      typeof value.file_name === "string" && value.file_name.length > 0 ? value.file_name : fallback.fileName,
    mediaType: mimeType(value.mime_type, fallback.mediaType),
    ...(typeof value.file_size === "number" ? { size: value.file_size } : {}),
  };
}

function mimeType(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }
  const base = value.split(";")[0].trim().toLowerCase();
  return base.length > 0 ? base : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
