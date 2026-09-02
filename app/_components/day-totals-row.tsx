import type { NutrientValues } from "@/lib/nutrition";
import { NutrientMetricsRow } from "./nutrient-metrics-row";

export function DayTotalsRow({ totals }: { readonly totals: NutrientValues }) {
  return (
    <div className="px-1">
      <NutrientMetricsRow showLabels size="md" totals={totals} />
    </div>
  );
}
