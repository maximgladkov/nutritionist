"use client";

import { GOAL_LABELS } from "@/app/_components/i18n-labels";
import { formatGrams, formatKcal } from "@/app/_components/nutrition-format";
import type { GoalField, GoalRing, GoalRingId } from "@/lib/goal-values";
import { cn } from "@/lib/utils";
import { Droplet, Flame, HeartFill, ThunderboltFill } from "@gravity-ui/icons";
import { Card, ProgressBar, ScrollShadow, Typography } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { ComponentType, SVGProps } from "react";

const BAR_ORDER: readonly GoalRingId[] = ["calories", "protein", "carbs", "fat", "fiber"];
const GOAL_FIELD: Record<GoalRingId, GoalField> = {
  calories: "caloriesPerDay",
  carbs: "carbsGPerDay",
  fat: "fatGPerDay",
  fiber: "fiberGPerDay",
  protein: "proteinGPerDay",
};

function Grains(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={16}
      height={16}
      fill="none"
      viewBox="0 0 256 256"
      {...props}
    >
      <path
        fill="currentColor"
        d="M208 56a87.5 87.5 0 0 0-31.84 6c-14.32-29.7-43.25-44.46-44.57-45.13a8 8 0 0 0-7.16 0c-1.33.64-30.26 15.4-44.58 45.13A87.5 87.5 0 0 0 48 56a8 8 0 0 0-8 8v80a88.12 88.12 0 0 0 75.48 87.1a4 4 0 0 0 4.52-4v-50.83a8.18 8.18 0 0 1 7.47-8.25a8 8 0 0 1 8.53 8v51.14a4 4 0 0 0 4.52 4A88.12 88.12 0 0 0 216 144V64a8 8 0 0 0-8-8m-88 93.46a88 88 0 0 0-64-37.09V72.44A72.1 72.1 0 0 1 120 144Zm8-42.1a88.6 88.6 0 0 0-33.84-38.25c9.21-19.21 26.4-31.33 33.84-35.9c7.45 4.58 24.63 16.7 33.84 35.9A88.6 88.6 0 0 0 128 107.36m72 5a88 88 0 0 0-64 37.09V144a72.1 72.1 0 0 1 64-71.56Z"
      />
    </svg>
  );
}

const GOAL_ICONS: Record<GoalRingId, ComponentType<SVGProps<SVGSVGElement>>> = {
  calories: Flame,
  carbs: ThunderboltFill,
  fat: Droplet,
  fiber: Grains,
  protein: HeartFill,
};

export function DayGoalProgress({ rings }: { readonly rings: readonly GoalRing[] }) {
  const bars = BAR_ORDER.flatMap((id) => rings.filter((ring) => ring.id === id));
  return (
    <ScrollShadow hideScrollBar className="w-full" orientation="horizontal">
      <div className="flex items-start gap-3">
        {bars.map((ring) => (
          <NutrientCard featured={ring.id === "calories"} key={ring.id} ring={ring} />
        ))}
      </div>
    </ScrollShadow>
  );
}

function NutrientCard({
  featured = false,
  ring,
}: {
  readonly featured?: boolean;
  readonly ring: GoalRing;
}) {
  const { t } = useLingui();
  const consumed = formatAmount(ring.consumed, ring.unit);
  const goal = ring.goal > 0 ? formatAmount(ring.goal, ring.unit) : null;
  const valueText = goal ? `${consumed} / ${goal} ${ring.unit}` : `${consumed} ${ring.unit}`;
  const Icon = GOAL_ICONS[ring.id];
  return (
    <Card
      className={cn("h-36 shrink-0", featured ? "aspect-[3/2]" : "aspect-square")}
    >
      <Card.Header className="flex-row items-center gap-2">
        <Icon aria-hidden="true" className="size-5 shrink-0" style={{ color: ring.fill }} />
        <Card.Title>{t(GOAL_LABELS[GOAL_FIELD[ring.id]])}</Card.Title>
      </Card.Header>
      <Card.Content className="flex-1 flex flex-col justify-end">
        <div className="flex items-start justify-between gap-3">
          <MetricStat featured={featured} label={t`Today`} unit={ring.unit} value={consumed} />
          <MetricStat
            align="end"
            featured={featured}
            label={t`Goal`}
            unit={""}
            value={goal ?? "—"}
          />
        </div>
      </Card.Content>
      <Card.Footer className="mt-auto w-full">
        <ProgressBar
          aria-label={valueText}
          className="w-full [grid-template-areas:'track']"
          maxValue={100}
          size="md"
          value={ring.value}
        >
          <ProgressBar.Track
            style={{
              backgroundColor: `color-mix(in oklch, ${ring.fill} 22%, transparent)`,
            }}
          >
            <ProgressBar.Fill style={{ backgroundColor: ring.fill }} />
            {ring.over > 0 ? (
              <div
                className="absolute inset-y-0 start-0"
                style={{
                  backgroundImage: `repeating-linear-gradient(45deg, ${ring.fill}, ${ring.fill} 2.4px, color-mix(in oklch, var(--foreground) 40%, transparent) 2.4px, color-mix(in oklch, var(--foreground) 40%, transparent) 4px)`,
                  width: `${ring.over}%`,
                }}
              />
            ) : null}
          </ProgressBar.Track>
        </ProgressBar>
      </Card.Footer>
    </Card>
  );
}

function MetricStat({
  align = "start",
  featured,
  label,
  unit,
  value,
}: {
  readonly align?: "end" | "start";
  readonly featured: boolean;
  readonly label: string;
  readonly unit?: string;
  readonly value: string;
}) {
  return (
    <div className={align === "end" ? "flex flex-col items-end justify-end" : "flex flex-col items-start justify-start"}>
      <Typography color="muted" type="body-xs">
        {label}
      </Typography>
      <div className="flex items-baseline gap-1">
        <Typography
          className="tabular-nums leading-none"
          type={featured ? "h3" : "h5"}
          weight="semibold"
        >
          {value}
        </Typography>
        {unit ? (
          <Typography color="muted" type="body-sm" className="leading-none">
            {unit}
          </Typography>
        ) : null}
      </div>
    </div>
  );
}

function formatAmount(value: number, unit: GoalRing["unit"]): string {
  return unit === "kcal" ? formatKcal(value) : formatGrams(value);
}
