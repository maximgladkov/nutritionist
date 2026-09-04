"use client";

import { fillDailyRange, formatRequestCount, formatUsd } from "@/lib/admin-format";
import type { AdminDailyPoint, AdminRange } from "@/lib/admin-queries";
import { ChartTooltip } from "@heroui-pro/react";
import { AreaChart } from "@heroui-pro/react/area-chart";
import { useId } from "react";

const SPARKLINE_LABELS = {
  costUsd: "Cost (USD)",
  requests: "Requests",
} as const;

const SPARKLINE_MARGIN = { bottom: 10, left: 12, right: 12, top: 10 };

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
  const series = fillDailyRange(data, range);
  const gradientId = `admin-kpi-sparkline-${useId().replace(/:/g, "")}`;
  if (series.length < 2) {
    return null;
  }
  const label = SPARKLINE_LABELS[dataKey];
  return (
    <AreaChart
      className="mt-2 -mb-4 overflow-visible"
      data={[...series]}
      height={56}
      margin={SPARKLINE_MARGIN}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.2} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <AreaChart.Area
        dataKey={dataKey}
        fill={`url(#${gradientId})`}
        isAnimationActive={false}
        stroke={color}
        strokeWidth={2}
        type="monotone"
      />
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
    </AreaChart>
  );
}
