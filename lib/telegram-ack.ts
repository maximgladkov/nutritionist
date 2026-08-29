import { generateText } from "ai";

export const TELEGRAM_ACK_MODEL = "xai/grok-4.1-fast-non-reasoning";
export const TELEGRAM_ACK_TIMEOUT_MS = 2500;
export const TELEGRAM_ACK_HISTORY_MAX_MESSAGES = 8;
export const TELEGRAM_ACK_HISTORY_MAX_CHARS = 400;
export const TELEGRAM_ACK_TURN_CONTEXT =
  "A short acknowledgement was already sent to the user. Do not narrate what you are about to do. Call tools if needed, then send only the actual result.";

export const TELEGRAM_ACK_SYSTEM =
  "You are a nutritionist assistant sending one Telegram acknowledgement. Reply with a very short status that matches what they just asked, as if you already started: for a calorie or totals question say you are checking, for a meal to log say you are logging it, for a photo say you are looking at it. A few words is enough. Match the language, warmth, and wording of the recent conversation and of the latest user message. Do not use markdown. Do not ask a question. Do not say you will get back later. Do not claim the work is done.";

const CYRILLIC = /[\u0400-\u04FF]/u;

export type TelegramAckHistoryMessage = {
  role: "assistant" | "user";
  text: string;
};

type TelegramAckInput = {
  caption: string;
  hasFiles: boolean;
  history?: readonly TelegramAckHistoryMessage[];
  text: string;
};

type TelegramAckLanguageInput = Pick<TelegramAckInput, "hasFiles"> &
  Partial<Pick<TelegramAckInput, "caption" | "history" | "text">>;

type TelegramAckSender = {
  sendMessage: (message: string) => Promise<unknown>;
};

export function telegramAckVisibleUserText(input: { caption?: string; text?: string }) {
  return (input.text ?? "").trim() || (input.caption ?? "").trim();
}

export function telegramAckConversationIsRussian(input: TelegramAckLanguageInput) {
  const samples = [
    ...(input.history ?? []).map((message) => message.text),
    telegramAckVisibleUserText(input),
  ];
  return samples.some((text) => CYRILLIC.test(text));
}

export function telegramAckIntent(input: TelegramAckLanguageInput) {
  if (input.hasFiles) {
    return "photo";
  }
  const text = telegramAckVisibleUserText(input).toLowerCase();
  if (
    /калори|ккал|kcal|calorie|macro|protein|белк|summary|итог|сколько съел|сколько остал/u.test(
      text,
    )
  ) {
    return "check";
  }
  if (/запиш|залог|съел|съела|\bate\b|\bhad\b|\blog\b/u.test(text)) {
    return "log";
  }
  return "generic";
}

export function telegramAckSystem(input: TelegramAckInput) {
  const parts = [TELEGRAM_ACK_SYSTEM];
  if (input.hasFiles) {
    parts.push("The latest user message includes an attached file.");
  }
  if ((input.history ?? []).length > 0 || telegramAckVisibleUserText(input).length > 0) {
    parts.push("Reply in the same language as the recent conversation and the latest user message.");
  }
  return parts.join(" ");
}

export function telegramAckUserContent(input: TelegramAckInput) {
  const message = telegramAckVisibleUserText(input);
  if (message.length > 0) {
    return message;
  }
  return input.hasFiles ? "(attached file)" : "(none)";
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
    { role: "system" as const, content: telegramAckSystem(input) },
    ...(input.history ?? []).map((message) => ({
      role: message.role,
      content: message.text,
    })),
    { role: "user" as const, content: telegramAckUserContent(input) },
  ];
}

export function telegramAckFallback(input: TelegramAckLanguageInput) {
  const isRu = telegramAckConversationIsRussian(input);
  switch (telegramAckIntent(input)) {
    case "check":
      return isRu ? "Смотрю…" : "Checking…";
    case "photo":
      return isRu ? "Смотрю фото…" : "Looking at the photo…";
    case "log":
      return isRu ? "Записываю…" : "Logging…";
    case "generic":
      return isRu ? "Секунду…" : "On it…";
  }
}

export async function generateTelegramAckText(input: TelegramAckInput) {
  try {
    const { text } = await Promise.race([
      generateText({
        abortSignal: AbortSignal.timeout(TELEGRAM_ACK_TIMEOUT_MS),
        maxOutputTokens: 100,
        maxRetries: 0,
        messages: telegramAckMessages(input),
        model: TELEGRAM_ACK_MODEL,
      }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("telegram ack timed out")), TELEGRAM_ACK_TIMEOUT_MS);
      }),
    ]);
    const ack = text.trim();
    if (ack.length > 0) {
      return ack;
    }
  } catch {}
  return telegramAckFallback(input);
}

export async function postTelegramAck(telegram: TelegramAckSender, input: TelegramAckInput) {
  const ack = await generateTelegramAckText(input);
  try {
    await telegram.sendMessage(ack);
    return true;
  } catch {
    return false;
  }
}
