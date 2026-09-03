"use server";

import { t } from "@lingui/core/macro";
import type { I18n } from "@lingui/core";
import { consumeLinkCode, createLinkCode } from "@/lib/identity";
import { resolveAppUser, type ResolveAppUserResult } from "@/lib/app-user";
import { listCountries, normalizeCountryCode, type CountryOption } from "@/lib/countries";
import { GoalError, GOAL_FIELDS, GOAL_SPECS, type GoalField, type GoalsPatch, type GoalsView } from "@/lib/goal-values";
import { getGoals, saveGoals } from "@/lib/goals";
import { persistLocaleCookie } from "@/lib/i18n/persist-locale-cookie";
import { getI18nForLocale, getRequestI18n } from "@/lib/i18n/request-locale";
import { isLocale, resolveLocale, type Locale } from "@/lib/i18n/locales";
import { prisma } from "@/lib/prisma";
import {
  reminderRowsFromState,
  type ReminderClock,
  type ReminderLabel,
} from "@/lib/reminder-clock";
import {
  REMINDER_LABELS,
  ReminderError,
  ensureDefaultReminders,
  listReminders,
  rescheduleReminders,
  saveReminders,
} from "@/lib/reminders";
import { listTimeZones, normalizeTimezone } from "@/lib/timezone";
import { redirect } from "next/navigation";

export type SettingsNotice = {
  readonly message: string;
  readonly ok: boolean;
};

export type MiniAppSettingsPayload = {
  readonly countries: readonly CountryOption[];
  readonly country: string | null;
  readonly goals: GoalsView;
  readonly locale: Locale;
  readonly reminders: Readonly<Record<ReminderLabel, ReminderClock>>;
  readonly timeZones: readonly string[];
  readonly timezone: string | null;
};

export type MiniAppSettingsResult =
  | { ok: true; data: MiniAppSettingsPayload }
  | { ok: false; error: string };

async function requireUserId(initData?: string): Promise<string | SettingsNotice> {
  const user = await resolveAppUser(initData);
  if (user.ok) {
    return user.userId;
  }
  const i18n = await getRequestI18n();
  if (initData !== undefined) {
    return { message: appUserErrorMessage(i18n, user), ok: false };
  }
  redirect("/login?callbackUrl=/settings");
}

function notice(message: string, variant: "danger" | "success" = "success"): SettingsNotice {
  return { message, ok: variant !== "danger" };
}

function appUserErrorMessage(i18n: I18n, user: Extract<ResolveAppUserResult, { ok: false }>): string {
  if (user.reason === "unauthenticated") {
    return t(i18n)`Sign in to continue.`;
  }
  if (user.error.includes("expired")) {
    return t(i18n)`Telegram login expired. Close and open the summary again.`;
  }
  if (user.error.includes("not configured")) {
    return t(i18n)`Telegram is not configured.`;
  }
  return t(i18n)`Open this from the Telegram bot.`;
}

function goalErrorMessage(i18n: I18n, patch: GoalsPatch): string {
  const field = GOAL_FIELDS.find((item) => patch[item] !== undefined);
  if (!field) {
    return t(i18n)`Could not save those goals.`;
  }
  return dailyGoalRangeMessage(i18n, field);
}

function dailyGoalRangeMessage(i18n: I18n, field: GoalField): string {
  const spec = GOAL_SPECS[field];
  switch (field) {
    case "caloriesPerDay":
      return t(i18n)`Daily calories must be a whole number from ${spec.min} to ${spec.max} kcal.`;
    case "proteinGPerDay":
      return t(i18n)`Daily protein must be a whole number from ${spec.min} to ${spec.max} grams.`;
    case "carbsGPerDay":
      return t(i18n)`Daily carbs must be a whole number from ${spec.min} to ${spec.max} grams.`;
    case "fatGPerDay":
      return t(i18n)`Daily fat must be a whole number from ${spec.min} to ${spec.max} grams.`;
    case "fiberGPerDay":
      return t(i18n)`Daily fiber must be a whole number from ${spec.min} to ${spec.max} grams.`;
  }
}

export async function getMiniAppSettingsAction(input: {
  initData?: string;
}): Promise<MiniAppSettingsResult> {
  const user = await resolveAppUser(input.initData);
  const i18n = await getRequestI18n(user.ok ? user.userId : undefined);
  if (!user.ok) {
    return { error: appUserErrorMessage(i18n, user), ok: false };
  }
  const profile = await prisma.userProfile.findUnique({
    where: { userId: user.userId },
    select: { country: true, locale: true, timezone: true },
  });
  const savedLocale = profile?.locale;
  const locale = savedLocale && isLocale(savedLocale) ? savedLocale : resolveLocale(i18n.locale);
  if (savedLocale && isLocale(savedLocale)) {
    await persistLocaleCookie(savedLocale);
  }
  const goals = await getGoals(user.userId);
  const reminderState = await listReminders(user.userId);
  const remindersByLabel = new Map(
    reminderState.reminders.map((row) => [
      row.label,
      { enabled: row.enabled, hour: row.hour, minute: row.minute },
    ]),
  );
  return {
    data: {
      countries: listCountries(locale),
      country: profile?.country ?? null,
      goals,
      locale,
      reminders: reminderRowsFromState(remindersByLabel),
      timeZones: listTimeZones(),
      timezone: profile?.timezone ?? null,
    },
    ok: true,
  };
}

export async function saveLocaleAction(raw: string, initData?: string): Promise<SettingsNotice> {
  const userId = await requireUserId(initData);
  if (typeof userId !== "string") {
    return userId;
  }
  const i18n = await getRequestI18n(userId);
  if (!isLocale(raw)) {
    return notice(t(i18n)`Choose a valid language.`, "danger");
  }
  await prisma.userProfile.upsert({
    where: { userId },
    create: { userId, locale: raw },
    update: { locale: raw },
  });
  await persistLocaleCookie(raw);
  const nextI18n = getI18nForLocale(raw);
  return notice(t(nextI18n)`Language saved.`);
}

export async function saveCountryAction(raw: string, initData?: string): Promise<SettingsNotice> {
  const userId = await requireUserId(initData);
  if (typeof userId !== "string") {
    return userId;
  }
  const i18n = await getRequestI18n(userId);
  const trimmed = raw.trim();
  const country = trimmed === "" ? null : normalizeCountryCode(trimmed);
  if (trimmed !== "" && !country) {
    return notice(t(i18n)`Choose a valid country.`, "danger");
  }
  await prisma.userProfile.upsert({
    where: { userId },
    create: { userId, country },
    update: { country },
  });
  return notice(
    country
      ? t(i18n)`Country saved.`
      : t(i18n)`Country cleared. Lookups use the worldwide catalog.`,
  );
}

export async function saveGoalsAction(patch: GoalsPatch, initData?: string): Promise<SettingsNotice> {
  const userId = await requireUserId(initData);
  if (typeof userId !== "string") {
    return userId;
  }
  const i18n = await getRequestI18n(userId);
  try {
    await saveGoals(userId, patch);
  } catch (error) {
    if (error instanceof GoalError || (error instanceof Error && error.name === "GoalError")) {
      return notice(goalErrorMessage(i18n, patch), "danger");
    }
    return notice(t(i18n)`Could not save those goals.`, "danger");
  }
  return notice(t(i18n)`Daily goals saved.`);
}

export async function saveTimezoneAction(raw: string, initData?: string): Promise<SettingsNotice> {
  const userId = await requireUserId(initData);
  if (typeof userId !== "string") {
    return userId;
  }
  const i18n = await getRequestI18n(userId);
  const trimmed = raw.trim();
  const timezone = trimmed === "" ? null : normalizeTimezone(trimmed);
  if (trimmed !== "" && !timezone) {
    return notice(t(i18n)`Choose a valid time zone.`, "danger");
  }
  await prisma.userProfile.upsert({
    where: { userId },
    create: { userId, timezone },
    update: { timezone },
  });
  if (timezone) {
    await ensureDefaultReminders(userId, timezone);
    await rescheduleReminders(userId, timezone);
  }
  return notice(timezone ? t(i18n)`Time zone saved.` : t(i18n)`Time zone cleared.`);
}

export async function saveRemindersAction(
  patches: ReadonlyArray<{
    enabled: boolean;
    hour: number;
    label: ReminderLabel;
    minute: number;
  }>,
  initData?: string,
): Promise<SettingsNotice> {
  const userId = await requireUserId(initData);
  if (typeof userId !== "string") {
    return userId;
  }
  const i18n = await getRequestI18n(userId);
  try {
    if (patches.length !== REMINDER_LABELS.length) {
      return notice(t(i18n)`Choose a valid time for each check-in.`, "danger");
    }
    await saveReminders({
      userId,
      patches: patches.map((patch) => {
        if (!REMINDER_LABELS.includes(patch.label)) {
          throw new ReminderError("unsupported");
        }
        return patch;
      }),
    });
  } catch (error) {
    if (error instanceof ReminderError && error.message === "Save a timezone before changing reminders") {
      return notice(t(i18n)`Save a time zone before changing reminders.`, "danger");
    }
    return notice(t(i18n)`Could not save reminders.`, "danger");
  }
  return notice(t(i18n)`Reminders saved.`);
}

export async function generateLinkCodeAction(initData?: string): Promise<SettingsNotice> {
  const userId = await requireUserId(initData);
  if (typeof userId !== "string") {
    return userId;
  }
  const i18n = await getRequestI18n(userId);
  const { code } = await createLinkCode(userId);
  return notice(t(i18n)`Your code is ${code}. It expires in 10 minutes.`);
}

export async function consumeLinkCodeAction(code: string, initData?: string): Promise<SettingsNotice> {
  const userId = await requireUserId(initData);
  if (typeof userId !== "string") {
    return userId;
  }
  const i18n = await getRequestI18n(userId);
  const result = await consumeLinkCode(code, userId);
  const ok = result.status === "merged" || result.status === "linked" || result.status === "already";
  const message =
    result.status === "merged" || result.status === "linked"
      ? t(i18n)`Accounts linked. Memory now follows you across channels.`
      : result.status === "already"
        ? t(i18n)`Already linked.`
        : result.status === "expired"
          ? t(i18n)`That code expired.`
          : result.status === "both-have-email"
            ? t(i18n)`Those accounts both have email sign-in and cannot be merged.`
            : t(i18n)`That code is not valid.`;
  return notice(message, ok ? "success" : "danger");
}
