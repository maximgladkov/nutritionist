import { resolveChannelUser } from "../identity.ts";
import { prisma } from "../prisma.ts";
import { getUserFromRequest } from "../session.ts";
import { TelegramWebAppError, verifyTelegramWebAppInitData } from "../telegram-webapp.ts";
import { unauthorized } from "./errors.ts";
import { verifyAccessToken } from "./tokens.ts";

export type ApiUser = { email: string | null; id: string; name: string | null };

function bearerToken(request: Request): string | null {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "");
  return match?.[1]?.trim() || null;
}

// Resolves the caller from, in order: an API bearer token (mobile), the NextAuth session
// cookie (web), or Telegram mini app init data.
export async function requireUser(request: Request): Promise<ApiUser> {
  const token = bearerToken(request);
  if (token) {
    const userId = await verifyAccessToken(token);
    const user = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null;
    if (!user) {
      throw unauthorized("Your session expired. Refresh the token or sign in again.");
    }
    return { email: user.email, id: user.id, name: user.name };
  }

  const initData = request.headers.get("x-telegram-init-data");
  if (initData) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      throw unauthorized("Telegram is not configured.");
    }
    try {
      const telegramUser = verifyTelegramWebAppInitData(initData, botToken);
      const record = await resolveChannelUser({
        name: [telegramUser.firstName, telegramUser.lastName].filter(Boolean).join(" ") || telegramUser.username,
        provider: "telegram",
        providerUserId: String(telegramUser.id),
      });
      return { email: record.email, id: record.id, name: record.name };
    } catch (error) {
      if (error instanceof TelegramWebAppError && error.code === "expired") {
        throw unauthorized("Telegram login expired. Close and open the app again.");
      }
      throw unauthorized("Open this from the Telegram bot.");
    }
  }

  const sessionUser = await getUserFromRequest(request);
  if (sessionUser) {
    return { email: sessionUser.email, id: sessionUser.id, name: sessionUser.name };
  }
  throw unauthorized();
}
