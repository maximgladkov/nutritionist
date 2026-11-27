export const locales = ["en", "ru", "es", "de", "fr", "it", "pt", "nl", "pl", "tr", "uk"] as const;
export type Locale = (typeof locales)[number];
export const sourceLocale: Locale = "en";

export const LOCALE_COOKIE_NAME = "locale";
export const ADMIN_UI_HEADER = "x-admin-ui";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const RTL_LOCALES = new Set(["ar", "he", "fa", "ur"]);

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

export function getDirection(locale: string): "ltr" | "rtl" {
  return RTL_LOCALES.has(locale.split("-")[0] ?? "") ? "rtl" : "ltr";
}

const LOCALE_DISPLAY_NAMES: Record<Locale, string> = {
  en: "English",
  ru: "Русский",
  es: "Español",
  de: "Deutsch",
  fr: "Français",
  it: "Italiano",
  pt: "Português",
  nl: "Nederlands",
  pl: "Polski",
  tr: "Türkçe",
  uk: "Українська",
};

export function localeDisplayName(locale: string): string {
  return isLocale(locale) ? LOCALE_DISPLAY_NAMES[locale] : locale;
}

export function resolveLocale(candidate: string | null | undefined): Locale {
  if (!candidate) {
    return sourceLocale;
  }
  if (isLocale(candidate)) {
    return candidate;
  }
  const base = candidate.split("-")[0] ?? "";
  return isLocale(base) ? base : sourceLocale;
}

export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) {
    return sourceLocale;
  }
  for (const part of acceptLanguage.split(",")) {
    const tag = part.split(";")[0]?.trim();
    if (!tag) {
      continue;
    }
    if (isLocale(tag)) {
      return tag;
    }
    const base = tag.split("-")[0] ?? "";
    if (isLocale(base)) {
      return base;
    }
  }
  return sourceLocale;
}

// The language of what the API writes: the one chosen on the account, else what the app asks for.
export function pickLocale(accountLocale: string | null | undefined, acceptLanguage: string | null | undefined): Locale {
  return accountLocale && isLocale(accountLocale) ? accountLocale : negotiateLocale(acceptLanguage);
}

// "one", "few", "many" or "other" for a count in that language.
export function pluralForm<T>(locale: Locale, count: number, forms: { one: T; few?: T; many?: T; other: T }): T {
  const rule = new Intl.PluralRules(locale).select(count);
  return (rule === "one" || rule === "few" || rule === "many" ? forms[rule] : undefined) ?? forms.other;
}

// A number as it's written in that language ("1,000", "1 000", "1.000").
export function formatNumber(locale: Locale, value: number): string {
  return value.toLocaleString(locale === "en" ? "en-US" : locale);
}

export function localeCookieOptions() {
  return {
    maxAge: LOCALE_COOKIE_MAX_AGE,
    path: "/",
    sameSite: "lax" as const,
  };
}

export function writeLocaleCookie(locale: Locale) {
  if (typeof document === "undefined") {
    return;
  }
  document.cookie = `${LOCALE_COOKIE_NAME}=${encodeURIComponent(locale)};path=/;max-age=${LOCALE_COOKIE_MAX_AGE};samesite=lax`;
}
