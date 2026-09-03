"use server";

import { consumeLinkCode, createLinkCode } from "@/lib/identity";
import { resolveAppUser } from "@/lib/app-user";
import { listCountries, normalizeCountryCode, type CountryOption } from "@/lib/countries";
import { GoalError, type GoalsPatch, type GoalsView } from "@/lib/goal-values";
import { getGoals, saveGoals } from "@/lib/goals";
import { prisma } from "@/lib/prisma";
import {
  reminderRowsFromState,
  type ReminderClock,
  type ReminderLabel,
} from "@/lib/reminder-clock";
import {
  REMINDER_LABELS,
  ensureDefaultReminders,
  listReminders,
  rescheduleReminders,
  saveReminders,
} from "@/lib/reminders";
import { listTimeZones, normalizeTimezone } from "@/lib/timezone";
import { redirect } from "next/navigation";

const REMINDER_TITLES: Record<ReminderLabel, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  summary: "Daily summary",
};

export type SettingsNotice = {
  readonly message: string;
  readonly ok: boolean;
};

export type MiniAppSettingsPayload = {
  readonly countries: readonly CountryOption[];
  readonly country: string | null;
  readonly goals: GoalsView;
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
  if (initData !== undefined) {
    return { message: user.error, ok: false };
  }
  redirect("/login?callbackUrl=/settings");
}

function notice(message: string, variant: "danger" | "success" = "success"): SettingsNotice {
  return { message, ok: variant !== "danger" };
}

export async function getMiniAppSettingsAction(input: {
  initData?: string;
}): Promise<MiniAppSettingsResult> {
  const user = await resolveAppUser(input.initData);
  if (!user.ok) {
    return { error: user.error, ok: false };
  }
  const profile = await prisma.userProfile.findUnique({
    where: { userId: user.userId },
    select: { country: true, timezone: true },
  });
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
      countries: listCountries(),
      country: profile?.country ?? null,
      goals,
      reminders: reminderRowsFromState(remindersByLabel),
      timeZones: listTimeZones(),
      timezone: profile?.timezone ?? null,
    },
    ok: true,
  };
}

export async function saveCountryAction(raw: string, initData?: string): Promise<SettingsNotice> {
  const userId = await requireUserId(initData);
  if (typeof userId !== "string") {
    return userId;
  }
  const trimmed = raw.trim();
  const country = trimmed === "" ? null : normalizeCountryCode(trimmed);
  if (trimmed !== "" && !country) {
    return notice("Choose a valid country.", "danger");
  }
  await prisma.userProfile.upsert({
    where: { userId },
    create: { userId, country },
    update: { country },
  });
  return notice(
    country ? "Country saved." : "Country cleared. Lookups use the worldwide catalog.",
  );
}

export async function saveGoalsAction(patch: GoalsPatch, initData?: string): Promise<SettingsNotice> {
  const userId = await requireUserId(initData);
  if (typeof userId !== "string") {
    return userId;
  }
  try {
    await saveGoals(userId, patch);
  } catch (error) {
    const message =
      error instanceof GoalError || (error instanceof Error && error.name === "GoalError")
        ? error.message
        : "Could not save those goals.";
    return notice(message, "danger");
  }
  return notice("Daily goals saved.");
}

export async function saveTimezoneAction(raw: string, initData?: string): Promise<SettingsNotice> {
  const userId = await requireUserId(initData);
  if (typeof userId !== "string") {
    return userId;
  }
  const trimmed = raw.trim();
  const timezone = trimmed === "" ? null : normalizeTimezone(trimmed);
  if (trimmed !== "" && !timezone) {
    return notice("Choose a valid time zone.", "danger");
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
  return notice(timezone ? "Time zone saved." : "Time zone cleared.");
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
  try {
    if (patches.length !== REMINDER_LABELS.length) {
      throw new Error("Choose a valid time for each check-in.");
    }
    await saveReminders({
      userId,
      patches: patches.map((patch) => {
        if (!REMINDER_LABELS.includes(patch.label)) {
          throw new Error(`Choose a valid time for ${REMINDER_TITLES[patch.label]}.`);
        }
        return patch;
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save reminders.";
    return notice(message, "danger");
  }
  return notice("Reminders saved.");
}

export async function generateLinkCodeAction(initData?: string): Promise<SettingsNotice> {
  const userId = await requireUserId(initData);
  if (typeof userId !== "string") {
    return userId;
  }
  const { code } = await createLinkCode(userId);
  return notice(`Your code is ${code}. It expires in 10 minutes.`);
}

export async function consumeLinkCodeAction(code: string, initData?: string): Promise<SettingsNotice> {
  const userId = await requireUserId(initData);
  if (typeof userId !== "string") {
    return userId;
  }
  const result = await consumeLinkCode(code, userId);
  const ok = result.status === "merged" || result.status === "linked" || result.status === "already";
  const message =
    result.status === "merged" || result.status === "linked"
      ? "Accounts linked. Memory now follows you across channels."
      : result.status === "already"
        ? "Already linked."
        : result.status === "expired"
          ? "That code expired."
          : result.status === "both-have-email"
            ? "Those accounts both have email sign-in and cannot be merged."
            : "That code is not valid.";
  return notice(message, ok ? "success" : "danger");
}
