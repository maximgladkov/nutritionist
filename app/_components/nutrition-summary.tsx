"use client";

import { getNutritionSummaryAction } from "@/app/actions/summary";
import { goalRingsForToday, type GoalRing } from "@/lib/goal-values";
import type { MealView } from "@/lib/meals";
import type { NutritionSummaryPayload, SummaryPeriod } from "@/lib/summary";
import { isSummaryPeriod } from "@/lib/summary-range";
import { cn } from "@/lib/utils";
import { CircleDashed, Cup, Moon, Sun } from "@gravity-ui/icons";
import { ChartTooltip, EmptyState, Segment, Timeline, Widget } from "@heroui-pro/react";
import { BarChart } from "@heroui-pro/react/bar-chart";
import { KPI } from "@heroui-pro/react/kpi";
import { RadialChart } from "@heroui-pro/react/radial-chart";
import {
  DateField,
  DateRangePicker,
  Label,
  Link,
  RangeCalendar,
  Spinner,
} from "@heroui/react";
import type { DateValue } from "@internationalized/date";
import { parseDate, today } from "@internationalized/date";
import { useEffect, useMemo, useState } from "react";
import { I18nProvider } from "react-aria-components";
import useSWR from "swr";

const PERIODS: { id: SummaryPeriod; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "Week" },
  { id: "days30", label: "30d" },
  { id: "custom", label: "Custom" },
];

const MEAL_LABELS: Record<MealView["label"], string> = {
  breakfast: "Breakfast",
  dinner: "Dinner",
  lunch: "Lunch",
  other: "Other",
  snack: "Snack",
};

const MEAL_ICONS: Record<MealView["label"], typeof CircleDashed> = {
  breakfast: Cup,
  dinner: Moon,
  lunch: Sun,
  other: CircleDashed,
  snack: CircleDashed,
};

type DateRange = {
  end: DateValue;
  start: DateValue;
};

type SummarySWRKey = readonly [
  "nutrition-summary",
  SummaryPeriod,
  string | undefined,
  string | undefined,
  string,
];

type TelegramWebApp = {
  expand: () => void;
  initData: string;
  offEvent?: (event: string, callback: () => void) => void;
  onEvent?: (event: string, callback: () => void) => void;
  ready: () => void;
};

async function fetchNutritionSummary([
  ,
  period,
  customFrom,
  customTo,
  initData,
]: SummarySWRKey): Promise<NutritionSummaryPayload> {
  const result = await getNutritionSummaryAction({
    customFrom,
    customTo,
    initData: initData || undefined,
    period,
  });
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}

function summarySWRKey(input: {
  customRange: DateRange | null;
  embed: boolean;
  initData: string | null;
  period: SummaryPeriod;
}): SummarySWRKey | null {
  if (input.embed && !input.initData) {
    return null;
  }
  if (input.period === "custom" && !input.customRange) {
    return null;
  }
  return [
    "nutrition-summary",
    input.period,
    input.period === "custom" ? input.customRange?.start.toString() : undefined,
    input.period === "custom" ? input.customRange?.end.toString() : undefined,
    input.embed ? (input.initData ?? "") : "",
  ];
}

export function NutritionSummaryApp({
  embed,
  initial,
}: {
  readonly embed: boolean;
  readonly initial?: NutritionSummaryPayload;
}) {
  const [period, setPeriod] = useState<SummaryPeriod>(initial?.period ?? "today");
  const [customRange, setCustomRange] = useState<DateRange | null>(() => defaultCustomRange(initial));
  const [initData, setInitData] = useState<string | null>(embed ? null : "");

  useEffect(() => {
    if (!embed) {
      return;
    }
    return bootTelegramWebApp((value) => {
      setInitData(value);
    });
  }, [embed]);

  const key = summarySWRKey({ customRange, embed, initData, period });
  const fallbackData =
    initial &&
      key &&
      key[1] === initial.period &&
      key[2] === (initial.customFrom ?? undefined) &&
      key[3] === (initial.customTo ?? undefined)
      ? initial
      : undefined;
  const { data, error, isLoading, isValidating, mutate } = useSWR(key, fetchNutritionSummary, {
    fallbackData,
    focusThrottleInterval: 0,
    keepPreviousData: true,
    revalidateOnFocus: true,
    revalidateOnMount: true,
    revalidateOnReconnect: true,
  });

  useEffect(() => {
    if (!embed || !initData) {
      return;
    }
    const webapp = telegramWebApp();
    if (!webapp?.onEvent) {
      return;
    }
    const revalidate = () => {
      void mutate();
    };
    webapp.onEvent("activated", revalidate);
    return () => {
      webapp.offEvent?.("activated", revalidate);
    };
  }, [embed, initData, mutate]);

  const timezone = data?.timezone ?? "UTC";
  const bootError = embed && initData === "" ? "Open this from the Telegram bot." : null;
  const errorMessage =
    bootError ??
    (error instanceof Error ? error.message : error ? "Could not load that summary." : null);
  const isPending =
    data != null &&
    isValidating &&
    (data.period !== period ||
      (period === "custom" &&
        (data.customFrom !== customRange?.start.toString() ||
          data.customTo !== customRange?.end.toString())));

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
      <Segment
        className="w-full min-w-0"
        selectedKey={period}
        size="sm"
        onSelectionChange={(key) => {
          const next = String(key);
          if (!isSummaryPeriod(next) || next === period) {
            return;
          }
          const nextCustom =
            next === "custom" ? (customRange ?? rangeForLastDays(timezone, 7)) : customRange;
          setPeriod(next);
          if (next === "custom" && !customRange) {
            setCustomRange(nextCustom);
          }
        }}
      >
        {PERIODS.map((item) => (
          <Segment.Item key={item.id} className="px-2" id={item.id}>
            {item.label}
          </Segment.Item>
        ))}
      </Segment>
      {period === "custom" ? (
        <I18nProvider locale="en-GB">
          <DateRangePicker
            className="max-w-sm"
            maxValue={today(timezone)}
            value={customRange}
            onChange={(value) => {
              setCustomRange(value);
            }}
          >
            <Label>Date range</Label>
            <DateField.Group fullWidth>
              <DateField.Input slot="start">
                {(segment) => <DateField.Segment segment={segment} />}
              </DateField.Input>
              <DateRangePicker.RangeSeparator />
              <DateField.Input slot="end">
                {(segment) => <DateField.Segment segment={segment} />}
              </DateField.Input>
              <DateField.Suffix>
                <DateRangePicker.Trigger>
                  <DateRangePicker.TriggerIndicator />
                </DateRangePicker.Trigger>
              </DateField.Suffix>
            </DateField.Group>
            <DateRangePicker.Popover>
              <RangeCalendar aria-label="Summary dates">
                <RangeCalendar.Header>
                  <RangeCalendar.YearPickerTrigger>
                    <RangeCalendar.YearPickerTriggerHeading />
                    <RangeCalendar.YearPickerTriggerIndicator />
                  </RangeCalendar.YearPickerTrigger>
                  <RangeCalendar.NavButton slot="previous" />
                  <RangeCalendar.NavButton slot="next" />
                </RangeCalendar.Header>
                <RangeCalendar.Grid>
                  <RangeCalendar.GridHeader>
                    {(day) => <RangeCalendar.HeaderCell>{day}</RangeCalendar.HeaderCell>}
                  </RangeCalendar.GridHeader>
                  <RangeCalendar.GridBody>
                    {(date) => <RangeCalendar.Cell date={date} />}
                  </RangeCalendar.GridBody>
                </RangeCalendar.Grid>
                <RangeCalendar.YearPickerGrid>
                  <RangeCalendar.YearPickerGridBody>
                    {({ year }) => <RangeCalendar.YearPickerCell year={year} />}
                  </RangeCalendar.YearPickerGridBody>
                </RangeCalendar.YearPickerGrid>
              </RangeCalendar>
            </DateRangePicker.Popover>
          </DateRangePicker>
        </I18nProvider>
      ) : null}
      {data?.timezoneIsFallback ? (
        <p className="text-muted text-sm">Times use UTC until you save a time zone in Settings.</p>
      ) : null}
      {errorMessage ? <p className="text-danger text-sm">{errorMessage}</p> : null}
      {data ? <NutritionSummaryView compact={embed} data={data} isPending={isPending} /> : null}
      {!data && !errorMessage && (isLoading || (embed && initData === null)) ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : null}
    </div>
  );
}

function NutritionSummaryView({
  compact,
  data,
  isPending,
}: {
  readonly compact: boolean;
  readonly data: NutritionSummaryPayload;
  readonly isPending: boolean;
}) {
  const { goals, period, summary, meals, timezone } = data;
  const chartData = useMemo(
    () =>
      (summary.days ?? []).map((day) => ({
        date: day.date.slice(5),
        kcal: day.totals.energyKcal ?? 0,
      })),
    [summary.days],
  );
  const rings = useMemo(
    () => (period === "today" ? goalRingsForToday(goals, summary.totals) : []),
    [goals, period, summary.totals],
  );
  const ringIds = useMemo(() => new Set(rings.map((ring) => ring.id)), [rings]);
  const showChart = (summary.days?.length ?? 0) > 1;
  const empty = summary.mealCount === 0;
  const isToday = period === "today";
  const showRing = rings.length > 0;

  return (
    <div className={cn("flex flex-col", compact ? "gap-3" : "gap-4", isPending && "opacity-60")}>
      <div className="grid grid-cols-3 gap-2">
        {showRing ? (
          <div className="col-span-3 flex justify-center py-1">
            <GoalRings compact={compact} rings={rings} />
          </div>
        ) : (
          <div className="col-span-3 flex flex-col gap-1">
            <SummaryKpi
              suffix="kcal"
              title="Calories"
              value={summary.totals.energyKcal}
              valueClassName="text-2xl"
            />
            {isToday ? <SetCalorieGoalHint compact={compact} /> : null}
          </div>
        )}
        {showRing && !ringIds.has("calories") ? (
          <SummaryKpi suffix="kcal" title="Calories" value={summary.totals.energyKcal} />
        ) : null}
        {ringIds.has("protein") ? null : (
          <SummaryKpi suffix="g" title="Protein" value={summary.totals.proteins} />
        )}
        {ringIds.has("carbs") ? null : (
          <SummaryKpi suffix="g" title="Carbs" value={summary.totals.carbohydrates} />
        )}
        {ringIds.has("fat") ? null : <SummaryKpi suffix="g" title="Fat" value={summary.totals.fat} />}
      </div>
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
      ) : null}
      {showChart && !empty ? (
        <Widget>
          <Widget.Header>
            <Widget.Title>Daily calories</Widget.Title>
          </Widget.Header>
          <Widget.Content>
            <BarChart data={chartData} height={compact ? 156 : 200}>
              <BarChart.Grid vertical={false} />
              <BarChart.XAxis dataKey="date" tickMargin={6} />
              <BarChart.YAxis width={36} />
              <BarChart.Bar dataKey="kcal" fill="var(--accent)" name="Calories" radius={[4, 4, 0, 0]} />
              <BarChart.Tooltip
                content={({ active, label, payload }) => {
                  if (!active || !payload?.length) {
                    return null;
                  }
                  return (
                    <ChartTooltip>
                      <ChartTooltip.Header>{label}</ChartTooltip.Header>
                      {payload.map((entry) => (
                        <ChartTooltip.Item key={String(entry.dataKey)}>
                          <ChartTooltip.Indicator color={entry.color ?? entry.fill} />
                          <ChartTooltip.Label>{entry.name ?? "Calories"}</ChartTooltip.Label>
                          <ChartTooltip.Value>
                            {typeof entry.value === "number" ? `${Math.round(entry.value)} kcal` : "—"}
                          </ChartTooltip.Value>
                        </ChartTooltip.Item>
                      ))}
                    </ChartTooltip>
                  );
                }}
              />
            </BarChart>
          </Widget.Content>
        </Widget>
      ) : null}
      {meals && meals.length > 0 ? (
        <Timeline density="compact" size="sm" className="mt-2">
          {meals.map((meal) => {
            const Icon = MEAL_ICONS[meal.label];
            const hasItems = meal.items.length > 0;
            return (
              <Timeline.Item align={hasItems ? "start" : "center"} key={meal.id}>
                <Timeline.Marker aria-hidden="true">
                  <Icon />
                </Timeline.Marker>
                <Timeline.Content className="gap-1">
                  <div className="flex min-w-0 items-baseline justify-between gap-3">
                    <h3 className="text-foreground m-0 min-w-0 truncate text-sm font-medium leading-tight">
                      {MEAL_LABELS[meal.label]}
                      <time className="text-muted font-normal">
                        {" · "}
                        {formatMealTime(meal.eatenAt, timezone)}
                      </time>
                    </h3>
                    <KcalText className="text-foreground m-0 shrink-0 text-sm" value={meal.totals.energyKcal} />
                  </div>
                  {hasItems ? (
                    <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                      {meal.items.map((item) => (
                        <li
                          className="text-muted flex min-w-0 items-baseline justify-between gap-3 text-xs leading-snug"
                          key={item.id}
                        >
                          <span className="truncate">{item.name}</span>
                          <KcalText className="shrink-0" value={item.metrics.energyKcal} />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </Timeline.Content>
              </Timeline.Item>
            );
          })}
        </Timeline>
      ) : null}
    </div>
  );
}

function GoalRings({
  compact,
  rings,
}: {
  readonly compact: boolean;
  readonly rings: readonly GoalRing[];
}) {
  const calorie = rings.find((ring) => ring.id === "calories");
  const size = compact ? 160 : 200;
  const count = rings.length;
  const innerRadius = `${Math.max(40, 100 - count * 14)}%`;
  const barSize = count <= 2 ? 12 : count <= 4 ? 10 : 8;
  const data = useMemo(
    () => rings.map((ring) => ({ fill: ring.fill, name: ring.name, value: ring.value })),
    [rings],
  );
  const legend = useMemo(() => [...rings].reverse(), [rings]);
  const label = rings
    .map((ring) => `${ring.name}: ${ring.consumed} of ${ring.goal} ${ring.unit}, ${goalRemainder(ring.consumed, ring.goal, ring.unit)}`)
    .join(". ");

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div aria-label={label} className="relative" role="img">
        <RadialChart
          barSize={barSize}
          data={data}
          height={size}
          innerRadius={innerRadius}
          outerRadius="100%"
          width={size}
        >
          <RadialChart.AngleAxis angleAxisId={0} domain={[0, 100]} tick={false} type="number" />
          <RadialChart.Bar background angleAxisId={0} cornerRadius={12} dataKey="value" />
        </RadialChart>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {calorie ? (
            <>
              <span className="text-muted text-xs">Calories</span>
              <span className="text-foreground text-xl font-semibold tabular-nums">
                {calorie.consumed} kcal
              </span>
              <span className="text-muted text-xs">
                {goalRemainder(calorie.consumed, calorie.goal, calorie.unit)}
              </span>
            </>
          ) : (
            <span className="text-muted text-xs">Goals</span>
          )}
        </div>
      </div>
      <ul className={cn("m-0 flex w-full list-none flex-col p-0", compact ? "max-w-xs gap-1" : "max-w-sm gap-1.5")}>
        {legend.map((ring) => (
          <li className="flex items-center gap-2 text-sm" key={ring.id}>
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: ring.fill }}
            />
            <span className="text-foreground min-w-0 flex-1">{ring.name}</span>
            <span className="text-foreground shrink-0 tabular-nums">
              {ring.consumed} / {ring.goal} {ring.unit}
            </span>
            <span className="text-muted w-[5.75rem] shrink-0 text-right text-xs tabular-nums">
              {goalRemainder(ring.consumed, ring.goal, ring.unit)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function goalRemainder(consumed: number, goal: number, unit: string): string {
  const over = Math.max(0, consumed - goal);
  const left = Math.max(0, goal - consumed);
  if (over > 0) {
    return `${over} ${unit} over`;
  }
  if (left > 0) {
    return `${left} ${unit} left`;
  }
  return "Goal reached";
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

function SummaryKpi({
  className,
  suffix,
  title,
  value,
  valueClassName,
}: {
  readonly className?: string;
  readonly suffix?: string;
  readonly title: string;
  readonly value: number | null;
  readonly valueClassName?: string;
}) {
  return (
    <KPI className={cn("gap-1 p-3", className)}>
      <KPI.Header>
        <KPI.Title className="text-xs">{title}</KPI.Title>
      </KPI.Header>
      <KPI.Content>
        {value === null ? (
          <span className={valueClassName ?? "text-lg font-semibold"}>—</span>
        ) : (
          <KPI.Value className={valueClassName ?? "text-lg"} maximumFractionDigits={0} value={value}>
            {(formatted) => (
              <>
                {formatted}
                {suffix ? <span className="text-muted ml-1 text-sm font-normal">{suffix}</span> : null}
              </>
            )}
          </KPI.Value>
        )}
      </KPI.Content>
    </KPI>
  );
}

function defaultCustomRange(initial: NutritionSummaryPayload | undefined): DateRange | null {
  if (initial?.period === "custom" && initial.customFrom && initial.customTo) {
    return { end: parseDate(initial.customTo), start: parseDate(initial.customFrom) };
  }
  return null;
}

function rangeForLastDays(timeZone: string, days: number): DateRange {
  const end = today(timeZone);
  return { end, start: end.subtract({ days: days - 1 }) };
}

function formatMealTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

function KcalText({
  className,
  value,
}: {
  readonly className?: string;
  readonly value: number | null;
}) {
  if (value === null) {
    return <span className={className}>—</span>;
  }
  return (
    <span className={cn("tabular-nums", className)}>
      {Math.round(value)}
      <span className="text-muted font-normal"> kcal</span>
    </span>
  );
}

function bootTelegramWebApp(onReady: (initData: string) => void): () => void {
  const existing = telegramWebApp();
  if (existing) {
    existing.ready();
    existing.expand();
    onReady(existing.initData);
    return () => { };
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
