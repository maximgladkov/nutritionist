"use client";

import { DayGoalProgress } from "@/app/_components/day-goal-progress";
import { DayRingStrip } from "@/app/_components/day-ring-strip";
import { DayTotalsRow } from "@/app/_components/day-totals-row";
import { useDesktopWorkspace } from "@/app/_components/desktop-workspace-context";
import { MealGroupsAccordion } from "@/app/_components/meal-groups-accordion";
import { useMiniAppFoodActive } from "@/app/_components/mini-app-shell";
import { bootTelegramWebApp, telegramWebApp } from "@/app/_components/telegram-webapp-client";
import {
  getNutritionDayAction,
  getNutritionDaysAction,
  getNutritionDiaryAction,
} from "@/app/actions/summary";
import { goalRingsForToday, hasAnyGoal, type GoalsView } from "@/lib/goal-values";
import { groupMealsByLabel } from "@/lib/meal-groups";
import { dayIndexWindows, ymdToDayIndex } from "@/lib/summary-days";
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
import { Trans, useLingui } from "@lingui/react/macro";
import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";

type DiarySWRKey = readonly ["nutrition-diary", string];
type DaySWRKey = readonly ["nutrition-day", string, string];
type DaysSWRKey = readonly ["nutrition-days", string, string];

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
  compact = false,
  embed,
  initial,
}: {
  readonly compact?: boolean;
  readonly embed: boolean;
  readonly initial?: NutritionDiaryPayload;
}) {
  const { t } = useLingui();
  const [initData, setInitData] = useState<string | null>(embed ? null : "");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState<{ from: string; to: string } | null>(null);
  const [userSelectedDate, setUserSelectedDate] = useState<string | null>(null);
  const [visibleRange, setVisibleRange] = useState<{ end: number; start: number } | null>(null);
  const [daysByDate, setDaysByDate] = useState<Record<string, NutritionDayBucket>>(() =>
    bucketsFromDiary(initial),
  );
  const foodActive = useMiniAppFoodActive();

  useEffect(() => {
    if (!embed) {
      return;
    }
    return bootTelegramWebApp((value) => {
      setInitData(value);
    });
  }, [embed]);

  const readyInit = embed ? initData : "";
  const diaryKey: DiarySWRKey | null =
    readyInit != null && (embed || initial == null) ? ["nutrition-diary", readyInit] : null;
  const tight = embed || compact;
  const { data: diary, error: diaryError, mutate: mutateDiary } = useSWR(diaryKey, fetchDiary, {
    fallbackData: embed ? undefined : initial,
    revalidateOnFocus: true,
    revalidateOnMount: embed || initial == null,
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

  const stripWindows = today && visibleRange ? dayIndexWindows(today, visibleRange.start, visibleRange.end) : [];
  const monthWindows =
    today && calendarMonth
      ? dayIndexWindows(today, ymdToDayIndex(today, calendarMonth.from), ymdToDayIndex(today, calendarMonth.to))
      : [];
  const windows = mergeWindows(stripWindows, monthWindows);
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
  const bootError = embed && initData === "" ? t`Open this from the Telegram bot.` : null;
  const loadError = firstError(diaryError, dayError, daysError);
  const errorMessage =
    bootError ??
    (loadError instanceof Error
      ? loadError.message
      : loadError
        ? t`Could not load that summary.`
        : null);
  const isPending = Boolean(day && selectedDate && day.date !== selectedDate && dayValidating);
  const timezoneIsFallback =
    day?.timezoneIsFallback ?? diary?.day.timezoneIsFallback ?? initial?.day.timezoneIsFallback ?? false;

  return (
    <div
      className={
        embed
          ? "mx-auto flex w-full max-w-lg flex-col gap-3 px-3 py-3"
          : compact
            ? "flex h-full min-h-0 w-full flex-col gap-3 overflow-y-auto px-3 py-3"
            : "mx-auto flex w-full max-w-lg flex-col gap-5 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8"
      }
    >
      {embed || compact ? null : (
        <div className="flex flex-col gap-1">
          <h1 className="text-foreground text-xl font-semibold">
            <Trans>Summary</Trans>
          </h1>
          <p className="text-muted text-sm">
            <Trans>Calories and macros for the meals you have logged.</Trans>
          </p>
        </div>
      )}
      <DayRingStrip
        active={foodActive}
        calendarOpen={calendarOpen}
        daysByDate={daysByDate}
        selectedDate={selectedDate}
        today={today}
        onCalendarMonthChange={setCalendarMonth}
        onCalendarOpenChange={setCalendarOpen}
        onSelectDate={setUserSelectedDate}
        onVisibleRange={onVisibleRange}
      />
      {calendarOpen ? null : timezoneIsFallback ? (
        <p className="text-muted text-sm">
          <Trans>Times use UTC until you save a time zone in Settings.</Trans>
        </p>
      ) : null}
      {calendarOpen ? null : errorMessage ? <p className="text-danger text-sm">{errorMessage}</p> : null}
      {calendarOpen ? null : day ? (
        <SelectedDayView compact={tight} day={day} goals={goals} groups={groups} isPending={isPending} />
      ) : null}
      {!calendarOpen && !day && !errorMessage && ((embed && initData === null) || !today) ? (
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
  const rings = goals && hasAnyGoal(goals) ? goalRingsForToday(goals, day.totals) : [];
  return (
    <div className={cn("flex flex-col", compact ? "gap-3" : "gap-4", isPending && "opacity-60")}>
      {rings.length > 0 ? <DayGoalProgress rings={rings} /> : <DayTotalsRow totals={day.totals} />}
      {goals && !hasAnyGoal(goals) ? <SetCalorieGoalHint compact={compact} /> : null}
      {empty ? (
        <EmptyState className="bg-surface-secondary rounded-2xl" size="sm">
          <EmptyState.Header>
            <EmptyState.Media variant="icon">
              <CircleDashed className="size-5" />
            </EmptyState.Media>
            <EmptyState.Title>
              <Trans>No meals logged</Trans>
            </EmptyState.Title>
            <EmptyState.Description>
              <Trans>Log a meal in chat to see totals here.</Trans>
            </EmptyState.Description>
          </EmptyState.Header>
        </EmptyState>
      ) : (
        <MealGroupsAccordion groups={groups} />
      )}
    </div>
  );
}

function SetCalorieGoalHint({ compact }: { readonly compact: boolean }) {
  const desktop = useDesktopWorkspace();
  if (compact && !desktop) {
    return (
      <p className="text-muted px-1 text-sm">
        <Trans>Set daily goals in chat to track them here.</Trans>
      </p>
    );
  }
  return (
    <p className="text-muted px-1 text-sm">
      <Trans>
        <Link
          href={desktop ? undefined : "/settings"}
          onPress={() => {
            desktop?.focusWidget("settings");
          }}
        >
          Set daily goals
        </Link>{" "}
        to track them as you eat.
      </Trans>
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

function mergeWindows(
  left: readonly { from: string; to: string }[],
  right: readonly { from: string; to: string }[],
): { from: string; to: string }[] {
  const seen = new Set<string>();
  const windows: { from: string; to: string }[] = [];
  for (const window of [...left, ...right]) {
    const key = `${window.from}:${window.to}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    windows.push(window);
  }
  return windows;
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
