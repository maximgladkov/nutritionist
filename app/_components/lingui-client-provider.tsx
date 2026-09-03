"use client";

import { setupI18n, type I18n, type Messages } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { I18nProvider as AriaI18nProvider } from "@react-aria/i18n";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { allMessages } from "@/lib/i18n/catalogs";
import {
  getDirection,
  resolveLocale,
  writeLocaleCookie,
  type Locale,
} from "@/lib/i18n/locales";

type AppLocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

const AppLocaleContext = createContext<AppLocaleContextValue | null>(null);

export function useAppLocale(): AppLocaleContextValue {
  const value = useContext(AppLocaleContext);
  if (!value) {
    throw new Error("useAppLocale must be used within LinguiClientProvider");
  }
  return value;
}

export function LinguiClientProvider({
  children,
  initialLocale,
}: {
  readonly children: ReactNode;
  readonly initialLocale: Locale;
}) {
  const [i18n] = useState<I18n>(() =>
    setupI18n({
      locale: initialLocale,
      messages: allMessages as Record<string, Messages>,
    }),
  );
  const [locale, setLocaleState] = useState(initialLocale);

  const setLocale = useCallback(
    (next: Locale) => {
      const resolved = resolveLocale(next);
      if (resolved === i18n.locale) {
        setLocaleState(resolved);
        return;
      }
      i18n.activate(resolved);
      document.documentElement.lang = resolved;
      document.documentElement.dir = getDirection(resolved);
      writeLocaleCookie(resolved);
      setLocaleState(resolved);
    },
    [i18n],
  );

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return (
    <I18nProvider i18n={i18n}>
      <AriaI18nProvider locale={locale}>
        <AppLocaleContext.Provider value={value}>{children}</AppLocaleContext.Provider>
      </AriaI18nProvider>
    </I18nProvider>
  );
}
