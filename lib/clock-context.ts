import { inferMealLabel, mealSlotContextText } from "./meal-label.ts";
import { preferredLanguageForCountry } from "./open-food-facts-name.ts";
import { formatClock } from "./reminder-clock.ts";
import { formatDateInTimeZone, getZonedParts } from "./timezone.ts";

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
  return `Catalog country: ${code} (search names in ${languageName} and English).`;
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
  const zone = input.timezoneIsFallback
    ? `${input.timeZone}; timezone is unknown`
    : input.timeZone;
  return [
    `Current local time: ${weekday} ${calendarDate} ${formatClock(local.hour, local.minute)} (${zone}).`,
    `Nutrition day: ${formatDateInTimeZone(input.now, input.timeZone)} (04:00 to 04:00 the next morning).`,
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
