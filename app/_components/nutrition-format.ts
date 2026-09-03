import type { AmountUnit } from "@/lib/nutrition";
import { parseYmd } from "@/lib/timezone";

export function formatGrams(value: number | null): string {
  if (value === null) {
    return "—";
  }
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function formatKcal(value: number | null): string {
  if (value === null) {
    return "—";
  }
  return String(Math.round(value));
}

export function formatAmount(amount: number, unit: AmountUnit): string {
  const rounded = Number.isInteger(amount) ? amount : Math.round(amount * 10) / 10;
  return `${rounded} ${unit}`;
}

export function formatDayRingLabel(
  date: string,
  today: string,
  options: { locale: string; todayLabel: string; yesterdayLabel: string },
): { date: string; weekday: string } | null {
  const parts = parseYmd(date);
  if (!parts) {
    return null;
  }
  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const todayParts = parseYmd(today);
  let weekday = new Intl.DateTimeFormat(options.locale, { weekday: "short", timeZone: "UTC" }).format(
    utc,
  );
  if (date === today) {
    weekday = options.todayLabel;
  } else if (todayParts) {
    const yesterday = new Date(Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day - 1));
    if (
      yesterday.getUTCFullYear() === parts.year &&
      yesterday.getUTCMonth() + 1 === parts.month &&
      yesterday.getUTCDate() === parts.day
    ) {
      weekday = options.yesterdayLabel;
    }
  }
  const dateLine = new Intl.DateTimeFormat(options.locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    ...(todayParts && todayParts.year !== parts.year ? { year: "numeric" } : {}),
  }).format(utc);
  return { date: dateLine, weekday };
}
