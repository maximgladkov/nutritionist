import { inferMealLabel, mealSlotContextText } from "./meal-label.ts";
import { preferredLanguageForCountry } from "./open-food-facts-name.ts";
import { formatClock } from "./reminder-clock.ts";
import { formatDateInTimeZone, getZonedParts, localWeekDates, shiftYmd } from "./timezone.ts";

export function catalogCountryContextText(country?: string | null): string {
  const code = country?.trim().toUpperCase() ?? "";
  if (code.length === 0) {
    return "Catalog country is unknown.";
  }
  const language = preferredLanguageForCountry(code);
  const languageName = language ? languageDisplayName(language) : undefined;
  if (!languageName) {
    return `Catalog country: ${code}.`;
  }
  if (language === "en") {
    return `Catalog country: ${code} (search names in English).`;
  }
  return `Catalog country: ${code} (search names in ${languageName} and English; this is not the reply language).`;
}

export function clockContextText(input: {
  catalogCountry?: string | null;
  now: Date;
  timeZone: string;
  timezoneIsFallback: boolean;
  liveNutrition?: string;
}): string {
  const local = getZonedParts(input.now, input.timeZone);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: input.timeZone,
    weekday: "long",
  }).format(input.now);
  const calendarDate = `${String(local.year).padStart(4, "0")}-${String(local.month).padStart(2, "0")}-${String(local.day).padStart(2, "0")}`;
  const week = localWeekDates(input.now, input.timeZone);
  const lastWeek = { from: shiftYmd(week.from, -7), to: shiftYmd(week.to, -7) };
  const zone = input.timezoneIsFallback
    ? `${input.timeZone}; timezone is unknown`
    : input.timeZone;
  const nutritionDay = formatDateInTimeZone(input.now, input.timeZone);
  const afterMidnight =
    nutritionDay === calendarDate ? " Something eaten after midnight but before 04:00 this morning was yesterday's." : " It is after midnight, but the day isn't over until 04:00.";
  return [
    `Current local time: ${weekday} ${calendarDate} ${formatClock(local.hour, local.minute)} (${zone}).`,
    `Nutrition day: ${nutritionDay} (04:00 to 04:00 the next morning). "Today" always means ${nutritionDay} and "yesterday" ${shiftYmd(nutritionDay, -1)}, as in the app's diary.${afterMidnight}`,
    `Current week (Monday to Sunday): ${week.from} to ${week.to}. Last week: ${lastWeek.from} to ${lastWeek.to}.`,
    mealSlotContextText(inferMealLabel(input.now, input.timeZone)),
    catalogCountryContextText(input.catalogCountry),
    ...(input.liveNutrition ? [input.liveNutrition] : []),
  ].join(" ");
}

function languageDisplayName(language: string): string | undefined {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(language) ?? undefined;
  } catch {
    return undefined;
  }
}
