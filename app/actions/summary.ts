"use server";

import { auth } from "@/auth";
import { resolveChannelUser } from "@/lib/identity";
import { loadNutritionSummary, type NutritionSummaryPayload } from "@/lib/summary";
import { isSummaryPeriod } from "@/lib/summary-range";
import { TelegramWebAppError, verifyTelegramWebAppInitData } from "@/lib/telegram-webapp";

export type NutritionSummaryResult =
  | { ok: true; data: NutritionSummaryPayload }
  | { ok: false; error: string; reason: "unauthenticated" | "telegram" | "invalid" };

export async function getNutritionSummaryAction(input: {
  customFrom?: string;
  customTo?: string;
  initData?: string;
  period: string;
}): Promise<NutritionSummaryResult> {
  const period = input.period;
  if (!isSummaryPeriod(period)) {
    return { error: "Choose a valid period.", ok: false, reason: "invalid" };
  }
  const user = await resolveSummaryUser(input.initData);
  if (!user.ok) {
    return user;
  }
  try {
    const data = await loadNutritionSummary({
      customFrom: input.customFrom,
      customTo: input.customTo,
      period,
      userId: user.userId,
    });
    return { data, ok: true };
  } catch (error) {
    const message = error instanceof RangeError ? error.message : "Could not load that summary.";
    return { error: message, ok: false, reason: "invalid" };
  }
}

async function resolveSummaryUser(
  initData: string | undefined,
): Promise<
  { ok: true; userId: string } | { ok: false; error: string; reason: "unauthenticated" | "telegram" }
> {
  if (initData !== undefined && initData !== "") {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return { error: "Telegram is not configured.", ok: false, reason: "telegram" };
    }
    try {
      const telegramUser = verifyTelegramWebAppInitData(initData, botToken);
      const user = await resolveChannelUser({
        name: [telegramUser.firstName, telegramUser.lastName].filter(Boolean).join(" ") || telegramUser.username,
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
    return { error: "Sign in to view your summary.", ok: false, reason: "unauthenticated" };
  }
  return { ok: true, userId: session.user.id };
}
