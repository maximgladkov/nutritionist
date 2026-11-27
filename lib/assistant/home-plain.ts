import { formatNumber, pluralForm, type Locale } from "../i18n/locales.ts";
import type { MainMeal } from "./home-day.ts";

// The coach's line on Today when no model words it: one per language the app speaks, picked when
// it's shown. Starts in lower case, since it usually follows the person's name ("Kira, ...").
// The other languages speak informally, like the model does (ты, tú, du).
export type Plain = Record<Locale, string>;

export const num = (locale: Locale, value: number): string => formatNumber(locale, Math.round(value));
export const tenth = (locale: Locale, value: number): string => formatNumber(locale, Math.round(value * 10) / 10);

// "7 days", "7 дней", "7 días".
export function dayCount(locale: Locale, count: number): string {
  if (locale === "ru") return `${num("ru", count)} ${pluralForm("ru", count, { few: "дня", many: "дней", one: "день", other: "дня" })}`;
  if (locale === "es") return `${num("es", count)} ${count === 1 ? "día" : "días"}`;
  if (locale === "de") return `${num("de", count)} ${count === 1 ? "Tag" : "Tage"}`;
  return `${count} ${count === 1 ? "day" : "days"}`;
}

// After "из" ("из 5 дней", "из 21 дня").
export function ruDaysOf(count: number): string {
  return `${num("ru", count)} ${pluralForm("ru", count, { one: "дня", other: "дней" })}`;
}

export function ruWord(count: number, one: string, few: string, many: string): string {
  return pluralForm("ru", count, { few, many, one, other: few });
}

// "на ужин", "para la cena": what a suggestion is for.
export const MEAL_FOR: Record<"de" | "es" | "ru", Record<MainMeal, string>> = {
  de: { breakfast: "zum Frühstück", dinner: "zum Abendessen", lunch: "zum Mittagessen" },
  es: { breakfast: "el desayuno", dinner: "la cena", lunch: "el almuerzo" },
  ru: { breakfast: "завтрак", dinner: "ужин", lunch: "обед" },
};

// How much of what's left a food covers, as said after its name.
export function coverageWords(locale: Locale, part: number, whole: number): string | null {
  const share = part / whole;
  if (share < 0.2) return null;
  const level = share >= 0.9 ? 0 : share >= 0.6 ? 1 : share >= 0.42 ? 2 : share >= 0.29 ? 3 : 4;
  const words: Plain[] = [
    { de: "deckt es ab", en: "covers it", es: "lo cubre", ru: "закрывает всё" },
    { de: "deckt das meiste ab", en: "covers most of it", es: "cubre la mayor parte", ru: "закрывает большую часть" },
    { de: "deckt etwa die Hälfte ab", en: "covers about half", es: "cubre más o menos la mitad", ru: "закрывает примерно половину" },
    { de: "deckt etwa ein Drittel ab", en: "covers about a third", es: "cubre más o menos un tercio", ru: "закрывает примерно треть" },
    { de: "deckt etwa ein Viertel ab", en: "covers about a quarter", es: "cubre más o menos un cuarto", ru: "закрывает примерно четверть" },
  ];
  return words[level]![locale];
}

// Upper-cases the first letter, past an opening "¡" or "¿".
export function upperFirst(text: string): string {
  const index = text.search(/\p{L}/u);
  return index < 0 ? text : text.slice(0, index) + text.charAt(index).toUpperCase() + text.slice(index + 1);
}
