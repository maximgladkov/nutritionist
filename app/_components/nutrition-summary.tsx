"use client";

import { CircleDashed } from "@gravity-ui/icons";
import {
  Card,
  DateField,
  DateRangePicker,
  Label,
  RangeCalendar,
  Spinner,
} from "@heroui/react";
import { ChartTooltip, EmptyState, NumberValue, Segment, Widget } from "@heroui-pro/react";
import { BarChart } from "@heroui-pro/react/bar-chart";
import { KPI } from "@heroui-pro/react/kpi";
import type { DateValue } from "@internationalized/date";
import { parseDate, today } from "@internationalized/date";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { getNutritionSummaryAction } from "@/app/actions/summary";
import type { MealView } from "@/lib/meals";
import type { NutrientKey } from "@/lib/nutrition";
import type { NutritionSummaryPayload, SummaryPeriod } from "@/lib/summary";
import { isSummaryPeriod } from "@/lib/summary-range";

const PERIODS: { id: SummaryPeriod; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "days30", label: "Last 30 days" },
  { id: "custom", label: "Custom" },
];

const MEAL_LABELS: Record<MealView["label"], string> = {
  breakfast: "Breakfast",
  dinner: "Dinner",
  lunch: "Lunch",
  other: "Other",
  snack: "Snack",
};

const NUTRIENT_LABELS: Record<NutrientKey, string> = {
  carbohydrates: "carbs",
  energyKcal: "calories",
  fat: "fat",
  fiber: "fiber",
  proteins: "protein",
  salt: "salt",
  saturatedFat: "saturated fat",
  sugars: "sugars",
};

type DateRange = {
  end: DateValue;
  start: DateValue;
};

type TelegramWebApp = {
  expand: () => void;
  initData: string;
  ready: () => void;
};

export function NutritionSummaryApp({
  embed,
  initial,
}: {
  readonly embed: boolean;
  readonly initial?: NutritionSummaryPayload;
}) {
  const [period, setPeriod] = useState<SummaryPeriod>(initial?.period ?? "today");
  const [customRange, setCustomRange] = useState<DateRange | null>(() => defaultCustomRange(initial));
  const [data, setData] = useState<NutritionSummaryPayload | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);
  const [initData, setInitData] = useState<string | null>(embed ? null : "");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!embed) {
      return;
    }
    return bootTelegramWebApp((value) => {
      setInitData(value);
      if (!value) {
        setError("Open this from the Telegram bot.");
      }
    });
  }, [embed]);

  const load = useCallback(
    (nextPeriod: SummaryPeriod, nextCustom: DateRange | null) => {
      if (embed && !initData) {
        return;
      }
      startTransition(async () => {
        const result = await getNutritionSummaryAction({
          customFrom: nextPeriod === "custom" ? nextCustom?.start.toString() : undefined,
          customTo: nextPeriod === "custom" ? nextCustom?.end.toString() : undefined,
          initData: embed ? (initData ?? undefined) : undefined,
          period: nextPeriod,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setError(null);
        setData(result.data);
      });
    },
    [embed, initData],
  );

  useEffect(() => {
    if (!embed) {
      return;
    }
    if (!initData) {
      return;
    }
    load(period, customRange);
  }, [customRange, embed, initData, load, period]);

  const timezone = data?.timezone ?? "UTC";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8">
      {embed ? null : (
        <div className="flex flex-col gap-1">
          <h1 className="text-foreground text-xl font-semibold">Summary</h1>
          <p className="text-muted text-sm">Calories and macros for the meals you have logged.</p>
        </div>
      )}
      <Segment
        className="w-full min-w-0 overflow-x-auto"
        selectedKey={period}
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
          if (!embed) {
            load(next, nextCustom);
          }
        }}
      >
        {PERIODS.map((item) => (
          <Segment.Item key={item.id} id={item.id}>
            {item.label}
          </Segment.Item>
        ))}
      </Segment>
      {period === "custom" ? (
        <DateRangePicker
          className="max-w-sm"
          maxValue={today(timezone)}
          value={customRange}
          onChange={(value) => {
            setCustomRange(value);
            if (value && !embed) {
              load("custom", value);
            }
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
      ) : null}
      {data?.timezoneIsFallback ? (
        <p className="text-muted text-sm">Times use UTC until you save a time zone in Settings.</p>
      ) : null}
      {error ? <p className="text-danger text-sm">{error}</p> : null}
      {data && !error ? <NutritionSummaryView data={data} isPending={isPending} /> : null}
      {!data && !error && (isPending || (embed && initData === null)) ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : null}
    </div>
  );
}

function NutritionSummaryView({
  data,
  isPending,
}: {
  readonly data: NutritionSummaryPayload;
  readonly isPending: boolean;
}) {
  const { summary, meals, timezone } = data;
  const chartData = useMemo(
    () =>
      (summary.days ?? []).map((day) => ({
        date: day.date.slice(5),
        kcal: day.totals.energyKcal ?? 0,
      })),
    [summary.days],
  );
  const showChart = (summary.days?.length ?? 0) > 1;
  const empty = summary.mealCount === 0;

  return (
    <div className={isPending ? "flex flex-col gap-6 opacity-60" : "flex flex-col gap-6"}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <SummaryKpi suffix="kcal" title="Calories" value={summary.totals.energyKcal} />
        <SummaryKpi suffix="g" title="Protein" value={summary.totals.proteins} />
        <SummaryKpi suffix="g" title="Carbs" value={summary.totals.carbohydrates} />
        <SummaryKpi suffix="g" title="Fat" value={summary.totals.fat} />
        <SummaryKpi title="Meals" value={summary.mealCount} />
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
            <BarChart data={chartData} height={220}>
              <BarChart.Grid vertical={false} />
              <BarChart.XAxis dataKey="date" tickMargin={8} />
              <BarChart.YAxis width={40} />
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
                          <ChartTooltip.Value>{entry.value} kcal</ChartTooltip.Value>
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
        <Card>
          <Card.Header>
            <Card.Title>Meals</Card.Title>
          </Card.Header>
          <Card.Content className="flex flex-col gap-3">
            {meals.map((meal) => (
              <div className="flex items-baseline justify-between gap-3 text-sm" key={meal.id}>
                <div className="min-w-0">
                  <p className="text-foreground font-medium">{MEAL_LABELS[meal.label]}</p>
                  <p className="text-muted truncate">
                    {formatMealTime(meal.eatenAt, timezone)}
                    {meal.items.length > 0 ? ` · ${meal.items.map((item) => item.name).join(", ")}` : ""}
                  </p>
                </div>
                <p className="text-foreground shrink-0 tabular-nums">
                  {meal.totals.energyKcal === null ? "—" : `${Math.round(meal.totals.energyKcal)} kcal`}
                </p>
              </div>
            ))}
          </Card.Content>
        </Card>
      ) : null}
      {summary.incomplete.length > 0 && !empty ? (
        <p className="text-muted text-xs">
          Some items are missing {summary.incomplete.map((key) => NUTRIENT_LABELS[key]).join(", ")}.
        </p>
      ) : null}
    </div>
  );
}

function SummaryKpi({
  suffix,
  title,
  value,
}: {
  readonly suffix?: string;
  readonly title: string;
  readonly value: number | null;
}) {
  return (
    <KPI>
      <KPI.Header>
        <KPI.Title>{title}</KPI.Title>
      </KPI.Header>
      <KPI.Content>
        {value === null ? (
          <span className="text-2xl font-semibold">—</span>
        ) : (
          <KPI.Value maximumFractionDigits={title === "Meals" ? 0 : 1} value={value}>
            {suffix ? <NumberValue.Suffix>{suffix}</NumberValue.Suffix> : null}
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
