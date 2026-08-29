import { transcribe } from "ai";
import { createTelegramFileUrl } from "eve/channels/telegram";
import type { TelegramMessage } from "eve/channels/telegram";
import type { TelegramFileFetch } from "./telegram-vision.ts";

export const TELEGRAM_TRANSCRIBE_MODEL = "google/gemini-3.5-transcribe";
export const TELEGRAM_AUDIO_TRANSCRIBE_FAILED =
  "Couldn't transcribe that voice note. Please type it instead.";

export type TelegramAudio = {
  fileId: string;
  fileName: string;
  mediaType: string;
};

export function telegramAudioFromMessage(message: Pick<TelegramMessage, "raw">): TelegramAudio | null {
  return parseTelegramVoice(message.raw.voice) ?? parseTelegramAudioFile(message.raw.audio);
}

export function telegramMessageHasInboundContent(
  message: Pick<TelegramMessage, "attachments" | "caption" | "raw" | "text">,
) {
  const text = message.text || message.caption;
  return text.trim().length > 0 || message.attachments.length > 0 || telegramAudioFromMessage(message) !== null;
}

export function applyTelegramTranscript(message: Pick<TelegramMessage, "caption" | "text">, transcript: string) {
  const existing = (message.text || message.caption).trim();
  Object.assign(message, { text: existing.length > 0 ? `${existing}\n${transcript}` : transcript });
}

export async function transcribeTelegramAudio(
  fetchFile: TelegramFileFetch,
  audio: TelegramAudio,
  transcribeBytes: (bytes: Buffer) => Promise<string> = defaultTranscribe,
): Promise<string | null> {
  try {
    const url = createTelegramFileUrl({
      fileId: audio.fileId,
      filename: audio.fileName,
      mediaType: audio.mediaType,
    });
    const result = await fetchFile(url.href);
    if (result === null) {
      return null;
    }
    const bytes = Buffer.isBuffer(result) ? result : result.bytes;
    const transcript = (await transcribeBytes(bytes)).trim();
    return transcript.length > 0 ? transcript : null;
  } catch {
    return null;
  }
}

async function defaultTranscribe(bytes: Buffer) {
  const { text } = await transcribe({
    audio: bytes,
    model: TELEGRAM_TRANSCRIBE_MODEL,
  });
  return text;
}

function parseTelegramVoice(value: unknown): TelegramAudio | null {
  if (!isRecord(value) || typeof value.file_id !== "string" || value.file_id.length === 0) {
    return null;
  }
  return {
    fileId: value.file_id,
    fileName: "voice.ogg",
    mediaType: typeof value.mime_type === "string" && value.mime_type.length > 0 ? value.mime_type : "audio/ogg",
  };
}

function parseTelegramAudioFile(value: unknown): TelegramAudio | null {
  if (!isRecord(value) || typeof value.file_id !== "string" || value.file_id.length === 0) {
    return null;
  }
  return {
    fileId: value.file_id,
    fileName: typeof value.file_name === "string" && value.file_name.length > 0 ? value.file_name : "audio.mp3",
    mediaType: typeof value.mime_type === "string" && value.mime_type.length > 0 ? value.mime_type : "audio/mpeg",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
