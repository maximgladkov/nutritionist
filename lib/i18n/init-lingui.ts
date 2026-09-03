import type { I18n } from "@lingui/core";
import { setI18n } from "@lingui/react/server";
import { getI18nInstance } from "./app-router-i18n";
import { resolveLocale } from "./locales";

export function initLingui(locale: string): I18n {
  const i18n = getI18nInstance(resolveLocale(locale));
  setI18n(i18n);
  return i18n;
}
