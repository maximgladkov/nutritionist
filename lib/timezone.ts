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
  const parts = getZonedParts(date, timeZone);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
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
  const local = getZonedParts(now, timeZone);
  const from = zonedLocalToUtc({
    timeZone,
    year: local.year,
    month: local.month,
    day: local.day,
    hour: 0,
    minute: 0,
    second: 0,
  });
  const next = addCalendarDays(local, 1);
  const to = zonedLocalToUtc({
    timeZone,
    year: next.year,
    month: next.month,
    day: next.day,
    hour: 0,
    minute: 0,
    second: 0,
  });
  return { from, to };
}

export function listTimeZones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return ["UTC"];
  }
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

