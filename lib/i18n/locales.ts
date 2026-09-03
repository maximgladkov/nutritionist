export const locales = ["en", "ru"] as const;
export type Locale = (typeof locales)[number];
export const sourceLocale: Locale = "en";

export const LOCALE_COOKIE_NAME = "locale";
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
