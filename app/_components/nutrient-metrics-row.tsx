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
    fill: "var(--goal-calories)",
    id: "calories",
    label: "Calories",
    suffix: "kcal",
    value: (totals: NutrientValues) => formatKcal(totals.energyKcal),
  },
] as const;

export function NutrientMetricsRow({
  showLabels = false,
  size = "sm",
  totals,
}: {
  readonly showLabels?: boolean;
  readonly size?: "sm" | "md";
  readonly totals: NutrientValues;
}) {
  return (
    <div className={`flex items-center ${showLabels ? "justify-center gap-2" : "gap-1"}`}>
      {METRICS.map((metric) => {
        const value = metric.value(totals);
        return (
          <div className="flex min-w-0 flex-col items-center gap-0.5" key={metric.id}>
            {showLabels ? <span className="text-muted text-xs">{metric.label}</span> : null}
            <Chip
              className="max-w-full border-0 tabular-nums"
              size={size}
              style={
                value === "—"
                  ? undefined
                  : {
                    backgroundColor: `color-mix(in oklch, ${metric.fill} 22%, transparent)`,
                    color: metric.fill,
                  }
              }
              variant="soft"
            >
              <Chip.Label>
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
