import {
  localDayRange,
  localInclusiveDateRange,
  localRollingDaysRange,
  localWeekRange,
} from "./timezone.ts";

export const SUMMARY_PERIODS = ["today", "week", "days30", "custom"] as const;
export type SummaryPeriod = (typeof SUMMARY_PERIODS)[number];
export const CUSTOM_RANGE_MAX_DAYS = 90;

export function isSummaryPeriod(value: string): value is SummaryPeriod {
  return (SUMMARY_PERIODS as readonly string[]).includes(value);
}

export function resolveSummaryRange(input: {
  customFrom?: string;
  customTo?: string;
  now: Date;
  period: SummaryPeriod;
  timeZone: string;
}): { from: Date; to: Date } {
  switch (input.period) {
    case "today":
      return localDayRange(input.now, input.timeZone);
    case "week":
      return localWeekRange(input.now, input.timeZone);
    case "days30":
      return localRollingDaysRange(input.now, input.timeZone, 30);
    case "custom":
      if (!input.customFrom || !input.customTo) {
        throw new RangeError("Custom range requires from and to dates");
      }
      return localInclusiveDateRange(
        input.timeZone,
        input.customFrom,
        input.customTo,
        CUSTOM_RANGE_MAX_DAYS,
      );
  }
}
