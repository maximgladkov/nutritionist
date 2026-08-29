import { generateText } from "ai";

export const TELEGRAM_ACK_MODEL = "spacexai/grok-4.1-fast-non-reasoning";
export const TELEGRAM_ACK_TIMEOUT_MS = 2500;
export const TELEGRAM_ACK_TURN_CONTEXT =
  "A short acknowledgement was already sent to the user. Do not narrate what you are about to do. Call tools if needed, then send only the actual result.";

export const TELEGRAM_ACK_SYSTEM =
  "You are a nutritionist assistant sending one Telegram acknowledgement. Reply with a single complete sentence. Match a warm, concise tone. Do not use markdown. Do not ask a question. Do not claim a meal was logged or looked up yet. If the user attached a file, acknowledge that you received it.";

type TelegramAckInput = {
  caption: string;
  hasFiles: boolean;
  text: string;
};

type TelegramAckSender = {
  sendMessage: (message: string) => Promise<unknown>;
};

export function telegramAckUserContent(input: TelegramAckInput) {
  const message = input.text.trim() || input.caption.trim();
  return [
    `User message: ${message.length > 0 ? message : "(none)"}`,
    `Has attached files: ${input.hasFiles ? "yes" : "no"}`,
  ].join("\n");
}

export async function postTelegramAck(telegram: TelegramAckSender, input: TelegramAckInput) {
  try {
    const { text } = await generateText({
      abortSignal: AbortSignal.timeout(TELEGRAM_ACK_TIMEOUT_MS),
      maxOutputTokens: 80,
      maxRetries: 0,
      model: TELEGRAM_ACK_MODEL,
      prompt: telegramAckUserContent(input),
      system: TELEGRAM_ACK_SYSTEM,
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
