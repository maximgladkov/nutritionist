"use client";

import { useAppLocale } from "@/app/_components/lingui-client-provider";
import {
  DailyGoalsSettings,
  LinkAccountsSettings,
  LocationSettings,
  ReminderSettings,
} from "@/app/_components/settings-forms";
import { getMiniAppSettingsAction } from "@/app/actions/settings";
import type { GoalsView } from "@/lib/goal-values";
import type { Locale } from "@/lib/i18n/locales";
import type { ReminderClock, ReminderLabel } from "@/lib/reminder-clock";
import { ScrollShadow, Spinner } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { useEffect } from "react";
import useSWR from "swr";

type SettingsSWRKey = readonly ["desktop-settings"];

type DesktopSettingsData = {
  readonly country: string | null;
  readonly goals: GoalsView;
  readonly locale: Locale;
  readonly reminders: Readonly<Record<ReminderLabel, ReminderClock>>;
  readonly timeZones: readonly string[];
  readonly timezone: string | null;
};

async function fetchSettings(): Promise<DesktopSettingsData> {
  const result = await getMiniAppSettingsAction({});
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}

export function DesktopSettings() {
  const { t } = useLingui();
  const { setLocale } = useAppLocale();
  const { data, error, mutate } = useSWR(["desktop-settings"] satisfies SettingsSWRKey, fetchSettings, {
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

  if (errorMessage) {
    return <p className="text-danger px-4 py-6 text-sm">{errorMessage}</p>;
  }

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center py-12">
        <Spinner />
      </div>
    );
  }

  return (
    <ScrollShadow className="@container h-full overflow-y-auto px-2 py-3">
      <div className="flex flex-col gap-6">
        <LocationSettings
          defaultCountry={data.country}
          defaultTimezone={data.timezone}
          timeZones={data.timeZones}
          onLocaleSaved={() => {
            void mutate();
          }}
          onTimezoneSaved={() => {
            void mutate();
          }}
        />
        <DailyGoalsSettings defaultGoals={data.goals} />
        <ReminderSettings
          key={data.timezone ?? "none"}
          reminders={data.reminders}
          timezone={data.timezone}
        />
        <LinkAccountsSettings showConsume />
      </div>
    </ScrollShadow>
  );
}
