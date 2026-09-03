"use client";

import { MEAL_LABELS } from "@/app/_components/i18n-labels";
import { useAppLocale } from "@/app/_components/lingui-client-provider";
import { NutrientMetricsRow } from "@/app/_components/nutrient-metrics-row";
import { formatAmount } from "@/app/_components/nutrition-format";
import type { MealGroupView } from "@/lib/meal-groups";
import type { MealView } from "@/lib/meals";
import { CircleDashed, Cup, Moon, Sun } from "@gravity-ui/icons";
import { Accordion } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";

const MEAL_ICONS: Record<MealView["label"], typeof CircleDashed> = {
  breakfast: Cup,
  dinner: Moon,
  lunch: Sun,
  other: CircleDashed,
  snack: CircleDashed,
};

export function MealGroupsAccordion({ groups }: { readonly groups: readonly MealGroupView[] }) {
  const { t } = useLingui();
  const { locale } = useAppLocale();
  if (groups.length === 0) {
    return null;
  }
  return (
    <Accordion allowsMultipleExpanded className="w-full" key={locale} variant="surface">
      {groups.map((group) => {
        const Icon = MEAL_ICONS[group.label];
        return (
          <Accordion.Item id={group.label} key={group.label}>
            <Accordion.Heading>
              <Accordion.Trigger className="flex-col items-stretch gap-2">
                <span className="flex items-center gap-2">
                  <span className="text-muted size-4 shrink-0">
                    <Icon />
                  </span>
                  <span className="text-foreground min-w-0 flex-1 truncate text-left text-sm font-medium">
                    {t(MEAL_LABELS[group.label])}
                  </span>
                  <Accordion.Indicator />
                </span>
                <NutrientMetricsRow totals={group.totals} />
              </Accordion.Trigger>
            </Accordion.Heading>
            <Accordion.Panel>
              <Accordion.Body className="pt-0">
                <ul className="m-0 flex list-none flex-col gap-3 p-0">
                  {group.items.map((item) => (
                    <li className="flex flex-col gap-1.5 pt-1" key={item.id}>
                      <div className="flex min-w-0 items-baseline justify-between gap-3">
                        <span className="text-foreground min-w-0 truncate text-sm">{item.name}</span>
                        <span className="text-muted shrink-0 text-xs">
                          {formatAmount(item.amount, item.unit)}
                        </span>
                      </div>
                      <NutrientMetricsRow compact totals={item.metrics} />
                    </li>
                  ))}
                </ul>
              </Accordion.Body>
            </Accordion.Panel>
          </Accordion.Item>
        );
      })}
    </Accordion>
  );
}
