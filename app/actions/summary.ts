"use server";

import { resolveAppUser } from "@/lib/app-user";
import {
  loadNutritionDay,
  loadNutritionDays,
  loadNutritionDiary,
  type NutritionDayPayload,
  type NutritionDaysPayload,
  type NutritionDiaryPayload,
} from "@/lib/summary";
import { parseYmd } from "@/lib/timezone";

export type NutritionDayResult =
  | { ok: true; data: NutritionDayPayload }
  | { ok: false; error: string; reason: "unauthenticated" | "telegram" | "invalid" };

export type NutritionDaysResult =
  | { ok: true; data: NutritionDaysPayload }
  | { ok: false; error: string; reason: "unauthenticated" | "telegram" | "invalid" };

export type NutritionDiaryResult =
  | { ok: true; data: NutritionDiaryPayload }
  | { ok: false; error: string; reason: "unauthenticated" | "telegram" | "invalid" };

export async function getNutritionDiaryAction(input: {
  initData?: string;
}): Promise<NutritionDiaryResult> {
  const user = await resolveSummaryUser(input.initData);
  if (!user.ok) {
    return user;
  }
  try {
    const data = await loadNutritionDiary({ userId: user.userId });
    return { data, ok: true };
  } catch (error) {
    const message = error instanceof RangeError ? error.message : "Could not load that summary.";
    return { error: message, ok: false, reason: "invalid" };
  }
}

export async function getNutritionDayAction(input: {
  date: string;
  initData?: string;
}): Promise<NutritionDayResult> {
  if (!parseYmd(input.date)) {
    return { error: "Choose a valid date.", ok: false, reason: "invalid" };
  }
  const user = await resolveSummaryUser(input.initData);
  if (!user.ok) {
    return user;
  }
  try {
    const data = await loadNutritionDay({ date: input.date, userId: user.userId });
    return { data, ok: true };
  } catch (error) {
    const message = error instanceof RangeError ? error.message : "Could not load that day.";
    return { error: message, ok: false, reason: "invalid" };
  }
}

export async function getNutritionDaysAction(input: {
  from: string;
  initData?: string;
  to: string;
}): Promise<NutritionDaysResult> {
  if (!parseYmd(input.from) || !parseYmd(input.to)) {
    return { error: "Choose a valid date range.", ok: false, reason: "invalid" };
  }
  const user = await resolveSummaryUser(input.initData);
  if (!user.ok) {
    return user;
  }
  try {
    const data = await loadNutritionDays({ from: input.from, to: input.to, userId: user.userId });
    return { data, ok: true };
  } catch (error) {
    const message = error instanceof RangeError ? error.message : "Could not load those days.";
    return { error: message, ok: false, reason: "invalid" };
  }
}

async function resolveSummaryUser(
  initData: string | undefined,
): Promise<
  { ok: true; userId: string } | { ok: false; error: string; reason: "unauthenticated" | "telegram" }
> {
  const user = await resolveAppUser(initData);
  if (!user.ok && user.reason === "unauthenticated") {
    return { error: "Sign in to view your summary.", ok: false, reason: "unauthenticated" };
  }
  return user;
}
