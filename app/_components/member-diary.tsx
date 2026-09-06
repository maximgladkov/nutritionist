"use client";

import { DayGoalProgress } from "@/app/_components/day-goal-progress";
import { DayRingStrip } from "@/app/_components/day-ring-strip";
import { DayTotalsRow } from "@/app/_components/day-totals-row";
import { MealGroupsAccordion } from "@/app/_components/meal-groups-accordion";
import {
  getMemberNutritionDayAction,
  getMemberNutritionDaysAction,
  getMemberNutritionDiaryAction,
} from "@/app/actions/groups";
import { goalRingsForToday, hasAnyGoal } from "@/lib/goal-values";
import { groupMealsByLabel } from "@/lib/meal-groups";
import { resolveMealStreak } from "@/lib/meal-streak";
import { dayIndexWindows, ymdToDayIndex } from "@/lib/summary-days";
import type {
  NutritionDayBucket,
  NutritionDayPayload,
  NutritionDaysPayload,
  NutritionDiaryPayload,
} from "@/lib/summary";
import { shiftYmd } from "@/lib/timezone";
import { Spinner } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";

type DiarySWRKey = readonly ["member-diary", string, string, string];
type DaySWRKey = readonly ["member-day", string, string, string, string];
type DaysSWRKey = readonly ["member-days", string, string, string, string];

async function fetchDiary([, groupId, memberId, initData]: DiarySWRKey): Promise<NutritionDiaryPayload> {
  const result = await getMemberNutritionDiaryAction({
    groupId,
    initData: initData || undefined,
    memberId,
  });
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}

async function fetchDay([, groupId, memberId, date, initData]: DaySWRKey): Promise<NutritionDayPayload> {
  const result = await getMemberNutritionDayAction({
    date,
    groupId,
    initData: initData || undefined,
    memberId,
  });
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}

async function fetchDays([, groupId, memberId, serialized, initData]: DaysSWRKey): Promise<NutritionDaysPayload> {
  const windows = serialized.split("|").map((part) => {
    const [from, to] = part.split(":");
    return { from: from ?? "", to: to ?? "" };
  });
  const results = await Promise.all(
    windows.map((window) =>
      getMemberNutritionDaysAction({
        from: window.from,
        groupId,
        initData: initData || undefined,
        memberId,
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

export function MemberDiary({
  groupId,
  initData,
  memberId,
}: {
  readonly groupId: string;
  readonly initData?: string;
  readonly memberId: string;
}) {
  const { t } = useLingui();
  const readyInit = initData ?? "";
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState<{ from: string; to: string } | null>(null);
  const [userSelectedDate, setUserSelectedDate] = useState<string | null>(null);
  const [visibleRange, setVisibleRange] = useState<{ end: number; start: number } | null>(null);
  const [daysByDate, setDaysByDate] = useState<Record<string, NutritionDayBucket>>({});

  const diaryKey: DiarySWRKey = ["member-diary", groupId, memberId, readyInit];
  const { data: diary, error: diaryError } = useSWR(diaryKey, fetchDiary, {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
  });

  const today = diary?.day.today ?? null;
  const selectedDate =
    today && userSelectedDate && userSelectedDate <= today ? userSelectedDate : today;
  const dayKey: DaySWRKey | null = selectedDate
    ? ["member-day", groupId, memberId, selectedDate, readyInit]
    : null;
  const { data: day, error: dayError, isValidating } = useSWR(dayKey, fetchDay, {
    fallbackData: selectedDate && diary?.day.date === selectedDate ? diary.day : undefined,
    keepPreviousData: true,
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
  });

  const stripWindows = today && visibleRange ? dayIndexWindows(today, visibleRange.start, visibleRange.end) : [];
  const monthWindows =
    today && calendarMonth
      ? dayIndexWindows(today, ymdToDayIndex(today, calendarMonth.from), ymdToDayIndex(today, calendarMonth.to))
      : [];
  const windows = [...stripWindows, ...monthWindows].filter((window, index, all) => {
    const key = `${window.from}:${window.to}`;
    return all.findIndex((item) => `${item.from}:${item.to}` === key) === index;
  });
  const missing = windows.filter((window) => {
    let date = window.from;
    while (date <= window.to) {
      if (!daysByDate[date]) {
        return true;
      }
      date = shiftYmd(date, 1);
    }
    return false;
  });
  const daysKey: DaysSWRKey | null =
    missing.length > 0
      ? ["member-days", groupId, memberId, missing.map((window) => `${window.from}:${window.to}`).join("|"), readyInit]
      : null;
  const { data: daysPayload, error: daysError } = useSWR(daysKey, fetchDays, {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
  });

  useEffect(() => {
    setDaysByDate((prev) => {
      const next = { ...prev };
      if (diary) {
        for (const bucket of diary.days.days) {
          next[bucket.date] = bucket;
        }
        next[diary.day.date] = {
          date: diary.day.date,
          incomplete: diary.day.incomplete,
          itemCount: diary.day.itemCount,
          mealCount: diary.day.mealCount,
          totals: diary.day.totals,
        };
      }
      if (daysPayload) {
        for (const bucket of daysPayload.days) {
          next[bucket.date] = bucket;
        }
      }
      if (day) {
        next[day.date] = {
          date: day.date,
          incomplete: day.incomplete,
          itemCount: day.itemCount,
          mealCount: day.mealCount,
          totals: day.totals,
        };
      }
      return next;
    });
  }, [day, daysPayload, diary]);

  const onVisibleRange = useCallback((start: number, end: number) => {
    setVisibleRange((prev) => (prev && prev.start === start && prev.end === end ? prev : { end, start }));
  }, []);

  const groups = useMemo(() => groupMealsByLabel(day?.meals ?? []), [day?.meals]);
  const goals = day?.goals ?? diary?.day.goals ?? null;
  const rings = goals && day && hasAnyGoal(goals) ? goalRingsForToday(goals, day.totals) : [];
  const error = diaryError ?? dayError ?? daysError;
  const errorMessage = error instanceof Error ? error.message : error ? t`Could not load that summary.` : null;
  const streakDays = today
    ? resolveMealStreak({
        buckets: daysByDate,
        serverStreak: diary?.mealStreak,
        serverTodayMealCount: diary?.day.mealCount,
        today,
      })
    : null;

  if (errorMessage && !diary) {
    return <p className="text-danger text-sm">{errorMessage}</p>;
  }
  if (!today) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <DayRingStrip
        calendarOpen={calendarOpen}
        daysByDate={daysByDate}
        selectedDate={selectedDate}
        streakDays={streakDays}
        today={today}
        onCalendarMonthChange={setCalendarMonth}
        onCalendarOpenChange={setCalendarOpen}
        onSelectDate={setUserSelectedDate}
        onVisibleRange={onVisibleRange}
      />
      {calendarOpen ? null : errorMessage ? <p className="text-danger text-sm">{errorMessage}</p> : null}
      {calendarOpen ? null : day ? (
        <div className={`flex flex-col gap-3 ${isValidating && day.date !== selectedDate ? "opacity-60" : ""}`}>
          {rings.length > 0 ? <DayGoalProgress rings={rings} /> : <DayTotalsRow totals={day.totals} />}
          <MealGroupsAccordion groups={groups} />
        </div>
      ) : (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      )}
    </div>
  );
}
