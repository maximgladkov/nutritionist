import { generateText } from "ai";

export const TELEGRAM_ACK_MODEL = "spacexai/grok-4.1-fast-non-reasoning";
export const TELEGRAM_ACK_TIMEOUT_MS = 2500;
export const TELEGRAM_ACK_HISTORY_MAX_MESSAGES = 8;
export const TELEGRAM_ACK_HISTORY_MAX_CHARS = 400;
export const TELEGRAM_ACK_TURN_CONTEXT =
  "A short acknowledgement was already sent to the user. Do not narrate what you are about to do. Call tools if needed, then send only the actual result.";

export const TELEGRAM_ACK_SYSTEM =
  "You are a nutritionist assistant sending one Telegram acknowledgement. Reply with one friendly complete sentence. Sound like the same person as the recent assistant replies: match their language, warmth, and wording. If there is no conversation yet, use the Telegram client language and a warm, natural voice. Briefly acknowledge what they sent, say you are looking into it now, and that you will get back with the result. Do not use markdown. Do not ask a question. Do not claim a meal was logged or looked up yet. If the user attached a file, mention that you received it.";

export type TelegramAckHistoryMessage = {
  role: "assistant" | "user";
  text: string;
};

type TelegramAckInput = {
  caption: string;
  hasFiles: boolean;
  history?: readonly TelegramAckHistoryMessage[];
  languageCode?: string;
  text: string;
};

type TelegramAckSender = {
  sendMessage: (message: string) => Promise<unknown>;
};

export function telegramAckVisibleUserText(input: { caption: string; text: string }) {
  return input.text.trim() || input.caption.trim();
}

export function telegramAckUserContent(input: TelegramAckInput) {
  const message = telegramAckVisibleUserText(input);
  const language = input.languageCode?.trim();
  return [
    `User message: ${message.length > 0 ? message : "(none)"}`,
    `Has attached files: ${input.hasFiles ? "yes" : "no"}`,
    `Telegram client language: ${language && language.length > 0 ? language : "unknown"}`,
  ].join("\n");
}

export function clipTelegramAckHistory(messages: readonly TelegramAckHistoryMessage[]) {
  return messages
    .filter((message) => message.text.trim().length > 0)
    .map((message) => ({
      role: message.role,
      text: message.text.trim().slice(0, TELEGRAM_ACK_HISTORY_MAX_CHARS),
    }))
    .slice(-TELEGRAM_ACK_HISTORY_MAX_MESSAGES);
}

export function parseTelegramAckHistory(value: unknown): TelegramAckHistoryMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const messages: TelegramAckHistoryMessage[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }
    const role = "role" in entry ? entry.role : null;
    const text = "text" in entry ? entry.text : null;
    if ((role !== "user" && role !== "assistant") || typeof text !== "string") {
      continue;
    }
    messages.push({ role, text });
  }
  return clipTelegramAckHistory(messages);
}

export function telegramAckMessages(input: TelegramAckInput) {
  return [
    { role: "system" as const, content: TELEGRAM_ACK_SYSTEM },
    ...(input.history ?? []).map((message) => ({
      role: message.role,
      content: message.text,
    })),
    { role: "user" as const, content: telegramAckUserContent(input) },
  ];
}

export async function postTelegramAck(telegram: TelegramAckSender, input: TelegramAckInput) {
  try {
    const { text } = await generateText({
      abortSignal: AbortSignal.timeout(TELEGRAM_ACK_TIMEOUT_MS),
      maxOutputTokens: 100,
      maxRetries: 0,
      messages: telegramAckMessages(input),
      model: TELEGRAM_ACK_MODEL,
    });
    const ack = text.trim();
    if (ack.length === 0) {
      return false;
    }
    await telegram.sendMessage(ack);
    return true;
  } catch {
    return false;
  }
}
