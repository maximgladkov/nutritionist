"use client";

import { CompactGoalRing, DAY_RING_SIZE } from "@/app/_components/compact-goal-ring";
import { formatDayRingLabel } from "@/app/_components/nutrition-format";
import { goalRingsForToday, hasAnyGoal, type GoalsView } from "@/lib/goal-values";
import { NUTRITION_DAY_TODAY_INDEX } from "@/lib/summary-days";
import type { NutritionDayBucket } from "@/lib/summary";
import { shiftYmd } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { Calendar as CalendarIcon } from "@gravity-ui/icons";
import { endOfMonth, parseDate, startOfMonth, type CalendarDate } from "@internationalized/date";
import { Calendar, Card, ScrollShadow, Skeleton } from "@heroui/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const CELL_WIDTH = 88;
const CELL_HEIGHT = 124;
const INITIAL_COUNT = 90;
const GROW_BY = 90;
const DOUBLE_TAP_MS = 400;
const CALENDAR_YEARS = 10;

export function DayRingStrip({
  active = true,
  calendarOpen,
  daysByDate,
  goals,
  onCalendarMonthChange,
  onCalendarOpenChange,
  onSelectDate,
  onVisibleRange,
  selectedDate,
  today,
}: {
  readonly active?: boolean;
  readonly calendarOpen: boolean;
  readonly daysByDate: Readonly<Record<string, NutritionDayBucket>>;
  readonly goals: GoalsView | null;
  readonly onCalendarMonthChange: (range: { from: string; to: string } | null) => void;
  readonly onCalendarOpenChange: (open: boolean) => void;
  readonly onSelectDate: (date: string) => void;
  readonly onVisibleRange: (startIndex: number, endIndex: number) => void;
  readonly selectedDate: string | null;
  readonly today: string | null;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const growing = useRef(false);
  const pendingJump = useRef<string | null>(null);
  const lastTap = useRef<{ at: number; date: string } | null>(null);
  const wasActive = useRef(active);
  const [count, setCount] = useState(INITIAL_COUNT);
  const [aligned, setAligned] = useState(false);
  const [edgePad, setEdgePad] = useState(0);
  const [focusedDate, setFocusedDate] = useState<CalendarDate | null>(null);
  const virtualCount = count + 1;
  const virtualizer = useVirtualizer({
    count: virtualCount,
    estimateSize: () => CELL_WIDTH,
    getItemKey: (index) => (index >= count ? "calendar" : count - 1 - index),
    getScrollElement: () => parentRef.current,
    horizontal: true,
    initialOffset: (INITIAL_COUNT - 1) * CELL_WIDTH,
    overscan: 6,
    paddingEnd: edgePad,
    paddingStart: edgePad,
  });
  const items = virtualizer.getVirtualItems();
  const startIndex = items[0]?.index;
  const endIndex = items.at(-1)?.index;

  const scrollToDate = useCallback(
    (date: string, behavior: ScrollBehavior = "auto") => {
      if (!today) {
        return false;
      }
      const index = count - 1 + ymdDelta(today, date);
      if (index < 0 || index >= count) {
        return false;
      }
      const offset = index * CELL_WIDTH;
      const element = parentRef.current;
      if (behavior === "smooth") {
        virtualizer.scrollToOffset(offset, { behavior: "smooth" });
      } else if (element) {
        element.scrollLeft = offset;
      }
      return true;
    },
    [count, today, virtualizer],
  );

  const jumpToDate = useCallback(
    (date: string, behavior: ScrollBehavior = "smooth") => {
      if (!today || date > today) {
        return;
      }
      onCalendarOpenChange(false);
      onSelectDate(date);
      const needed = ymdDelta(date, today) + 1;
      if (needed > count) {
        pendingJump.current = date;
        setCount(Math.max(needed, Math.ceil(needed / GROW_BY) * GROW_BY));
        return;
      }
      scrollToDate(date, behavior);
    },
    [count, onCalendarOpenChange, onSelectDate, scrollToDate, today],
  );

  useLayoutEffect(() => {
    if (!active || wasActive.current || !today) {
      wasActive.current = active;
      return;
    }
    wasActive.current = active;
    const element = parentRef.current;
    const pad = element ? Math.max(0, element.clientWidth / 2 - CELL_WIDTH / 2) : edgePad;
    if (element && pad !== edgePad) {
      pendingJump.current = today;
      setEdgePad(pad);
      onCalendarOpenChange(false);
      onSelectDate(today);
      return;
    }
    jumpToDate(today, "auto");
  }, [active, edgePad, jumpToDate, onCalendarOpenChange, onSelectDate, today]);

  const selectDate = useCallback(
    (date: string) => {
      const now = performance.now();
      const previous = lastTap.current;
      if (previous && previous.date === date && now - previous.at < DOUBLE_TAP_MS) {
        lastTap.current = null;
        if (today) {
          jumpToDate(today);
        }
        return;
      }
      lastTap.current = { at: now, date };
      jumpToDate(date);
    },
    [jumpToDate, today],
  );

  useLayoutEffect(() => {
    const element = parentRef.current;
    if (!element) {
      return;
    }
    const updatePad = () => {
      setEdgePad(Math.max(0, element.clientWidth / 2 - CELL_WIDTH / 2));
    };
    updatePad();
    const observer = new ResizeObserver(updatePad);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  useLayoutEffect(() => {
    const jumped = pendingJump.current;
    if (jumped && today) {
      const index = count - 1 + ymdDelta(today, jumped);
      if (index >= 0 && index < count) {
        const offset = index * CELL_WIDTH;
        const element = parentRef.current;
        if (element) {
          element.scrollLeft = offset;
        }
        setAligned(true);
        return;
      }
    }
    const element = parentRef.current;
    if (aligned || !today || !element || element.clientWidth < CELL_WIDTH) {
      return;
    }
    const target = selectedDate ?? today;
    const index = count - 1 + ymdDelta(today, target);
    if (index < 0 || index >= count) {
      return;
    }
    element.scrollLeft = index * CELL_WIDTH;
    const frame = requestAnimationFrame(() => {
      setAligned(true);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [aligned, count, edgePad, selectedDate, today]);

  useEffect(() => {
    if (pendingJump.current) {
      pendingJump.current = null;
      return;
    }
    if (!aligned || startIndex == null || startIndex > 12 || growing.current) {
      return;
    }
    growing.current = true;
    setCount((current) => current + GROW_BY);
    const offset = virtualizer.scrollOffset ?? 0;
    requestAnimationFrame(() => {
      virtualizer.scrollToOffset(offset + GROW_BY * CELL_WIDTH);
      growing.current = false;
    });
  }, [aligned, startIndex, virtualizer]);

  useEffect(() => {
    if (!aligned || startIndex == null || endIndex == null) {
      return;
    }
    const lastDay = Math.min(endIndex, count - 1);
    onVisibleRange(toGlobalIndex(startIndex, count), toGlobalIndex(lastDay, count));
  }, [aligned, count, endIndex, onVisibleRange, startIndex]);

  useEffect(() => {
    if (!calendarOpen || !today) {
      onCalendarMonthChange(null);
      return;
    }
    const focus = focusedDate ?? parseDate(selectedDate && selectedDate <= today ? selectedDate : today);
    onCalendarMonthChange(monthRange(focus, today));
  }, [calendarOpen, focusedDate, onCalendarMonthChange, selectedDate, today]);

  const calendarMin = today ? shiftYmd(today, -CALENDAR_YEARS * 366) : null;
  const calendarValue = today
    ? parseDate(selectedDate && selectedDate <= today ? selectedDate : today)
    : null;

  return (
    <div className="flex w-full flex-col gap-3">
      <ScrollShadow hideScrollBar className="w-full" orientation="horizontal" ref={parentRef}>
        <div
          className="relative"
          style={{ height: CELL_HEIGHT, width: virtualizer.getTotalSize() }}
        >
          {items.map((item) => {
            const isCalendar = item.index >= count;
            const date = !isCalendar && today ? shiftYmd(today, item.index - (count - 1)) : null;
            const bucket = date ? daysByDate[date] : undefined;
            const selected = !calendarOpen && date != null && date === selectedDate;
            return (
              <div
                className="absolute top-0 flex justify-center"
                key={item.key}
                style={{
                  height: CELL_HEIGHT,
                  left: 0,
                  transform: `translateX(${item.start}px)`,
                  width: item.size,
                }}
              >
                {isCalendar ? (
                  <CalendarDayCell
                    open={calendarOpen}
                    onToggle={() => {
                      if (calendarOpen || !today) {
                        return;
                      }
                      const nextFocus = parseDate(
                        selectedDate && selectedDate <= today ? selectedDate : today,
                      );
                      setFocusedDate(nextFocus);
                      onCalendarOpenChange(true);
                      virtualizer.scrollToOffset(count * CELL_WIDTH, { behavior: "smooth" });
                    }}
                  />
                ) : (
                  <DayRingCell
                    bucket={bucket}
                    date={date}
                    goals={goals}
                    onSelect={selectDate}
                    selected={selected}
                    today={today}
                  />
                )}
              </div>
            );
          })}
        </div>
      </ScrollShadow>
      {calendarOpen && today && calendarMin && calendarValue ? (
        <div className="flex w-full justify-center">
          <Card className="w-fit">
            <Card.Content>
            <Calendar
              aria-label="Jump to date"
              focusedValue={focusedDate ?? calendarValue}
              maxValue={parseDate(today)}
              minValue={parseDate(calendarMin)}
              value={calendarValue}
              onChange={(next) => {
                if (!next) {
                  return;
                }
                jumpToDate(next.toString());
              }}
              onFocusChange={setFocusedDate}
            >
              <Calendar.Header>
                <Calendar.YearPickerTrigger>
                  <Calendar.YearPickerTriggerHeading />
                  <Calendar.YearPickerTriggerIndicator />
                </Calendar.YearPickerTrigger>
                <Calendar.NavButton slot="previous" />
                <Calendar.NavButton slot="next" />
              </Calendar.Header>
              <Calendar.Grid>
                <Calendar.GridHeader>
                  {(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
                </Calendar.GridHeader>
                <Calendar.GridBody>
                  {(date) => (
                    <Calendar.Cell date={date}>
                      {({ formattedDate, isOutsideMonth }) => (
                        <>
                          {formattedDate}
                          {!isOutsideMonth && (daysByDate[date.toString()]?.mealCount ?? 0) > 0 ? (
                            <Calendar.CellIndicator />
                          ) : null}
                        </>
                      )}
                    </Calendar.Cell>
                  )}
                </Calendar.GridBody>
              </Calendar.Grid>
              <Calendar.YearPickerGrid>
                <Calendar.YearPickerGridBody>
                  {({ year }) => <Calendar.YearPickerCell year={year} />}
                </Calendar.YearPickerGridBody>
              </Calendar.YearPickerGrid>
            </Calendar>
          </Card.Content>
        </Card>
        </div>
      ) : null}
    </div>
  );
}

function monthRange(date: CalendarDate, today: string): { from: string; to: string } {
  const from = startOfMonth(date).toString();
  const end = endOfMonth(date).toString();
  return { from, to: end > today ? today : end };
}

function ymdDelta(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000);
}

function toGlobalIndex(index: number, count: number): number {
  return NUTRITION_DAY_TODAY_INDEX - (count - 1 - index);
}

function DayRingCell({
  bucket,
  date,
  goals,
  onSelect,
  selected,
  today,
}: {
  readonly bucket: NutritionDayBucket | undefined;
  readonly date: string | null;
  readonly goals: GoalsView | null;
  readonly onSelect: (date: string) => void;
  readonly selected: boolean;
  readonly today: string | null;
}) {
  const loading = !date || !bucket;
  const empty = bucket != null && bucket.mealCount === 0;
  const rings =
    bucket && goals && hasAnyGoal(goals) && bucket.mealCount > 0
      ? goalRingsForToday(goals, bucket.totals)
      : [];

  const label = date && today ? formatDayRingLabel(date, today) : null;

  return (
    <button
      aria-current={selected ? "date" : undefined}
      aria-label={label ? `${label.weekday}, ${label.date}` : "Loading day"}
      className={cn(
        "flex cursor-[var(--cursor-interactive)] flex-col items-center gap-1.5 rounded-2xl px-1 py-1",
        selected && "bg-surface-secondary",
      )}
      disabled={!date}
      type="button"
      onClick={() => {
        if (date) {
          onSelect(date);
        }
      }}
    >
      {loading ? (
        <Skeleton className="rounded-full" style={{ height: DAY_RING_SIZE, width: DAY_RING_SIZE }} />
      ) : (
        <CompactGoalRing empty={empty} rings={rings} />
      )}
      <span className="flex min-h-8 flex-col items-center leading-tight">
        <span className={cn("text-[11px] font-medium", selected ? "text-foreground" : "text-muted")}>
          {label?.weekday ?? " "}
        </span>
        <span className={cn("text-[10px]", selected ? "text-foreground" : "text-muted")}>
          {label?.date ?? " "}
        </span>
      </span>
    </button>
  );
}

function CalendarDayCell({
  onToggle,
  open,
}: {
  readonly onToggle: () => void;
  readonly open: boolean;
}) {
  return (
    <button
      aria-current={open ? "true" : undefined}
      aria-expanded={open}
      aria-label="Choose a date"
      className={cn(
        "flex cursor-[var(--cursor-interactive)] flex-col items-center gap-1.5 rounded-2xl px-1 py-1",
        open && "bg-surface-secondary",
      )}
      type="button"
      onClick={onToggle}
    >
      <span className="bg-surface-secondary text-muted flex size-[72px] items-center justify-center rounded-full">
        <CalendarIcon className="size-5" />
      </span>
      <span className="flex min-h-8 flex-col items-center leading-tight">
        <span className={cn("text-[11px] font-medium", open ? "text-foreground" : "text-muted")}>
          Calendar
        </span>
        <span className={cn("text-[10px]", open ? "text-foreground" : "text-muted")}>Pick a day</span>
      </span>
    </button>
  );
}
