"use server";

import { auth } from "@/auth";
import { consumeLinkCode, createLinkCode } from "@/lib/identity";
import { normalizeCountryCode } from "@/lib/countries";
import { GoalError, type GoalsView } from "@/lib/goal-values";
import { saveGoals } from "@/lib/goals";
import { prisma } from "@/lib/prisma";
import {
  REMINDER_LABELS,
  ensureDefaultReminders,
  rescheduleReminders,
  saveReminders,
  type ReminderLabel,
} from "@/lib/reminders";
import { normalizeTimezone } from "@/lib/timezone";
import { redirect } from "next/navigation";

const REMINDER_TITLES: Record<ReminderLabel, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

async function requireUserId(): Promise<string> {
  const current = await auth();
  if (!current?.user?.id) {
    redirect("/login?callbackUrl=/settings");
  }
  return current.user.id;
}

function noticeRedirect(message: string, variant: "danger" | "success" = "success"): never {
  const params = new URLSearchParams({ notice: message, noticeKind: variant });
  redirect(`/settings?${params.toString()}`);
}

export async function saveCountryAction(raw: string) {
  const userId = await requireUserId();
  const trimmed = raw.trim();
  const country = trimmed === "" ? null : normalizeCountryCode(trimmed);
  if (trimmed !== "" && !country) {
    noticeRedirect("Choose a valid country.", "danger");
  }
  await prisma.userProfile.upsert({
    where: { userId },
    create: { userId, country },
    update: { country },
  });
  noticeRedirect(
    country ? "Country saved." : "Country cleared. Lookups use the worldwide catalog.",
  );
}

export async function saveGoalsAction(patch: GoalsView) {
  const userId = await requireUserId();
  try {
    await saveGoals(userId, patch);
  } catch (error) {
    const message =
      error instanceof GoalError || (error instanceof Error && error.name === "GoalError")
        ? error.message
        : "Could not save those goals.";
    noticeRedirect(message, "danger");
  }
  noticeRedirect("Daily goals saved.");
}

export async function saveTimezoneAction(raw: string) {
  const userId = await requireUserId();
  const trimmed = raw.trim();
  const timezone = trimmed === "" ? null : normalizeTimezone(trimmed);
  if (trimmed !== "" && !timezone) {
    noticeRedirect("Choose a valid time zone.", "danger");
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
  noticeRedirect(timezone ? "Time zone saved." : "Time zone cleared.");
}

export async function saveRemindersAction(
  patches: ReadonlyArray<{
    enabled: boolean;
    hour: number;
    label: ReminderLabel;
    minute: number;
  }>,
) {
  const userId = await requireUserId();
  try {
    if (patches.length !== REMINDER_LABELS.length) {
      throw new Error("Choose a valid time for each meal.");
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
    noticeRedirect(message, "danger");
  }
  noticeRedirect("Reminders saved.");
}

export async function generateLinkCodeAction() {
  const userId = await requireUserId();
  const { code } = await createLinkCode(userId);
  noticeRedirect(`Your code is ${code}. It expires in 10 minutes.`);
}

export async function consumeLinkCodeAction(code: string) {
  const userId = await requireUserId();
  const result = await consumeLinkCode(code, userId);
  const ok = result.status === "merged" || result.status === "linked" || result.status === "already";
  const notice =
    result.status === "merged" || result.status === "linked"
      ? "Accounts linked. Memory now follows you across channels."
      : result.status === "already"
        ? "Already linked."
        : result.status === "expired"
          ? "That code expired."
          : result.status === "both-have-email"
            ? "Those accounts both have email sign-in and cannot be merged."
            : "That code is not valid.";
  noticeRedirect(notice, ok ? "success" : "danger");
}
