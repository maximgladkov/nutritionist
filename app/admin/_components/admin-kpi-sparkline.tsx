"use client";

import { fillDailyRange, formatRequestCount, formatUsd } from "@/lib/admin-format";
import type { AdminDailyPoint, AdminRange } from "@/lib/admin-queries";
import { ChartTooltip } from "@heroui-pro/react";
import { AreaChart } from "@heroui-pro/react/area-chart";
import { KPI } from "@heroui-pro/react/kpi";

const SPARKLINE_LABELS = {
  costUsd: "Cost (USD)",
  requests: "Requests",
} as const;

export function AdminKpiSparkline({
  color,
  data,
  dataKey,
  range,
}: {
  readonly color: string;
  readonly data: readonly AdminDailyPoint[];
  readonly dataKey: "costUsd" | "requests";
  readonly range: AdminRange;
}) {
  const series = fillDailyRange(data, range).map((point) => ({
    day: point.day,
    value: point[dataKey],
  }));
  if (series.length < 2) {
    return null;
  }
  const label = SPARKLINE_LABELS[dataKey];
  return (
    <KPI.Chart
      color={color}
      data={series}
      tooltip={
        <AreaChart.Tooltip
          allowEscapeViewBox={{ x: true, y: true }}
          content={({ active, payload }) => {
            const point = payload?.[0];
            if (!active || !point) {
              return null;
            }
            const value = Number(point.value ?? 0);
            return (
              <div style={{ transform: "translate(-50%, calc(-100% - 10px))" }}>
                <ChartTooltip>
                  <ChartTooltip.Header>{String(point.payload?.day ?? "")}</ChartTooltip.Header>
                  <ChartTooltip.Item>
                    <ChartTooltip.Indicator color={point.stroke ?? color} />
                    <ChartTooltip.Label>{label}</ChartTooltip.Label>
                    <ChartTooltip.Value>
                      {dataKey === "costUsd" ? formatUsd(value) : formatRequestCount(value)}
                    </ChartTooltip.Value>
                  </ChartTooltip.Item>
                </ChartTooltip>
              </div>
            );
          }}
          offset={0}
        />
      }
    />
  );
}
