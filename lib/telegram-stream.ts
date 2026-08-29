import {
  TELEGRAM_MESSAGE_TEXT_MAX_LENGTH,
  type TelegramApiResponse,
  type TelegramHandle,
} from "eve/channels/telegram";

import { markdownToTelegramHtml, telegramHtmlMessage } from "./telegram-html.ts";

export const TELEGRAM_STREAM_EDIT_INTERVAL_MS = 700;

type TelegramStreamFields = {
  streamEditAt?: number | null;
  streamKey?: string | null;
  streamMessageId?: string | null;
};

export type TelegramStreamState = TelegramStreamFields;

export function telegramStreamKey(turnId: string, sequence: number) {
  return `${turnId}:${sequence}`;
}

export function shouldOpenTelegramStream(messageSoFar: string) {
  const text = messageSoFar.trimStart();
  if (text.length === 0) {
    return false;
  }
  if (text.includes("\n") || text.length >= 16) {
    return true;
  }
  return /\S{2,}\s/u.test(text);
}

export function shouldRefreshTelegramStream(now: number, lastEditAt: number | null | undefined) {
  if (lastEditAt == null) {
    return true;
  }
  return now - lastEditAt >= TELEGRAM_STREAM_EDIT_INTERVAL_MS;
}

function streamFields(state: object): TelegramStreamFields {
  return state as TelegramStreamFields;
}

export function clearTelegramStream(state: object) {
  const stream = streamFields(state);
  stream.streamEditAt = null;
  stream.streamKey = null;
  stream.streamMessageId = null;
}

export async function appendTelegramStream(
  telegram: TelegramHandle,
  state: object,
  data: { messageSoFar: string; sequence: number; turnId: string },
  now = Date.now(),
) {
  const text = data.messageSoFar.trim();
  if (text.length === 0) {
    return;
  }
  const stream = streamFields(state);
  const key = telegramStreamKey(data.turnId, data.sequence);
  if (stream.streamKey !== key) {
    if (!shouldOpenTelegramStream(data.messageSoFar)) {
      return;
    }
    const posted = await postTelegramMarkdown(telegram, text, false);
    if (!posted.id) {
      return;
    }
    stream.streamKey = key;
    stream.streamMessageId = posted.id;
    stream.streamEditAt = now;
    return;
  }
  if (!stream.streamMessageId || !shouldRefreshTelegramStream(now, stream.streamEditAt)) {
    return;
  }
  const edited = await editTelegramMarkdown(telegram, stream.streamMessageId, text, false);
  if (edited) {
    stream.streamEditAt = now;
  }
}

export async function completeTelegramStream(
  telegram: TelegramHandle,
  state: object,
  data: { message: string; sequence: number; turnId: string },
) {
  const stream = streamFields(state);
  const key = telegramStreamKey(data.turnId, data.sequence);
  if (stream.streamKey === key && stream.streamMessageId) {
    await editTelegramMarkdown(telegram, stream.streamMessageId, data.message, true);
    clearTelegramStream(state);
    return;
  }
  clearTelegramStream(state);
  await postTelegramMarkdown(telegram, data.message, true);
}

export async function postTelegramMarkdown(telegram: TelegramHandle, markdown: string, html: boolean) {
  if (!html) {
    return telegram.post(clipTelegramText(markdown));
  }
  try {
    return await telegram.post(telegramHtmlMessage(markdownToTelegramHtml(markdown)));
  } catch {
    return telegram.post(markdown);
  }
}

async function editTelegramMarkdown(
  telegram: TelegramHandle,
  messageId: string,
  markdown: string,
  html: boolean,
) {
  if (html) {
    const formatted = await requestEdit(telegram, messageId, markdownToTelegramHtml(markdown), true);
    if (formatted) {
      return true;
    }
  }
  return requestEdit(telegram, messageId, markdown, false);
}

async function requestEdit(telegram: TelegramHandle, messageId: string, text: string, html: boolean) {
  const clipped = clipTelegramText(text);
  if (clipped.length === 0) {
    return false;
  }
  const result = await telegram.request("editMessageText", {
    chat_id: telegram.chatId,
    message_id: Number(messageId),
    text: clipped,
    ...(html ? { parse_mode: "HTML" } : {}),
  });
  return telegramEditAccepted(result);
}

export function isTelegramMessageUnmodified(result: TelegramApiResponse) {
  if (typeof result.body !== "object" || result.body === null || !("description" in result.body)) {
    return false;
  }
  return String(result.body.description).toLowerCase().includes("not modified");
}

export function telegramEditAccepted(result: TelegramApiResponse) {
  if (isTelegramMessageUnmodified(result)) {
    return true;
  }
  if (!result.ok) {
    return false;
  }
  if (typeof result.body === "object" && result.body !== null && "ok" in result.body) {
    return result.body.ok !== false;
  }
  return true;
}

export function clipTelegramText(text: string) {
  if (text.length <= TELEGRAM_MESSAGE_TEXT_MAX_LENGTH) {
    return text;
  }
  return text.slice(0, TELEGRAM_MESSAGE_TEXT_MAX_LENGTH);
}
