import { generateText } from "ai";

export const TELEGRAM_ACK_MODEL = "spacexai/grok-4.1-fast-non-reasoning";
export const TELEGRAM_ACK_TIMEOUT_MS = 4000;
export const TELEGRAM_ACK_HISTORY_MAX_MESSAGES = 8;
export const TELEGRAM_ACK_HISTORY_MAX_CHARS = 400;
export const TELEGRAM_ACK_TURN_CONTEXT =
  "A short acknowledgement was already sent to the user. Do not narrate what you are about to do. Call tools if needed, then send only the actual result.";

export const TELEGRAM_ACK_SYSTEM =
  "You are a nutritionist assistant sending one Telegram acknowledgement. Reply with a very short, natural chat status that matches what they just asked, as if you already started. A few words is enough. Sound like a person, not a canned bot status. Vary the wording every time. Do not repeat an acknowledgement you already used in this conversation. Examples of the kind of reply, not lines to copy: calories or totals — Checking calories… / Смотрю калории… / Гляну, сколько вышло…; logging a meal — Logging that… / Записываю… / Сейчас внесу…; a photo — Looking at the photo… / Смотрю фото…; other — One sec… / Hang on… / Сейчас гляну…. Match the language of the recent conversation and the latest user message. Do not use markdown. Do not ask a question. Do not say you will get back later. Do not claim the work is done.";

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

type TelegramAckSender = {
  sendMessage: (message: string) => Promise<unknown>;
};

export function telegramAckVisibleUserText(input: { caption?: string; text?: string }) {
  return (input.text ?? "").trim() || (input.caption ?? "").trim();
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
    ...(input.history ?? []).map((message) => ({
      role: message.role,
      content: message.text,
    })),
    { role: "user" as const, content: telegramAckUserContent(input) },
  ]);
}

export function telegramAckErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function generateTelegramAckText(input: TelegramAckInput) {
  const { text } = await Promise.race([
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
  const ack = text.trim();
  if (ack.length === 0) {
    throw new Error("telegram ack model returned empty text");
  }
  return ack;
}

export async function postTelegramAck(telegram: TelegramAckSender, input: TelegramAckInput) {
  try {
    const ack = await generateTelegramAckText(input);
    await telegram.sendMessage(ack);
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
