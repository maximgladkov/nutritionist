"use client";

import { FoodThumb } from "@/app/_components/food-thumb";
import { MEAL_LABELS } from "@/app/_components/i18n-labels";
import { useAppLocale } from "@/app/_components/lingui-client-provider";
import { MealKcal } from "@/app/_components/meal-kcal";
import { MealThumb } from "@/app/_components/meal-thumb";
import { NutrientMetricsRow } from "@/app/_components/nutrient-metrics-row";
import { formatAmount } from "@/app/_components/nutrition-format";
import type { MealGroupView } from "@/lib/meal-groups";
import type { MealItemView, MealView } from "@/lib/meals";
import { Accordion, Card } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";

export function MealGroupsAccordion({
  groups,
  onSelectItem,
}: {
  readonly groups: readonly MealGroupView[];
  readonly onSelectItem?: (item: MealItemView, label: MealView["label"]) => void;
}) {
  const { t } = useLingui();
  const { locale } = useAppLocale();
  if (groups.length === 0) {
    return null;
  }
  return (
    <Card className="p-0 overflow-hidden">
      <Accordion allowsMultipleExpanded className="w-full" key={locale}>
        {groups.map((group) => {
          const hasItems = group.items.length > 0;
          const mealName = t(MEAL_LABELS[group.label]);
          return (
            <Accordion.Item id={group.label} isDisabled={!hasItems} key={group.label}>
              <Accordion.Heading>
                <Accordion.Trigger className="flex items-center gap-3 aria-disabled:opacity-100">
                  <MealThumb alt={mealName} label={group.label} />
                  <span className="flex min-w-0 flex-1 flex-col items-stretch gap-1.5">
                    <span className="text-foreground truncate text-left text-base font-medium">
                      {mealName}
                    </span>
                    {hasItems ? (
                      <NutrientMetricsRow compact hideCalories totals={group.totals} />
                    ) : null}
                  </span>
                  <MealKcal value={group.totals.energyKcal} />
                </Accordion.Trigger>
              </Accordion.Heading>
              <Accordion.Panel>
                <Accordion.Body className="pt-0 pb-2">
                  {hasItems ? (
                    <ul className="m-0 flex list-none flex-col gap-1 p-0 -mx-4">
                      {group.items.map((item) => {
                        const row = (
                          <>
                            <FoodThumb alt={item.name} src={item.imageUrl} />
                            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                              <span className="flex min-w-0 items-baseline gap-1.5">
                                <span className="text-foreground min-w-0 truncate text-sm">{item.name}</span>
                                <span className="text-muted shrink-0 text-xs tabular-nums">
                                  {formatAmount(item.amount, item.unit)}
                                </span>
                              </span>
                              <NutrientMetricsRow compact hideCalories totals={item.metrics} />
                            </div>
                            <MealKcal compact value={item.metrics.energyKcal} />
                          </>
                        );
                        return (
                          <li key={item.id}>
                            {onSelectItem ? (
                              <button
                                className="hover:bg-surface-secondary/50 flex w-full min-w-0 cursor-[var(--cursor-interactive)] items-center gap-3 px-4 py-2 text-left"
                                type="button"
                                onClick={() => {
                                  onSelectItem(item, group.label);
                                }}
                              >
                                {row}
                              </button>
                            ) : (
                              <div className="flex w-full min-w-0 items-center gap-3 px-4 py-2 text-left">
                                {row}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </Accordion.Body>
              </Accordion.Panel>
            </Accordion.Item>
          );
        })}
      </Accordion>
    </Card>
  );
}
