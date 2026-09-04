import { generateText } from "ai";
import { APP_NAME } from "./brand.ts";
import { isImageMediaType, looksLikeImageFilename } from "./image-bytes.ts";
import { isAudioMediaType, isVideoMediaType, looksLikeAudioFilename, looksLikeVideoFilename } from "./telegram-vision.ts";

export const TELEGRAM_ACK_MODEL = "google/gemini-3.5-flash-lite";
export const TELEGRAM_ACK_TIMEOUT_MS = 4000;
export const TELEGRAM_ACK_TURN_CONTEXT =
  "A short acknowledgement was already sent to the user. Do not narrate what you are about to do. Call tools if needed, then send only the actual result.";

export const TELEGRAM_ACK_SYSTEM =
  `You are ${APP_NAME} sending one Telegram acknowledgement. Reply with a very short, natural chat status that matches what they just asked, as if you already started. A few words is enough. Sound like a person, not a canned bot status. Vary the wording every time. Examples of the kind of reply, not lines to copy: calories or totals — Checking calories… / Смотрю калории… / Гляну, сколько вышло…; logging a meal — Logging that… / Записываю… / Сейчас внесу…; a photo — Looking at the photo… / Смотрю фото…; a voice note — Listening… / Слушаю…; a video — Watching the video… / Смотрю видео…; other — One sec… / Hang on… / Сейчас гляну…. Match look / listen / watch to the attachments listed for this turn. If there are several attachments, you can name the mix in a few words. Match the language of the latest user message. Do not use markdown. Do not ask a question. Do not say you will get back later. Do not claim the work is done.`;

export type TelegramAckFileKind = "audio" | "file" | "photo" | "video" | "voice";

export type TelegramAckFile = {
  format: string;
  kind: TelegramAckFileKind;
};

type TelegramAckAttachment = {
  fileName?: string;
  kind?: string;
  mediaType?: string;
};

export type TelegramAckInput = {
  caption: string;
  files?: readonly TelegramAckFile[];
  text: string;
};

type TelegramAckSender = {
  sendMessage: (message: string) => Promise<unknown>;
};

export function telegramAckFiles(attachments: readonly TelegramAckAttachment[]): TelegramAckFile[] {
  return attachments.map(classifyTelegramAckFile);
}

export function telegramAckFileSummary(files: readonly TelegramAckFile[]) {
  if (files.length === 0) {
    return null;
  }
  const items = files.map((file) => `${telegramAckFileKindLabel(file.kind)} (${file.format})`);
  if (files.length === 1) {
    return `The latest user message includes a ${items[0]}.`;
  }
  return `The latest user message includes ${String(files.length)} attachments: ${items.join(", ")}.`;
}

export function telegramAckVisibleUserText(input: { caption?: string; text?: string }) {
  return (input.text ?? "").trim() || (input.caption ?? "").trim();
}

export function telegramAckSystem(input: TelegramAckInput) {
  const files = input.files ?? [];
  const parts = [TELEGRAM_ACK_SYSTEM];
  const summary = telegramAckFileSummary(files);
  if (summary !== null) {
    parts.push(summary);
  }
  if (telegramAckVisibleUserText(input).length > 0) {
    parts.push("Reply in the same language as the latest user message.");
  }
  return parts.join(" ");
}

export function telegramAckUserContent(input: TelegramAckInput) {
  const message = telegramAckVisibleUserText(input);
  if (message.length > 0) {
    return message;
  }
  const files = input.files ?? [];
  if (files.length === 0) {
    return "(none)";
  }
  return `(${files.map((file) => telegramAckFileKindLabel(file.kind)).join(", ")})`;
}

export function coalesceTelegramAckTurns(
  messages: readonly { role: "assistant" | "user"; content: string }[],
) {
  const coalesced: { role: "assistant" | "user"; content: string }[] = [];
  for (const message of messages) {
    const last = coalesced.at(-1);
    if (last !== undefined && last.role === message.role) {
      last.content = `${last.content}\n${message.content}`;
      continue;
    }
    coalesced.push({ content: message.content, role: message.role });
  }
  while (coalesced[0]?.role === "assistant") {
    coalesced.shift();
  }
  return coalesced;
}

export function telegramAckMessages(input: TelegramAckInput) {
  return coalesceTelegramAckTurns([
    { role: "user" as const, content: telegramAckUserContent(input) },
  ]);
}

export function telegramAckErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export type TelegramAckUsage = {
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
};

export type TelegramAckGeneration = TelegramAckUsage & {
  model: string;
  text: string;
};

type TelegramAckGenerateResult = {
  providerMetadata?: unknown;
  text: string;
  totalUsage?: TelegramAckUsageSource;
  usage?: TelegramAckUsageSource;
};

type TelegramAckUsageSource = {
  inputTokenDetails?: {
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
  inputTokens?: number;
  outputTokens?: number;
  raw?: unknown;
};

export function telegramAckUsageFromGenerateResult(result: TelegramAckGenerateResult): TelegramAckUsage {
  const usage = result.usage ?? result.totalUsage;
  return {
    cacheReadTokens: finiteTokenCount(usage?.inputTokenDetails?.cacheReadTokens),
    cacheWriteTokens: finiteTokenCount(usage?.inputTokenDetails?.cacheWriteTokens),
    costUsd: costFromUnknown(result.providerMetadata) || costFromUnknown(usage?.raw),
    inputTokens: finiteTokenCount(usage?.inputTokens),
    outputTokens: finiteTokenCount(usage?.outputTokens),
  };
}

export async function generateTelegramAckText(input: TelegramAckInput): Promise<TelegramAckGeneration> {
  const result = await Promise.race([
    generateText({
      abortSignal: AbortSignal.timeout(TELEGRAM_ACK_TIMEOUT_MS),
      instructions: telegramAckSystem(input),
      maxOutputTokens: 80,
      maxRetries: 0,
      messages: telegramAckMessages(input),
      model: TELEGRAM_ACK_MODEL,
    }),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("telegram ack timed out")), TELEGRAM_ACK_TIMEOUT_MS);
    }),
  ]);
  const ack = result.text.trim();
  if (ack.length === 0) {
    throw new Error("telegram ack model returned empty text");
  }
  return {
    model: TELEGRAM_ACK_MODEL,
    text: ack,
    ...telegramAckUsageFromGenerateResult(result),
  };
}

export async function postTelegramAck(
  telegram: TelegramAckSender,
  input: TelegramAckInput,
): Promise<TelegramAckGeneration | false> {
  try {
    const ack = await generateTelegramAckText(input);
    await telegram.sendMessage(ack.text);
    return ack;
  } catch (error) {
    const message = telegramAckErrorMessage(error);
    console.error("telegram ack failed", error);
    try {
      await telegram.sendMessage(`Quick reply failed: ${message}`);
    } catch (deliveryError) {
      console.error("telegram ack error delivery failed", deliveryError);
    }
    return false;
  }
}

function finiteTokenCount(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function costFromUnknown(value: unknown): number {
  if (value === null || value === undefined) {
    return 0;
  }
  const direct = asFiniteNumber(value);
  if (direct !== null) {
    return direct;
  }
  if (typeof value !== "object") {
    return 0;
  }
  const record = value as Record<string, unknown>;
  for (const key of ["cost", "costUsd", "totalCost", "total_cost"]) {
    const found = asFiniteNumber(record[key]);
    if (found !== null) {
      return found;
    }
  }
  for (const nested of Object.values(record)) {
    if (nested !== null && typeof nested === "object") {
      const found = costFromUnknown(nested);
      if (found > 0) {
        return found;
      }
    }
  }
  return 0;
}

function classifyTelegramAckFile(attachment: TelegramAckAttachment): TelegramAckFile {
  const mediaType = attachment.mediaType?.split(";")[0]?.trim().toLowerCase();
  const fileName = attachment.fileName;
  if (attachment.kind === "photo" || isImageMediaType(mediaType) || looksLikeImageFilename(fileName)) {
    return { format: telegramAckFileFormat(mediaType, fileName, "jpeg"), kind: "photo" };
  }
  if (isAudioMediaType(mediaType) || looksLikeAudioFilename(fileName)) {
    return {
      format: telegramAckFileFormat(mediaType, fileName, "ogg"),
      kind: fileName === "voice.ogg" ? "voice" : "audio",
    };
  }
  if (isVideoMediaType(mediaType) || looksLikeVideoFilename(fileName)) {
    return { format: telegramAckFileFormat(mediaType, fileName, "mp4"), kind: "video" };
  }
  return { format: telegramAckFileFormat(mediaType, fileName, "file"), kind: "file" };
}

function telegramAckFileKindLabel(kind: TelegramAckFileKind) {
  if (kind === "voice") {
    return "voice note";
  }
  if (kind === "audio") {
    return "audio file";
  }
  return kind;
}

function telegramAckFileFormat(mediaType: string | undefined, fileName: string | undefined, fallback: string) {
  const subtype = mediaType?.includes("/") === true ? mediaType.slice(mediaType.indexOf("/") + 1) : "";
  if (subtype.length > 0 && subtype !== "*") {
    if (subtype === "jpg") {
      return "jpeg";
    }
    if (subtype === "mpeg") {
      return "mp3";
    }
    return subtype;
  }
  const extension = fileName?.match(/\.([A-Za-z0-9]+)$/u)?.[1]?.toLowerCase();
  if (extension === "jpg") {
    return "jpeg";
  }
  return extension ?? fallback;
}
