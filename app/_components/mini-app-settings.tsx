"use client";

import {
  DailyGoalsSettings,
  LinkAccountsSettings,
  LocationSettings,
  ReminderSettings,
} from "@/app/_components/settings-forms";
import { useAppLocale } from "@/app/_components/lingui-client-provider";
import { bootTelegramWebApp } from "@/app/_components/telegram-webapp-client";
import { getMiniAppSettingsAction } from "@/app/actions/settings";
import type { GoalsView } from "@/lib/goal-values";
import type { Locale } from "@/lib/i18n/locales";
import type { ReminderClock, ReminderLabel } from "@/lib/reminder-clock";
import { Trans, useLingui } from "@lingui/react/macro";
import { Spinner } from "@heroui/react";
import { useEffect, useState } from "react";
import useSWR from "swr";

type SettingsSWRKey = readonly ["mini-app-settings", string];

type MiniAppSettingsData = {
  readonly country: string | null;
  readonly goals: GoalsView;
  readonly locale: Locale;
  readonly reminders: Readonly<Record<ReminderLabel, ReminderClock>>;
  readonly timeZones: readonly string[];
  readonly timezone: string | null;
};

async function fetchSettings([, initData]: SettingsSWRKey): Promise<MiniAppSettingsData> {
  const result = await getMiniAppSettingsAction({ initData: initData || undefined });
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}

export function MiniAppSettings() {
  const { t } = useLingui();
  const { setLocale } = useAppLocale();
  const [initData, setInitData] = useState<string | null>(null);

  useEffect(() => {
    return bootTelegramWebApp((value) => {
      setInitData(value);
    });
  }, []);

  const settingsKey: SettingsSWRKey | null =
    initData != null ? ["mini-app-settings", initData] : null;
  const { data, error, mutate } = useSWR(settingsKey, fetchSettings, {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
  });

  useEffect(() => {
    if (!data?.locale) {
      return;
    }
    setLocale(data.locale);
  }, [data?.locale, setLocale]);

  const errorMessage =
    error instanceof Error ? error.message : error ? t`Could not load settings.` : null;
  const telegramInit = initData || undefined;

  if (errorMessage) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-3 py-6">
        <h1 className="text-foreground text-xl font-semibold">
          <Trans>Settings</Trans>
        </h1>
        <p className="text-danger text-sm">{errorMessage}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 p-2">
      <LocationSettings
        defaultCountry={data.country}
        defaultTimezone={data.timezone}
        initData={telegramInit}
        timeZones={data.timeZones}
        onLocaleSaved={() => {
          void mutate();
        }}
        onTimezoneSaved={() => {
          void mutate();
        }}
      />
      <DailyGoalsSettings defaultGoals={data.goals} initData={telegramInit} />
      <ReminderSettings
        initData={telegramInit}
        key={data.timezone ?? "none"}
        reminders={data.reminders}
        timezone={data.timezone}
      />
      <LinkAccountsSettings initData={telegramInit} />
    </div>
  );
}
