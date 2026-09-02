export const DAY_START_HOUR = 4;

export function normalizeTimezone(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: trimmed }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

export function formatDateInTimeZone(date: Date, timeZone: string): string {
  return formatYmd(nutritionDayParts(date, timeZone));
}

export type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const read = (type: string) => {
    const value = parts.find((part) => part.type === type)?.value;
    if (value === undefined) {
      throw new Error(`Missing ${type} in zoned date`);
    }
    return Number(value);
  };
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}

export function zonedLocalToUtc(input: {
  timeZone: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second?: number;
}): Date {
  const second = input.second ?? 0;
  const utcGuess = Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute, second);
  const actual = getZonedParts(new Date(utcGuess), input.timeZone);
  const actualAsUtc = Date.UTC(
    actual.year,
    actual.month - 1,
    actual.day,
    actual.hour,
    actual.minute,
    actual.second,
  );
  const wantedAsUtc = Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute, second);
  return new Date(utcGuess + (wantedAsUtc - actualAsUtc));
}

export function nextLocalOccurrence(input: {
  now: Date;
  timeZone: string;
  hour: number;
  minute: number;
}): Date {
  const local = getZonedParts(input.now, input.timeZone);
  const today = zonedLocalToUtc({
    timeZone: input.timeZone,
    year: local.year,
    month: local.month,
    day: local.day,
    hour: input.hour,
    minute: input.minute,
    second: 0,
  });
  if (today.getTime() > input.now.getTime()) {
    return today;
  }
  const tomorrow = addCalendarDays(local, 1);
  return zonedLocalToUtc({
    timeZone: input.timeZone,
    year: tomorrow.year,
    month: tomorrow.month,
    day: tomorrow.day,
    hour: input.hour,
    minute: input.minute,
    second: 0,
  });
}

export function localDayRange(now: Date, timeZone: string): { from: Date; to: Date } {
  return rangeFromLocalStart(nutritionDayParts(now, timeZone), 1, timeZone);
}

export function localWeekRange(now: Date, timeZone: string): { from: Date; to: Date } {
  const local = nutritionDayParts(now, timeZone);
  const start = addCalendarDays(local, -mondayOffset(local));
  return rangeFromLocalStart(start, 7, timeZone);
}

export function localRollingDaysRange(
  now: Date,
  timeZone: string,
  days: number,
): { from: Date; to: Date } {
  if (!Number.isInteger(days) || days < 1) {
    throw new RangeError("days must be a positive integer");
  }
  const local = nutritionDayParts(now, timeZone);
  const start = addCalendarDays(local, -(days - 1));
  return rangeFromLocalStart(start, days, timeZone);
}

export function shiftYmd(value: string, days: number): string {
  const parts = parseYmd(value);
  if (!parts) {
    throw new RangeError("date must be a valid YYYY-MM-DD");
  }
  if (!Number.isInteger(days)) {
    throw new RangeError("days must be an integer");
  }
  return formatYmd(addCalendarDays(parts, days));
}

export function parseYmd(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value.trim());
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) {
    return null;
  }
  return { year, month, day };
}

export function localInclusiveDateRange(
  timeZone: string,
  fromYmd: string,
  toYmd: string,
  maxDays = 90,
): { from: Date; to: Date } {
  const start = parseYmd(fromYmd);
  const end = parseYmd(toYmd);
  if (!start || !end) {
    throw new RangeError("from and to must be valid YYYY-MM-DD dates");
  }
  const startUtc = Date.UTC(start.year, start.month - 1, start.day);
  const endUtc = Date.UTC(end.year, end.month - 1, end.day);
  if (startUtc > endUtc) {
    throw new RangeError("from must be on or before to");
  }
  const dayCount = Math.round((endUtc - startUtc) / 86_400_000) + 1;
  if (dayCount > maxDays) {
    throw new RangeError(`Range cannot exceed ${maxDays} days`);
  }
  return rangeFromLocalStart(start, dayCount, timeZone);
}

export function listLocalDates(from: Date, to: Date, timeZone: string): string[] {
  const dates: string[] = [];
  let cursor: Pick<ZonedParts, "year" | "month" | "day"> = nutritionDayParts(from, timeZone);
  for (let i = 0; i < 366; i += 1) {
    const start = zonedLocalToUtc({
      timeZone,
      year: cursor.year,
      month: cursor.month,
      day: cursor.day,
      hour: DAY_START_HOUR,
      minute: 0,
      second: 0,
    });
    if (start.getTime() >= to.getTime()) {
      break;
    }
    dates.push(formatYmd(cursor));
    cursor = addCalendarDays(cursor, 1);
  }
  return dates;
}

export function listTimeZones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return ["UTC"];
  }
}

function nutritionDayParts(date: Date, timeZone: string): Pick<ZonedParts, "year" | "month" | "day"> {
  const local = getZonedParts(date, timeZone);
  if (local.hour < DAY_START_HOUR) {
    return addCalendarDays(local, -1);
  }
  return { year: local.year, month: local.month, day: local.day };
}

function formatYmd(parts: Pick<ZonedParts, "year" | "month" | "day">): string {
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function rangeFromLocalStart(
  start: Pick<ZonedParts, "year" | "month" | "day">,
  days: number,
  timeZone: string,
): { from: Date; to: Date } {
  const from = zonedLocalToUtc({
    timeZone,
    year: start.year,
    month: start.month,
    day: start.day,
    hour: DAY_START_HOUR,
    minute: 0,
    second: 0,
  });
  const end = addCalendarDays(start, days);
  const to = zonedLocalToUtc({
    timeZone,
    year: end.year,
    month: end.month,
    day: end.day,
    hour: DAY_START_HOUR,
    minute: 0,
    second: 0,
  });
  return { from, to };
}

function mondayOffset(parts: Pick<ZonedParts, "year" | "month" | "day">): number {
  const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  return weekday === 0 ? 6 : weekday - 1;
}

function addCalendarDays(
  parts: Pick<ZonedParts, "year" | "month" | "day">,
  days: number,
): Pick<ZonedParts, "year" | "month" | "day"> {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

