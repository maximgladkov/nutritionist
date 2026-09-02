"use client";

import { CompactGoalRing, DAY_RING_SIZE } from "@/app/_components/compact-goal-ring";
import { formatDayRingLabel } from "@/app/_components/nutrition-format";
import { goalRingsForToday, hasAnyGoal, type GoalsView } from "@/lib/goal-values";
import { NUTRITION_DAY_TODAY_INDEX } from "@/lib/summary-days";
import type { NutritionDayBucket } from "@/lib/summary";
import { shiftYmd } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { ScrollShadow, Skeleton } from "@heroui/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

const CELL_WIDTH = 88;
const CELL_HEIGHT = 124;
const INITIAL_COUNT = 90;
const GROW_BY = 90;

export function DayRingStrip({
  daysByDate,
  goals,
  onSelectDate,
  onVisibleRange,
  selectedDate,
  today,
}: {
  readonly daysByDate: Readonly<Record<string, NutritionDayBucket>>;
  readonly goals: GoalsView | null;
  readonly onSelectDate: (date: string) => void;
  readonly onVisibleRange: (startIndex: number, endIndex: number) => void;
  readonly selectedDate: string | null;
  readonly today: string | null;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const growing = useRef(false);
  const [count, setCount] = useState(INITIAL_COUNT);
  const [aligned, setAligned] = useState(false);
  const [edgePad, setEdgePad] = useState(0);
  const virtualizer = useVirtualizer({
    count,
    estimateSize: () => CELL_WIDTH,
    getItemKey: (index) => count - 1 - index,
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
    const element = parentRef.current;
    if (aligned || !today || !element || element.clientWidth < CELL_WIDTH) {
      return;
    }
    const target = selectedDate ?? today;
    const index = count - 1 + ymdDelta(today, target);
    if (index < 0 || index >= count) {
      return;
    }
    const offset = index * CELL_WIDTH;
    element.scrollLeft = offset;
    const frame = requestAnimationFrame(() => {
      setAligned(true);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [aligned, count, edgePad, selectedDate, today]);

  useEffect(() => {
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
    onVisibleRange(toGlobalIndex(startIndex, count), toGlobalIndex(endIndex, count));
  }, [aligned, count, endIndex, onVisibleRange, startIndex]);

  const selectDate = (date: string) => {
    onSelectDate(date);
    if (!today) {
      return;
    }
    const index = count - 1 + ymdDelta(today, date);
    if (index < 0 || index >= count) {
      return;
    }
    virtualizer.scrollToOffset(index * CELL_WIDTH, { behavior: "smooth" });
  };

  return (
    <ScrollShadow hideScrollBar className="w-full" orientation="horizontal" ref={parentRef}>
      <div
        className="relative"
        style={{ height: CELL_HEIGHT, width: virtualizer.getTotalSize() }}
      >
        {items.map((item) => {
          const date = today ? shiftYmd(today, item.index - (count - 1)) : null;
          const bucket = date ? daysByDate[date] : undefined;
          const selected = date != null && date === selectedDate;
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
              <DayRingCell
                bucket={bucket}
                date={date}
                goals={goals}
                onSelect={selectDate}
                selected={selected}
                today={today}
              />
            </div>
          );
        })}
      </div>
    </ScrollShadow>
  );
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
