"use client";

import { MEAL_LABELS } from "@/app/_components/i18n-labels";
import { useAppLocale } from "@/app/_components/lingui-client-provider";
import { NutrientMetricsRow } from "@/app/_components/nutrient-metrics-row";
import { formatAmount, formatKcal } from "@/app/_components/nutrition-format";
import type { MealGroupView } from "@/lib/meal-groups";
import type { MealView } from "@/lib/meals";
import { CircleDashed, Cup, Moon, Sun } from "@gravity-ui/icons";
import { Accordion, Card, Typography } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";

const MEAL_ICONS: Record<MealView["label"], typeof CircleDashed> = {
  breakfast: Cup,
  dinner: Moon,
  lunch: Sun,
  other: CircleDashed,
  snack: CircleDashed,
};

function MealKcal({
  compact = false,
  value,
}: {
  readonly compact?: boolean;
  readonly value: number | null;
}) {
  const kcal = formatKcal(value);
  return (
    <span className="flex shrink-0 items-baseline gap-1">
      <Typography
        className="tabular-nums leading-none"
        type={compact ? "body-sm" : "h6"}
        weight="semibold"
      >
        {kcal}
      </Typography>
      {kcal !== "—" ? (
        <Typography className="leading-none" color="muted" type={compact ? "body-xs" : "body-sm"}>
          kcal
        </Typography>
      ) : null}
    </span>
  );
}

export function MealGroupsAccordion({ groups }: { readonly groups: readonly MealGroupView[] }) {
  const { t } = useLingui();
  const { locale } = useAppLocale();
  if (groups.length === 0) {
    return null;
  }
  return (
    <Card className="p-0">
      <Accordion allowsMultipleExpanded className="w-full" key={locale}>
        {groups.map((group) => {
          const Icon = MEAL_ICONS[group.label];
          const hasItems = group.items.length > 0;
          return (
            <Accordion.Item id={group.label} isDisabled={!hasItems} key={group.label}>
              <Accordion.Heading>
                <Accordion.Trigger className="flex items-center gap-3 aria-disabled:opacity-100">
                  <span className="bg-default text-foreground flex size-11 shrink-0 items-center justify-center rounded-lg">
                    <Icon className="size-4" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col items-stretch gap-1.5">
                    <span className="text-foreground truncate text-left text-base font-medium">
                      {t(MEAL_LABELS[group.label])}
                    </span>
                    {hasItems ? (
                      <NutrientMetricsRow compact hideCalories totals={group.totals} />
                    ) : null}
                  </span>
                  <MealKcal value={group.totals.energyKcal} />
                </Accordion.Trigger>
              </Accordion.Heading>
              <Accordion.Panel>
                <Accordion.Body className="pt-0">
                  {hasItems ? (
                    <ul className="m-0 flex list-none flex-col gap-3 p-0">
                      {group.items.map((item) => (
                        <li className="flex items-center gap-3 pt-1" key={item.id}>
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
                        </li>
                      ))}
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
