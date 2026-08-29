"use server";

import { auth } from "@/auth";
import { consumeLinkCode, createLinkCode } from "@/lib/identity";
import { normalizeCountryCode } from "@/lib/countries";
import { GoalError } from "@/lib/goal-values";
import { saveCalorieGoal } from "@/lib/goals";
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

function noticeRedirect(message: string): never {
  redirect(`/settings?notice=${encodeURIComponent(message)}`);
}

export async function saveCountryAction(raw: string) {
  const userId = await requireUserId();
  const trimmed = raw.trim();
  const country = trimmed === "" ? null : normalizeCountryCode(trimmed);
  if (trimmed !== "" && !country) {
    noticeRedirect("Choose a valid country.");
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

export async function saveCalorieGoalAction(raw: number | null) {
  const userId = await requireUserId();
  try {
    const goals = await saveCalorieGoal(userId, raw);
    noticeRedirect(
      goals.caloriesPerDay === null
        ? "Daily calorie goal cleared."
        : `Daily calorie goal saved: ${goals.caloriesPerDay} kcal.`,
    );
  } catch (error) {
    const message = error instanceof GoalError ? error.message : "Could not save that goal.";
    noticeRedirect(message);
  }
}

export async function saveTimezoneAction(raw: string) {
  const userId = await requireUserId();
  const trimmed = raw.trim();
  const timezone = trimmed === "" ? null : normalizeTimezone(trimmed);
  if (trimmed !== "" && !timezone) {
    noticeRedirect("Choose a valid time zone.");
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
    noticeRedirect(message);
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
  noticeRedirect(notice);
}
