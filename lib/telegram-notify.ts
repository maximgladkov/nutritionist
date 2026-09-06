import { telegramSummaryMiniAppUrl } from "./app-url.ts";

export async function sendTelegramBotMessage(input: {
  chatId: string;
  text: string;
  webAppButton?: { text: string; url: string };
}): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!botToken || input.chatId.length === 0 || input.text.length === 0) {
    return false;
  }
  const body: Record<string, unknown> = {
    chat_id: input.chatId,
    text: input.text,
  };
  if (input.webAppButton) {
    body.reply_markup = {
      inline_keyboard: [[{ text: input.webAppButton.text, web_app: { url: input.webAppButton.url } }]],
    };
  }
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function telegramGroupsMiniAppUrl(): string | null {
  return telegramSummaryMiniAppUrl();
}
