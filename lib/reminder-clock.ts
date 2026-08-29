export const REMINDER_LABELS = ["breakfast", "lunch", "dinner"] as const;
export type ReminderLabel = (typeof REMINDER_LABELS)[number];

export const DEFAULT_REMINDER_TIMES: Record<ReminderLabel, { hour: number; minute: number }> = {
  breakfast: { hour: 10, minute: 0 },
  lunch: { hour: 14, minute: 0 },
  dinner: { hour: 21, minute: 0 },
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
