import type { NutrientValues } from "@/lib/nutrition";
import { Chip } from "@heroui/react";
import { formatGrams, formatKcal } from "./nutrition-format";

const METRICS = [
  {
    fill: "var(--goal-fat)",
    id: "fat",
    label: "Fat",
    suffix: "g",
    value: (totals: NutrientValues) => formatGrams(totals.fat),
  },
  {
    fill: "var(--goal-carbs)",
    id: "carbs",
    label: "Carbs",
    suffix: "g",
    value: (totals: NutrientValues) => formatGrams(totals.carbohydrates),
  },
  {
    fill: "var(--goal-protein)",
    id: "protein",
    label: "Protein",
    suffix: "g",
    value: (totals: NutrientValues) => formatGrams(totals.proteins),
  },
  {
    fill: "var(--goal-fiber)",
    id: "fiber",
    label: "Fiber",
    suffix: "g",
    value: (totals: NutrientValues) => formatGrams(totals.fiber),
  },
  {
    fill: "var(--goal-calories)",
    id: "calories",
    label: "Calories",
    suffix: "kcal",
    value: (totals: NutrientValues) => formatKcal(totals.energyKcal),
  },
] as const;

function metricChipStyle(fill: string, quiet: boolean) {
  if (quiet) {
    return {
      backgroundColor: `color-mix(in oklch, ${fill} 12%, transparent)`,
      color: `light-dark(oklch(from ${fill} 0.5 calc(c * 0.38) h), oklch(from ${fill} 0.74 calc(c * 0.35) h))`,
    };
  }
  return {
    backgroundColor: `color-mix(in oklch, ${fill} 28%, transparent)`,
    color: `light-dark(oklch(from ${fill} 0.36 c h), oklch(from ${fill} 0.86 c h))`,
  };
}

export function NutrientMetricsRow({
  compact = false,
  showLabels = false,
  size = "sm",
  totals,
}: {
  readonly compact?: boolean;
  readonly showLabels?: boolean;
  readonly size?: "sm" | "md";
  readonly totals: NutrientValues;
}) {
  return (
    <div
      className={
        showLabels
          ? "flex flex-wrap items-center justify-center gap-2"
          : compact
            ? "flex flex-wrap items-center gap-1"
            : "flex flex-wrap items-center gap-1"
      }
    >
      {METRICS.map((metric) => {
        const value = metric.value(totals);
        return (
          <div className="flex min-w-0 flex-col items-center gap-0.5" key={metric.id}>
            {showLabels ? <span className="text-muted text-xs">{metric.label}</span> : null}
            <Chip
              className={
                compact
                  ? "max-w-full rounded-md border-0 px-1 py-0 font-normal leading-4 tabular-nums"
                  : "max-w-full border-0 tabular-nums"
              }
              size={compact ? "sm" : size}
              style={metricChipStyle(metric.fill, compact)}
              variant="soft"
            >
              <Chip.Label className={compact ? "px-0" : undefined}>
                {value}
                {value !== "—" ? ` ${metric.suffix}` : null}
              </Chip.Label>
            </Chip>
          </div>
        );
      })}
    </div>
  );
}
