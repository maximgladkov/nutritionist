import "server-only";
import { setupI18n, type I18n } from "@lingui/core";
import { allMessages } from "./catalogs";
import { locales, sourceLocale, type Locale } from "./locales";

const instances = new Map<Locale, I18n>();
for (const locale of locales) {
  instances.set(
    locale,
    setupI18n({
      locale,
      messages: { [locale]: allMessages[locale] },
    }),
  );
}

export function getI18nInstance(locale: Locale): I18n {
  return instances.get(locale) ?? instances.get(sourceLocale)!;
}
