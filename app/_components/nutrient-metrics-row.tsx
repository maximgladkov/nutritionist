"use client";

import { GOAL_LABELS } from "@/app/_components/i18n-labels";
import type { NutrientValues } from "@/lib/nutrition";
import { useLingui } from "@lingui/react/macro";
import { Chip } from "@heroui/react";
import type { GoalField } from "@/lib/goal-values";
import { formatGrams, formatKcal } from "./nutrition-format";

const METRICS: readonly {
  fill: string;
  field: GoalField;
  id: string;
  suffix: "g" | "kcal";
  value: (totals: NutrientValues) => string;
}[] = [
  {
    field: "caloriesPerDay",
    fill: "var(--goal-calories)",
    id: "calories",
    suffix: "kcal",
    value: (totals) => formatKcal(totals.energyKcal),
  },
  {
    field: "proteinGPerDay",
    fill: "var(--goal-protein)",
    id: "protein",
    suffix: "g",
    value: (totals) => formatGrams(totals.proteins),
  },
  {
    field: "carbsGPerDay",
    fill: "var(--goal-carbs)",
    id: "carbs",
    suffix: "g",
    value: (totals) => formatGrams(totals.carbohydrates),
  },
  {
    field: "fatGPerDay",
    fill: "var(--goal-fat)",
    id: "fat",
    suffix: "g",
    value: (totals) => formatGrams(totals.fat),
  },
  {
    field: "fiberGPerDay",
    fill: "var(--goal-fiber)",
    id: "fiber",
    suffix: "g",
    value: (totals) => formatGrams(totals.fiber),
  },
];

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
  const { t } = useLingui();
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
            {showLabels ? (
              <span className="text-muted text-xs">{t(GOAL_LABELS[metric.field])}</span>
            ) : null}
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
