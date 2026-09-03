export const MEAL_CHECK_IN_LABELS = ["breakfast", "lunch", "dinner"] as const;
export type MealCheckInLabel = (typeof MEAL_CHECK_IN_LABELS)[number];

export const REMINDER_LABELS = ["breakfast", "lunch", "dinner", "summary"] as const;
export type ReminderLabel = (typeof REMINDER_LABELS)[number];

export const DEFAULT_REMINDER_TIMES: Record<ReminderLabel, { hour: number; minute: number }> = {
  breakfast: { hour: 10, minute: 0 },
  lunch: { hour: 14, minute: 0 },
  dinner: { hour: 21, minute: 0 },
  summary: { hour: 22, minute: 0 },
};

export type ReminderClock = {
  readonly enabled: boolean;
  readonly hour: number;
  readonly minute: number;
};

export function reminderRowsFromState(
  remindersByLabel: ReadonlyMap<ReminderLabel, ReminderClock>,
): Record<ReminderLabel, ReminderClock> {
  return Object.fromEntries(
    REMINDER_LABELS.map((label) => {
      const row = remindersByLabel.get(label) ?? DEFAULT_REMINDER_TIMES[label];
      return [
        label,
        {
          enabled: "enabled" in row ? row.enabled : true,
          hour: row.hour,
          minute: row.minute,
        },
      ];
    }),
  ) as Record<ReminderLabel, ReminderClock>;
}

export function isReminderLabel(value: string): value is ReminderLabel {
  return (REMINDER_LABELS as readonly string[]).includes(value);
}

export function isMealCheckInLabel(value: string): value is MealCheckInLabel {
  return (MEAL_CHECK_IN_LABELS as readonly string[]).includes(value);
}

export function checkInPrompt(label: ReminderLabel): string {
  if (label === "summary") {
    return [
      "This is a scheduled daily summary check-in.",
      "Look up today's intake with get_nutrition_summary and goals with get_my_goals.",
      "Give a short recap of the day: what they ate, totals versus goals, and a brief encouraging note.",
      "If nothing was logged, say so and offer to add meals.",
      "Be warm and short. Do not mention schedules, cron, or that this message was automated.",
    ].join(" ");
  }
  return [
    `This is a scheduled ${label} check-in.`,
    `Ask briefly how ${label} went and offer to log it.`,
    "Be warm and short. Do not mention schedules, cron, or that this message was automated.",
  ].join(" ");
}

export function isValidClock(hour: number, minute: number): boolean {
  return (
    Number.isInteger(hour) &&
    Number.isInteger(minute) &&
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59
  );
}

export function formatClock(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function parseClock(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!isValidClock(hour, minute)) {
    return null;
  }
  return { hour, minute };
}
