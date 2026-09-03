"use client";

import {
  DailyGoalsSettings,
  LinkAccountsSettings,
  LocationSettings,
  ReminderSettings,
} from "@/app/_components/settings-forms";
import { bootTelegramWebApp } from "@/app/_components/telegram-webapp-client";
import { getMiniAppSettingsAction } from "@/app/actions/settings";
import type { CountryOption } from "@/lib/countries";
import type { GoalsView } from "@/lib/goal-values";
import type { ReminderClock, ReminderLabel } from "@/lib/reminder-clock";
import { Spinner } from "@heroui/react";
import { useEffect, useState } from "react";
import useSWR from "swr";

type SettingsSWRKey = readonly ["mini-app-settings", string];

type MiniAppSettingsData = {
  readonly countries: readonly CountryOption[];
  readonly country: string | null;
  readonly goals: GoalsView;
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

  const errorMessage =
    error instanceof Error ? error.message : error ? "Could not load settings." : null;
  const telegramInit = initData || undefined;

  if (errorMessage) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-3 py-6">
        <h1 className="text-foreground text-xl font-semibold">Settings</h1>
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
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 py-6">
      <LocationSettings
        countries={data.countries}
        defaultCountry={data.country}
        defaultTimezone={data.timezone}
        initData={telegramInit}
        timeZones={data.timeZones}
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
