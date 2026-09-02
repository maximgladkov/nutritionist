"use client";

import { DayRingStrip } from "@/app/_components/day-ring-strip";
import { DayTotalsRow } from "@/app/_components/day-totals-row";
import { MealGroupsAccordion } from "@/app/_components/meal-groups-accordion";
import {
  getNutritionDayAction,
  getNutritionDaysAction,
  getNutritionDiaryAction,
} from "@/app/actions/summary";
import { hasAnyGoal, type GoalsView } from "@/lib/goal-values";
import { groupMealsByLabel } from "@/lib/meal-groups";
import { dayIndexWindows } from "@/lib/summary-days";
import type {
  NutritionDayBucket,
  NutritionDayPayload,
  NutritionDaysPayload,
  NutritionDiaryPayload,
} from "@/lib/summary";
import { shiftYmd } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { CircleDashed } from "@gravity-ui/icons";
import { EmptyState } from "@heroui-pro/react";
import { Link, Spinner } from "@heroui/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";

type DiarySWRKey = readonly ["nutrition-diary", string];
type DaySWRKey = readonly ["nutrition-day", string, string];
type DaysSWRKey = readonly ["nutrition-days", string, string];

type TelegramWebApp = {
  expand: () => void;
  initData: string;
  offEvent?: (event: string, callback: () => void) => void;
  onEvent?: (event: string, callback: () => void) => void;
  ready: () => void;
};

async function fetchDiary([, initData]: DiarySWRKey): Promise<NutritionDiaryPayload> {
  const result = await getNutritionDiaryAction({ initData: initData || undefined });
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}

async function fetchDay([, date, initData]: DaySWRKey): Promise<NutritionDayPayload> {
  const result = await getNutritionDayAction({ date, initData: initData || undefined });
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}

async function fetchDaysWindows([, serialized, initData]: DaysSWRKey): Promise<NutritionDaysPayload> {
  const windows = serialized.split("|").map((part) => {
    const [from, to] = part.split(":");
    return { from: from ?? "", to: to ?? "" };
  });
  const results = await Promise.all(
    windows.map((window) =>
      getNutritionDaysAction({
        from: window.from,
        initData: initData || undefined,
        to: window.to,
      }),
    ),
  );
  const days: NutritionDayBucket[] = [];
  let meta: NutritionDaysPayload | null = null;
  for (const result of results) {
    if (!result.ok) {
      throw new Error(result.error);
    }
    days.push(...result.data.days);
    meta = result.data;
  }
  if (!meta) {
    throw new Error("Could not load those days.");
  }
  return { ...meta, days };
}

export function NutritionSummaryApp({
  embed,
  initial,
}: {
  readonly embed: boolean;
  readonly initial?: NutritionDiaryPayload;
}) {
  const [initData, setInitData] = useState<string | null>(embed ? null : "");
  const [userSelectedDate, setUserSelectedDate] = useState<string | null>(null);
  const [visibleRange, setVisibleRange] = useState<{ end: number; start: number } | null>(null);
  const [daysByDate, setDaysByDate] = useState<Record<string, NutritionDayBucket>>(() =>
    bucketsFromDiary(initial),
  );

  useEffect(() => {
    if (!embed) {
      return;
    }
    return bootTelegramWebApp((value) => {
      setInitData(value);
    });
  }, [embed]);

  const readyInit = embed ? initData : "";
  const diaryKey: DiarySWRKey | null = embed && readyInit != null ? ["nutrition-diary", readyInit] : null;
  const { data: diary, error: diaryError, mutate: mutateDiary } = useSWR(diaryKey, fetchDiary, {
    fallbackData: embed ? undefined : initial,
    revalidateOnFocus: true,
    revalidateOnMount: embed,
    revalidateOnReconnect: true,
  });

  const today = diary?.day.today ?? initial?.day.today ?? null;
  const selectedDate =
    today && userSelectedDate && userSelectedDate <= today ? userSelectedDate : today;

  const dayKey: DaySWRKey | null =
    readyInit != null && selectedDate ? ["nutrition-day", selectedDate, readyInit] : null;
  const dayFallback =
    selectedDate && diary?.day.date === selectedDate
      ? diary.day
      : selectedDate && initial?.day.date === selectedDate
        ? initial.day
        : undefined;
  const {
    data: day,
    error: dayError,
    isValidating: dayValidating,
    mutate: mutateDay,
  } = useSWR(dayKey, fetchDay, {
    fallbackData: dayFallback,
    focusThrottleInterval: 0,
    keepPreviousData: true,
    revalidateOnFocus: true,
    revalidateOnMount: true,
    revalidateOnReconnect: true,
  });

  const windows = today && visibleRange ? dayIndexWindows(today, visibleRange.start, visibleRange.end) : [];
  const missingWindows = windows.filter((window) => !windowIsCached(window, daysByDate));
  const daysKey: DaysSWRKey | null =
    readyInit != null && missingWindows.length > 0
      ? ["nutrition-days", missingWindows.map((window) => `${window.from}:${window.to}`).join("|"), readyInit]
      : null;
  const { data: daysPayload, error: daysError, mutate: mutateDays } = useSWR(daysKey, fetchDaysWindows, {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
  });

  useEffect(() => {
    if (!diary && !daysPayload && !day) {
      return;
    }
    setDaysByDate((prev) => {
      const next = { ...prev };
      if (diary) {
        mergeBuckets(next, diary.days.days);
        next[diary.day.date] = bucketFromDay(diary.day);
      }
      if (daysPayload) {
        mergeBuckets(next, daysPayload.days);
      }
      if (day) {
        next[day.date] = bucketFromDay(day);
      }
      return next;
    });
  }, [day, daysPayload, diary]);

  useEffect(() => {
    if (!embed || !initData) {
      return;
    }
    const webapp = telegramWebApp();
    if (!webapp?.onEvent) {
      return;
    }
    const revalidate = () => {
      void mutateDiary();
      void mutateDays();
      void mutateDay();
    };
    webapp.onEvent("activated", revalidate);
    return () => {
      webapp.offEvent?.("activated", revalidate);
    };
  }, [embed, initData, mutateDay, mutateDays, mutateDiary]);

  const onVisibleRange = useCallback((start: number, end: number) => {
    setVisibleRange((prev) =>
      prev && prev.start === start && prev.end === end ? prev : { end, start },
    );
  }, []);

  const goals = day?.goals ?? diary?.day.goals ?? initial?.day.goals ?? null;
  const groups = useMemo(() => groupMealsByLabel(day?.meals ?? []), [day?.meals]);
  const bootError = embed && initData === "" ? "Open this from the Telegram bot." : null;
  const loadError = firstError(diaryError, dayError, daysError);
  const errorMessage =
    bootError ??
    (loadError instanceof Error
      ? loadError.message
      : loadError
        ? "Could not load that summary."
        : null);
  const isPending = Boolean(day && selectedDate && day.date !== selectedDate && dayValidating);
  const timezoneIsFallback =
    day?.timezoneIsFallback ?? diary?.day.timezoneIsFallback ?? initial?.day.timezoneIsFallback ?? false;

  return (
    <div
      className={
        embed
          ? "mx-auto flex w-full max-w-lg flex-col gap-3 overflow-y-auto px-3 py-3"
          : "mx-auto flex w-full max-w-lg flex-col gap-5 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8"
      }
    >
      {embed ? null : (
        <div className="flex flex-col gap-1">
          <h1 className="text-foreground text-xl font-semibold">Summary</h1>
          <p className="text-muted text-sm">Calories and macros for the meals you have logged.</p>
        </div>
      )}
      <DayRingStrip
        daysByDate={daysByDate}
        goals={goals}
        selectedDate={selectedDate}
        today={today}
        onSelectDate={setUserSelectedDate}
        onVisibleRange={onVisibleRange}
      />
      {timezoneIsFallback ? (
        <p className="text-muted text-sm">Times use UTC until you save a time zone in Settings.</p>
      ) : null}
      {errorMessage ? <p className="text-danger text-sm">{errorMessage}</p> : null}
      {day ? (
        <SelectedDayView compact={embed} day={day} goals={goals} groups={groups} isPending={isPending} />
      ) : null}
      {!day && !errorMessage && ((embed && initData === null) || !today) ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : null}
    </div>
  );
}

function SelectedDayView({
  compact,
  day,
  goals,
  groups,
  isPending,
}: {
  readonly compact: boolean;
  readonly day: NutritionDayPayload;
  readonly goals: GoalsView | null;
  readonly groups: ReturnType<typeof groupMealsByLabel>;
  readonly isPending: boolean;
}) {
  const empty = day.mealCount === 0;
  return (
    <div className={cn("flex flex-col", compact ? "gap-3" : "gap-4", isPending && "opacity-60")}>
      <DayTotalsRow totals={day.totals} />
      {goals && !hasAnyGoal(goals) ? <SetCalorieGoalHint compact={compact} /> : null}
      {empty ? (
        <EmptyState className="bg-surface-secondary rounded-2xl" size="sm">
          <EmptyState.Header>
            <EmptyState.Media variant="icon">
              <CircleDashed className="size-5" />
            </EmptyState.Media>
            <EmptyState.Title>No meals logged</EmptyState.Title>
            <EmptyState.Description>Log a meal in chat to see totals here.</EmptyState.Description>
          </EmptyState.Header>
        </EmptyState>
      ) : (
        <MealGroupsAccordion groups={groups} />
      )}
    </div>
  );
}

function SetCalorieGoalHint({ compact }: { readonly compact: boolean }) {
  if (compact) {
    return <p className="text-muted px-1 text-sm">Set daily goals in chat to track them here.</p>;
  }
  return (
    <p className="text-muted px-1 text-sm">
      <Link href="/settings">Set daily goals</Link>
      {" to fill rings as you eat."}
    </p>
  );
}

function bucketsFromDiary(diary: NutritionDiaryPayload | undefined): Record<string, NutritionDayBucket> {
  const map: Record<string, NutritionDayBucket> = {};
  if (!diary) {
    return map;
  }
  mergeBuckets(map, diary.days.days);
  map[diary.day.date] = bucketFromDay(diary.day);
  return map;
}

function bucketFromDay(day: NutritionDayPayload): NutritionDayBucket {
  return {
    date: day.date,
    incomplete: day.incomplete,
    itemCount: day.itemCount,
    mealCount: day.mealCount,
    totals: day.totals,
  };
}

function mergeBuckets(map: Record<string, NutritionDayBucket>, days: readonly NutritionDayBucket[]): void {
  for (const day of days) {
    map[day.date] = day;
  }
}

function windowIsCached(
  window: { from: string; to: string },
  map: Readonly<Record<string, NutritionDayBucket>>,
): boolean {
  let date = window.from;
  while (date <= window.to) {
    if (!map[date]) {
      return false;
    }
    date = shiftYmd(date, 1);
  }
  return true;
}

function firstError(...errors: unknown[]): unknown {
  return errors.find((error) => error != null);
}

function bootTelegramWebApp(onReady: (initData: string) => void): () => void {
  const existing = telegramWebApp();
  if (existing) {
    existing.ready();
    existing.expand();
    onReady(existing.initData);
    return () => {};
  }
  const script = document.createElement("script");
  script.src = "https://telegram.org/js/telegram-web-app.js";
  script.async = true;
  script.onload = () => {
    const bridge = telegramWebApp();
    bridge?.ready();
    bridge?.expand();
    onReady(bridge?.initData ?? "");
  };
  script.onerror = () => {
    onReady("");
  };
  document.head.appendChild(script);
  return () => {
    script.remove();
  };
}

function telegramWebApp(): TelegramWebApp | undefined {
  const telegram = (window as Window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram;
  return telegram?.WebApp;
}
