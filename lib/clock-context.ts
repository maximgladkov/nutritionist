import { formatClock } from "./reminder-clock.ts";
import { formatDateInTimeZone, getZonedParts } from "./timezone.ts";

export function clockContextText(input: {
  now: Date;
  timeZone: string;
  timezoneIsFallback: boolean;
}): string {
  const local = getZonedParts(input.now, input.timeZone);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: input.timeZone,
    weekday: "long",
  }).format(input.now);
  const calendarDate = `${String(local.year).padStart(4, "0")}-${String(local.month).padStart(2, "0")}-${String(local.day).padStart(2, "0")}`;
  const zone = input.timezoneIsFallback
    ? `${input.timeZone}; timezone is unknown`
    : input.timeZone;
  return [
    `Current local time: ${weekday} ${calendarDate} ${formatClock(local.hour, local.minute)} (${zone}).`,
    `Nutrition day: ${formatDateInTimeZone(input.now, input.timeZone)} (04:00 to 04:00 the next morning).`,
  ].join(" ");
}
