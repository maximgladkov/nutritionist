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

export type SummaryCheckInSnapshot = {
  date: string;
  goals: {
    caloriesPerDay: number | null;
    carbsGPerDay: number | null;
    fatGPerDay: number | null;
    fiberGPerDay: number | null;
    proteinGPerDay: number | null;
  };
  meals: readonly {
    items: string;
    kcal: number | null;
    label: string;
    time: string;
  }[];
  timezone: string;
  totals: {
    carbohydrates: number | null;
    energyKcal: number | null;
    fat: number | null;
    fiber: number | null;
    proteins: number | null;
  };
};

export function checkInPrompt(label: MealCheckInLabel): string {
  return [
    `This is a scheduled ${label} check-in.`,
    `Ask briefly how ${label} went and offer to log it.`,
    "Be warm and short. Do not mention schedules, cron, or that this message was automated.",
  ].join(" ");
}

export function summaryCheckInPrompt(snapshot: SummaryCheckInSnapshot): string {
  const meals =
    snapshot.meals.length === 0
      ? "none"
      : snapshot.meals
          .map((meal) => {
            const kcal = formatWhole(meal.kcal, "kcal");
            return `- ${meal.label} ${meal.time}: ${meal.items}${kcal ? ` (${kcal})` : ""}`;
          })
          .join("\n");
  return [
    "This is a scheduled daily summary check-in.",
    `Nutrition day ${snapshot.date} in ${snapshot.timezone} (04:00 to 04:00 the next morning).`,
    "Logged meals:",
    meals,
    `Totals: ${formatTotals(snapshot.totals)}.`,
    `Goals: ${formatGoals(snapshot.goals)}.`,
    "Give a short recap from this snapshot: what they ate, totals versus goals, and a brief encouraging note.",
    "If no meals are listed, say so and offer to add meals.",
    "Do not look up a different day.",
    "Be warm and short. Do not mention schedules, cron, or that this message was automated.",
  ].join("\n");
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

function formatTotals(totals: SummaryCheckInSnapshot["totals"]): string {
  return joinMeasures(
    [
      formatWhole(totals.energyKcal, "kcal"),
      formatWhole(totals.proteins, "g", "protein"),
      formatWhole(totals.carbohydrates, "g", "carbs"),
      formatWhole(totals.fat, "g", "fat"),
      formatWhole(totals.fiber, "g", "fiber"),
    ],
    "none",
  );
}

function formatGoals(goals: SummaryCheckInSnapshot["goals"]): string {
  return joinMeasures(
    [
      formatWhole(goals.caloriesPerDay, "kcal"),
      formatWhole(goals.proteinGPerDay, "g", "protein"),
      formatWhole(goals.carbsGPerDay, "g", "carbs"),
      formatWhole(goals.fatGPerDay, "g", "fat"),
      formatWhole(goals.fiberGPerDay, "g", "fiber"),
    ],
    "none set",
  );
}

function formatWhole(value: number | null, unit: string, name?: string): string | undefined {
  if (value === null || !Number.isFinite(value)) {
    return undefined;
  }
  const amount = `${Math.round(value)} ${unit}`;
  return name === undefined ? amount : `${name} ${amount}`;
}

function joinMeasures(parts: Array<string | undefined>, empty: string): string {
  const present = parts.filter((part): part is string => part !== undefined);
  return present.length > 0 ? present.join(", ") : empty;
}
