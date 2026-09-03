import type { ChannelName } from "./principal.ts";
import { prisma } from "./prisma.ts";
import {
  checkInPrompt,
  DEFAULT_REMINDER_TIMES,
  formatClock,
  isMealCheckInLabel,
  isReminderLabel,
  isValidClock,
  parseClock,
  REMINDER_LABELS,
  summaryCheckInPrompt,
  type MealCheckInLabel,
  type ReminderLabel,
  type SummaryCheckInSnapshot,
} from "./reminder-clock.ts";
import { loadTodayNutritionDay } from "./summary.ts";
import { getZonedParts, localDayRange, nextLocalOccurrence } from "./timezone.ts";

export {
  checkInPrompt,
  DEFAULT_REMINDER_TIMES,
  formatClock,
  isMealCheckInLabel,
  isReminderLabel,
  isValidClock,
  parseClock,
  summaryCheckInPrompt,
  REMINDER_LABELS,
};
export type { MealCheckInLabel, ReminderLabel, SummaryCheckInSnapshot };

const CLAIM_LIMIT = 25;
const LEASE_MS = 50 * 60_000;
const MISSING_TIMEZONE_RETRY_MS = 60 * 60_000;
const SEND_FAILURE_RETRY_MS = 60 * 60_000;

export type ReminderView = {
  label: ReminderLabel;
  enabled: boolean;
  time: string;
  hour: number;
  minute: number;
  nextRunAt: string;
};

export type ReminderPatch = {
  label: ReminderLabel;
  enabled?: boolean;
  hour?: number;
  minute?: number;
};

export type ClaimedReminder = {
  id: string;
  userId: string;
  label: ReminderLabel;
  hour: number;
  minute: number;
  leaseToken: string;
};

export type ReachTarget =
  | { channel: "telegram"; chatId: string }
  | { channel: "whatsapp"; threadId: string }
  | { channel: "web"; sessionId: string };

export class ReminderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReminderError";
  }
}

export function toReminderView(row: {
  label: string;
  enabled: boolean;
  hour: number;
  minute: number;
  nextRunAt: Date;
}): ReminderView {
  if (!isReminderLabel(row.label)) {
    throw new ReminderError(`Unsupported reminder label ${row.label}`);
  }
  return {
    label: row.label,
    enabled: row.enabled,
    time: formatClock(row.hour, row.minute),
    hour: row.hour,
    minute: row.minute,
    nextRunAt: row.nextRunAt.toISOString(),
  };
}

export async function listReminders(userId: string): Promise<{
  timezone: string | null;
  reminders: ReminderView[];
}> {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { timezone: true },
  });
  if (profile?.timezone) {
    await ensureDefaultReminders(userId, profile.timezone);
  }
  const rows = await prisma.mealReminder.findMany({
    where: { userId, label: { in: [...REMINDER_LABELS] } },
    orderBy: { hour: "asc" },
  });
  return {
    timezone: profile?.timezone ?? null,
    reminders: rows.map(toReminderView),
  };
}

export async function saveReminders(input: {
  userId: string;
  patches: ReminderPatch[];
  now?: Date;
}): Promise<{ timezone: string; reminders: ReminderView[] }> {
  const profile = await prisma.userProfile.findUnique({
    where: { userId: input.userId },
    select: { timezone: true },
  });
  if (!profile?.timezone) {
    throw new ReminderError("Save a timezone before changing reminders");
  }
  const now = input.now ?? new Date();
  await ensureDefaultReminders(input.userId, profile.timezone, now);
  for (const patch of input.patches) {
    await applyReminderPatch(input.userId, profile.timezone, patch, now);
  }
  const rows = await prisma.mealReminder.findMany({
    where: { userId: input.userId, label: { in: [...REMINDER_LABELS] } },
    orderBy: { hour: "asc" },
  });
  return { timezone: profile.timezone, reminders: rows.map(toReminderView) };
}

export async function ensureDefaultReminders(
  userId: string,
  timeZone: string,
  now: Date = new Date(),
): Promise<void> {
  const existing = await prisma.mealReminder.findMany({
    where: { userId },
    select: { label: true },
  });
  const have = new Set(existing.map((row) => row.label));
  for (const label of REMINDER_LABELS) {
    if (have.has(label)) {
      continue;
    }
    const clock = DEFAULT_REMINDER_TIMES[label];
    await prisma.mealReminder.upsert({
      where: { userId_label: { userId, label } },
      create: {
        userId,
        label,
        enabled: true,
        hour: clock.hour,
        minute: clock.minute,
        nextRunAt: nextLocalOccurrence({
          now,
          timeZone,
          hour: clock.hour,
          minute: clock.minute,
        }),
      },
      update: {},
    });
  }
}

export async function rescheduleReminders(
  userId: string,
  timeZone: string,
  now: Date = new Date(),
): Promise<void> {
  const rows = await prisma.mealReminder.findMany({ where: { userId } });
  for (const row of rows) {
    await prisma.mealReminder.update({
      where: { id: row.id },
      data: {
        nextRunAt: nextLocalOccurrence({
          now,
          timeZone,
          hour: row.hour,
          minute: row.minute,
        }),
        leaseUntil: null,
        leaseToken: null,
      },
    });
  }
}

export async function seedRemindersForUsersWithTimezone(now: Date = new Date()): Promise<void> {
  const profiles = await prisma.userProfile.findMany({
    where: {
      timezone: { not: null },
      OR: REMINDER_LABELS.map((label) => ({
        user: { reminders: { none: { label } } },
      })),
    },
    select: { userId: true, timezone: true },
    take: 50,
  });
  for (const profile of profiles) {
    if (!profile.timezone) {
      continue;
    }
    await ensureDefaultReminders(profile.userId, profile.timezone, now);
  }
}

export async function claimDueReminders(input?: {
  now?: Date;
  limit?: number;
  leaseForMs?: number;
}): Promise<ClaimedReminder[]> {
  const now = input?.now ?? new Date();
  const limit = input?.limit ?? CLAIM_LIMIT;
  const leaseForMs = input?.leaseForMs ?? LEASE_MS;
  const leaseUntil = new Date(now.getTime() + leaseForMs);
  const due = await prisma.mealReminder.findMany({
    where: {
      enabled: true,
      nextRunAt: { lte: now },
      label: { in: [...REMINDER_LABELS] },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
    },
    orderBy: { nextRunAt: "asc" },
    take: limit,
  });
  const claimed: ClaimedReminder[] = [];
  for (const row of due) {
    const leaseToken = crypto.randomUUID();
    const result = await prisma.mealReminder.updateMany({
      where: {
        id: row.id,
        enabled: true,
        nextRunAt: { lte: now },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
      },
      data: { leaseUntil, leaseToken },
    });
    if (result.count === 1 && isReminderLabel(row.label)) {
      claimed.push({
        hour: row.hour,
        id: row.id,
        label: row.label,
        leaseToken,
        minute: row.minute,
        userId: row.userId,
      });
    }
  }
  return claimed;
}

export async function completeReminder(job: ClaimedReminder, now: Date = new Date()): Promise<void> {
  const profile = await prisma.userProfile.findUnique({
    where: { userId: job.userId },
    select: { timezone: true },
  });
  const timeZone = profile?.timezone;
  const nextRunAt = timeZone
    ? nextLocalOccurrence({ now, timeZone, hour: job.hour, minute: job.minute })
    : new Date(now.getTime() + MISSING_TIMEZONE_RETRY_MS);
  await prisma.mealReminder.updateMany({
    where: { id: job.id, leaseToken: job.leaseToken },
    data: {
      lastFiredAt: now,
      leaseToken: null,
      leaseUntil: null,
      nextRunAt,
    },
  });
}

export async function releaseReminder(
  job: ClaimedReminder,
  retryAt: Date,
): Promise<void> {
  await prisma.mealReminder.updateMany({
    where: { id: job.id, leaseToken: job.leaseToken },
    data: {
      leaseToken: null,
      leaseUntil: null,
      nextRunAt: retryAt,
    },
  });
}

export function missingTimezoneRetryAt(now: Date = new Date()): Date {
  return new Date(now.getTime() + MISSING_TIMEZONE_RETRY_MS);
}

export function sendFailureRetryAt(now: Date = new Date()): Date {
  return new Date(now.getTime() + SEND_FAILURE_RETRY_MS);
}

export async function buildCheckInPrompt(input: {
  label: ReminderLabel;
  now?: Date;
  userId: string;
}): Promise<string> {
  if (input.label === "summary") {
    return summaryCheckInPrompt(await loadSummaryCheckInSnapshot(input.userId, input.now));
  }
  return checkInPrompt(input.label);
}

export async function loadSummaryCheckInSnapshot(
  userId: string,
  now?: Date,
): Promise<SummaryCheckInSnapshot> {
  const day = await loadTodayNutritionDay({ now, userId });
  return {
    date: day.date,
    goals: day.goals,
    meals: day.meals.map((meal) => {
      const local = getZonedParts(new Date(meal.eatenAt), day.timezone);
      return {
        items: meal.items
          .map((item) => `${item.name} ${formatLoggedAmount(item.amount)}${item.unit}`)
          .join(", "),
        kcal: meal.totals.energyKcal,
        label: meal.label,
        time: formatClock(local.hour, local.minute),
      };
    }),
    timezone: day.timezone,
    totals: {
      carbohydrates: day.totals.carbohydrates,
      energyKcal: day.totals.energyKcal,
      fat: day.totals.fat,
      fiber: day.totals.fiber,
      proteins: day.totals.proteins,
    },
  };
}

function formatLoggedAmount(amount: number): string {
  if (Number.isInteger(amount)) {
    return String(amount);
  }
  return String(Math.round(amount * 10) / 10);
}

export async function reminderTimezone(userId: string): Promise<string | null> {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { timezone: true },
  });
  return profile?.timezone ?? null;
}

export async function reminderFiredToday(input: {
  reminderId: string;
  timeZone: string;
  now?: Date;
}): Promise<boolean> {
  const row = await prisma.mealReminder.findUnique({
    where: { id: input.reminderId },
    select: { lastFiredAt: true },
  });
  if (!row?.lastFiredAt) {
    return false;
  }
  const range = localDayRange(input.now ?? new Date(), input.timeZone);
  return row.lastFiredAt.getTime() >= range.from.getTime() && row.lastFiredAt.getTime() < range.to.getTime();
}

export async function mealAlreadyLoggedToday(input: {
  userId: string;
  label: MealCheckInLabel;
  timeZone: string;
  now?: Date;
}): Promise<boolean> {
  const range = localDayRange(input.now ?? new Date(), input.timeZone);
  const count = await prisma.meal.count({
    where: {
      userId: input.userId,
      label: input.label,
      eatenAt: { gte: range.from, lt: range.to },
    },
  });
  return count > 0;
}

export async function resolveReachTarget(userId: string): Promise<ReachTarget | null> {
  const [latestSession, identities] = await Promise.all([
    prisma.agentSession.findFirst({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.channelIdentity.findMany({
      where: { userId, provider: { in: ["telegram", "whatsapp"] } },
    }),
  ]);
  const telegram = identities.find((row) => row.provider === "telegram");
  const whatsapp = identities.find((row) => row.provider === "whatsapp" && row.threadId);
  const latestChannel = latestSession?.channel as ChannelName | undefined;

  if (latestChannel === "telegram" && telegram) {
    return { channel: "telegram", chatId: telegram.threadId ?? telegram.providerUserId };
  }
  if (latestChannel === "whatsapp" && whatsapp?.threadId) {
    return { channel: "whatsapp", threadId: whatsapp.threadId };
  }
  if (telegram) {
    return { channel: "telegram", chatId: telegram.threadId ?? telegram.providerUserId };
  }
  if (whatsapp?.threadId) {
    return { channel: "whatsapp", threadId: whatsapp.threadId };
  }
  if (latestSession && latestChannel === "web") {
    return { channel: "web", sessionId: latestSession.eveSessionId };
  }
  return null;
}

async function applyReminderPatch(
  userId: string,
  timeZone: string,
  patch: ReminderPatch,
  now: Date,
): Promise<void> {
  const current = await prisma.mealReminder.findUnique({
    where: { userId_label: { userId, label: patch.label } },
  });
  if (!current) {
    throw new ReminderError("Reminder not found");
  }
  const hour = patch.hour ?? current.hour;
  const minute = patch.minute ?? current.minute;
  if (!isValidClock(hour, minute)) {
    throw new ReminderError("time must be a valid local clock time");
  }
  const enabled = patch.enabled ?? current.enabled;
  const clockChanged = hour !== current.hour || minute !== current.minute;
  const enabling = enabled && !current.enabled;
  await prisma.mealReminder.update({
    where: { id: current.id },
    data: {
      enabled,
      hour,
      minute,
      ...(clockChanged || enabling
        ? {
            leaseToken: null,
            leaseUntil: null,
            nextRunAt: nextLocalOccurrence({ now, timeZone, hour, minute }),
          }
        : {}),
    },
  });
}
