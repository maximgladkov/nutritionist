import "server-only";
import type { I18n } from "@lingui/core";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getI18nInstance } from "./app-router-i18n";
import { initLingui } from "./init-lingui";
import { isLocale, LOCALE_COOKIE_NAME, ADMIN_UI_HEADER, negotiateLocale, type Locale, sourceLocale } from "./locales";

export async function resolveRequestLocale(userId?: string): Promise<Locale> {
  if ((await headers()).get(ADMIN_UI_HEADER) === "1") {
    return sourceLocale;
  }
  if (userId) {
    const profile = await prisma.userProfile.findUnique({
      where: { userId },
      select: { locale: true },
    });
    if (profile?.locale && isLocale(profile.locale)) {
      return profile.locale;
    }
  }
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
  if (cookieValue && isLocale(cookieValue)) {
    return cookieValue;
  }
  return negotiateLocale((await headers()).get("accept-language"));
}

export async function getRequestI18n(userId?: string): Promise<I18n> {
  const locale = await resolveRequestLocale(userId);
  return initLingui(locale);
}

export function getI18nForLocale(locale: Locale): I18n {
  return getI18nInstance(locale);
}
