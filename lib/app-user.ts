import { auth } from "@/auth";
import { resolveChannelUser } from "@/lib/identity";
import { TelegramWebAppError, verifyTelegramWebAppInitData } from "@/lib/telegram-webapp";

export type ResolveAppUserResult =
  | { ok: true; userId: string }
  | { ok: false; error: string; reason: "unauthenticated" | "telegram" };

export async function resolveAppUser(initData?: string): Promise<ResolveAppUserResult> {
  if (initData !== undefined && initData !== "") {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return { error: "Telegram is not configured.", ok: false, reason: "telegram" };
    }
    try {
      const telegramUser = verifyTelegramWebAppInitData(initData, botToken);
      const user = await resolveChannelUser({
        name:
          [telegramUser.firstName, telegramUser.lastName].filter(Boolean).join(" ") ||
          telegramUser.username,
        provider: "telegram",
        providerUserId: String(telegramUser.id),
      });
      return { ok: true, userId: user.id };
    } catch (error) {
      if (error instanceof TelegramWebAppError && error.code === "expired") {
        return { error: error.message, ok: false, reason: "telegram" };
      }
      return { error: "Open this from the Telegram bot.", ok: false, reason: "telegram" };
    }
  }
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Sign in to continue.", ok: false, reason: "unauthenticated" };
  }
  return { ok: true, userId: session.user.id };
}
