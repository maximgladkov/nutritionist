import { formatKcal } from "@/app/_components/nutrition-format";
import { Typography } from "@heroui/react";

export function MealKcal({
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
