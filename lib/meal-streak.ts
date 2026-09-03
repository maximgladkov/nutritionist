import { shiftYmd } from "./timezone.ts";

type Presence = "no" | "unknown" | "yes";

export function consecutiveRecordedDays(dates: ReadonlySet<string>, today: string): number {
  return walkMealStreak((date) => (dates.has(date) ? "yes" : "no"), today).days;
}

export function mealStreakFromBuckets(
  daysByDate: Readonly<Record<string, { mealCount: number }>>,
  today: string,
): { complete: boolean; days: number } {
  return walkMealStreak((date) => {
    const bucket = daysByDate[date];
    if (!bucket) {
      return "unknown";
    }
    return bucket.mealCount > 0 ? "yes" : "no";
  }, today);
}

export function resolveMealStreak(input: {
  buckets: Readonly<Record<string, { mealCount: number }>>;
  serverStreak?: number;
  serverTodayMealCount?: number;
  today: string;
}): number {
  const local = mealStreakFromBuckets(input.buckets, input.today);
  if (local.complete) {
    return local.days;
  }
  const serverStreak = input.serverStreak ?? 0;
  const todayCount = input.buckets[input.today]?.mealCount ?? 0;
  const serverTodayCount = input.serverTodayMealCount ?? 0;
  if (todayCount > 0 && serverTodayCount === 0) {
    return Math.max(local.days, serverStreak + 1);
  }
  return Math.max(local.days, serverStreak);
}

function walkMealStreak(
  presence: (date: string) => Presence,
  today: string,
): { complete: boolean; days: number } {
  let date = today;
  let state = presence(date);
  if (state === "no") {
    date = shiftYmd(today, -1);
    state = presence(date);
  }
  if (state === "no") {
    return { complete: true, days: 0 };
  }
  if (state === "unknown") {
    return { complete: false, days: 0 };
  }
  let days = 0;
  while (true) {
    const current = presence(date);
    if (current === "yes") {
      days += 1;
      date = shiftYmd(date, -1);
      continue;
    }
    if (current === "no") {
      return { complete: true, days };
    }
    return { complete: false, days };
  }
}
