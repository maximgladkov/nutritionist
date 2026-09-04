"use client";

import { AdminChannelIcon } from "@/app/admin/_components/admin-channel-icon";
import { adminChannelChartRows, formatChannelLabel, formatRequestCount, formatUsd } from "@/lib/admin-format";
import type { AdminDailyPoint } from "@/lib/admin-queries";
import { ChartTooltip } from "@heroui-pro/react";
import { BarChart } from "@heroui-pro/react/bar-chart";
import { ComposedChart } from "@heroui-pro/react/composed-chart";
import { PieChart } from "@heroui-pro/react/pie-chart";
import { Card } from "@heroui/react";
import { useId } from "react";

const CHART_COLORS = ["var(--chart-4)", "var(--chart-3)", "var(--chart-2)", "var(--chart-1)"];

export function AdminDailyUsageChart({
  data,
  description = "USD on the left axis, request count on the right.",
  title = "Cost and volume",
}: {
  readonly data: readonly AdminDailyPoint[];
  readonly description?: string;
  readonly title?: string;
}) {
  const gradientId = `admin-daily-cost-${useId().replace(/:/g, "")}`;
  return (
    <Card>
      <Card.Header>
        <Card.Title>{title}</Card.Title>
        <Card.Description>{description}</Card.Description>
        <div className="flex items-center gap-3">
          <LegendSwatch color="var(--chart-3)" label="Cost (USD)" />
          <LegendSwatch color="var(--chart-1)" label="Requests (req)" />
        </div>
      </Card.Header>
      <Card.Content>
        {data.length === 0 ? (
          <EmptyChart>No requests in this range.</EmptyChart>
        ) : (
          <ComposedChart data={[...data]} height={260}>
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-3)" stopOpacity={0.24} />
                <stop offset="100%" stopColor="var(--chart-3)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <ComposedChart.Grid vertical={false} />
            <ComposedChart.XAxis dataKey="day" tickMargin={8} />
            <ComposedChart.YAxis tickFormatter={(value) => formatUsd(Number(value))} width={64} yAxisId="left" />
            <ComposedChart.YAxis
              orientation="right"
              tickFormatter={(value) => formatRequestCount(Number(value))}
              width={56}
              yAxisId="right"
            />
            <ComposedChart.Area
              dataKey="costUsd"
              dot={false}
              fill={`url(#${gradientId})`}
              name="Cost (USD)"
              stroke="var(--chart-3)"
              strokeWidth={2}
              type="monotone"
              yAxisId="left"
            />
            <ComposedChart.Line
              dataKey="requests"
              dot={false}
              name="Requests"
              stroke="var(--chart-1)"
              strokeWidth={2}
              type="monotone"
              yAxisId="right"
            />
            <ComposedChart.Tooltip
              content={({ active, label, payload }) => {
                if (!active || !payload?.length) {
                  return null;
                }
                return (
                  <ChartTooltip>
                    <ChartTooltip.Header>{String(label)}</ChartTooltip.Header>
                    {payload.map((entry) => (
                      <ChartTooltip.Item key={String(entry.dataKey)}>
                        <ChartTooltip.Indicator color={entry.color ?? entry.stroke ?? entry.fill} />
                        <ChartTooltip.Label>{entry.name}</ChartTooltip.Label>
                        <ChartTooltip.Value>
                          {entry.dataKey === "costUsd"
                            ? formatUsd(Number(entry.value ?? 0))
                            : formatRequestCount(Number(entry.value ?? 0))}
                        </ChartTooltip.Value>
                      </ChartTooltip.Item>
                    ))}
                  </ChartTooltip>
                );
              }}
            />
          </ComposedChart>
        )}
      </Card.Content>
    </Card>
  );
}

export function AdminChannelSpendChart({
  rows,
}: {
  readonly rows: readonly { channel: string; costUsd: number; requests: number }[];
}) {
  const data = adminChannelChartRows(rows);
  const totalCost = rows.reduce((sum, row) => sum + row.costUsd, 0);
  const useCost = rows.some((row) => row.costUsd > 0);
  return (
    <Card>
      <Card.Header>
        <Card.Title>Spend by channel</Card.Title>
        <Card.Description>
          {useCost ? "Share of cost in the selected range." : "Request share while spend is still zero."}
        </Card.Description>
      </Card.Header>
      <Card.Content>
        {data.length === 0 ? (
          <EmptyChart>No channel data yet.</EmptyChart>
        ) : (
          <div className="flex flex-col items-center gap-4 lg:flex-row lg:items-center lg:justify-center lg:gap-8">
            <div className="relative">
              <PieChart height={240} width={240}>
                <PieChart.Pie
                  cornerRadius={12}
                  cx="50%"
                  cy="50%"
                  data={[...data]}
                  dataKey="value"
                  innerRadius="68%"
                  nameKey="name"
                  paddingAngle={-20}
                  strokeWidth={0}
                >
                  {data.map((entry, index) => (
                    <PieChart.Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </PieChart.Pie>
                <PieChart.Tooltip
                  content={({ active, payload }) => {
                    const entry = payload?.[0];
                    if (!active || !entry) {
                      return null;
                    }
                    const point = entry.payload as (typeof data)[number] & { fill?: string };
                    return (
                      <ChartTooltip>
                        <ChartTooltip.Header>
                          <span className="inline-flex items-center gap-1.5">
                            <AdminChannelIcon channel={point.name} />
                            {formatChannelLabel(point.name)}
                          </span>
                        </ChartTooltip.Header>
                        <ChartTooltip.Item>
                          <ChartTooltip.Indicator color={point.fill ?? entry.payload?.fill} />
                          <ChartTooltip.Label>Cost (USD)</ChartTooltip.Label>
                          <ChartTooltip.Value>{formatUsd(point.costUsd)}</ChartTooltip.Value>
                        </ChartTooltip.Item>
                        <ChartTooltip.Item>
                          <ChartTooltip.Label>Requests</ChartTooltip.Label>
                          <ChartTooltip.Value>{formatRequestCount(point.requests)}</ChartTooltip.Value>
                        </ChartTooltip.Item>
                      </ChartTooltip>
                    );
                  }}
                />
              </PieChart>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-foreground text-xl font-semibold">{formatUsd(totalCost)}</span>
                <span className="text-muted text-xs">USD</span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {data.map((entry, index) => (
                <div className="flex items-center gap-3" key={entry.name}>
                  <span
                    className="size-3 shrink-0 rounded-full"
                    style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                  />
                  <span className="inline-flex w-6 justify-center">
                    <AdminChannelIcon channel={entry.name} />
                  </span>
                  <span className="text-foreground text-sm font-semibold">{formatUsd(entry.costUsd)}</span>
                  <span className="text-muted text-xs">{formatRequestCount(entry.requests)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card.Content>
    </Card>
  );
}

export function AdminModelCostChart({
  rows,
}: {
  readonly rows: readonly { costUsd: number; model: string; requests: number }[];
}) {
  return (
    <Card>
      <Card.Header>
        <Card.Title>Cost by model</Card.Title>
        <Card.Description>Spend ranked by model in the selected range.</Card.Description>
      </Card.Header>
      <Card.Content>
        {rows.length === 0 ? (
          <EmptyChart>No model usage yet.</EmptyChart>
        ) : (
          <BarChart data={[...rows]} height={Math.max(180, rows.length * 44)} layout="vertical">
            <BarChart.XAxis tickFormatter={(value) => formatUsd(Number(value))} tickMargin={4} type="number" />
            <BarChart.YAxis dataKey="model" tickFormatter={shortenLabel} tickMargin={4} type="category" width={120} />
            <BarChart.Bar
              barSize={14}
              dataKey="costUsd"
              fill="var(--chart-3)"
              name="Cost (USD)"
              radius={[0, 24, 24, 0]}
            />
            <BarChart.Tooltip
              content={({ active, label, payload }) => {
                if (!active || !payload?.length) {
                  return null;
                }
                const point = payload[0]?.payload as { costUsd: number; requests: number } | undefined;
                return (
                  <ChartTooltip>
                    <ChartTooltip.Header>{String(label)}</ChartTooltip.Header>
                    <ChartTooltip.Item>
                      <ChartTooltip.Indicator color="var(--chart-3)" />
                      <ChartTooltip.Label>Cost (USD)</ChartTooltip.Label>
                      <ChartTooltip.Value>{formatUsd(point?.costUsd ?? 0)}</ChartTooltip.Value>
                    </ChartTooltip.Item>
                    <ChartTooltip.Item>
                      <ChartTooltip.Label>Requests</ChartTooltip.Label>
                      <ChartTooltip.Value>{formatRequestCount(point?.requests ?? 0)}</ChartTooltip.Value>
                    </ChartTooltip.Item>
                  </ChartTooltip>
                );
              }}
            />
          </BarChart>
        )}
      </Card.Content>
    </Card>
  );
}

export function AdminTopSpendersChart({
  rows,
}: {
  readonly rows: readonly { costUsd: number; label: string }[];
}) {
  if (rows.length === 0) {
    return null;
  }
  return (
    <Card>
      <Card.Header>
        <Card.Title>Top spenders</Card.Title>
        <Card.Description>Highest cost in the selected range.</Card.Description>
      </Card.Header>
      <Card.Content>
        <BarChart data={[...rows]} height={Math.max(180, rows.length * 40)} layout="vertical">
          <BarChart.XAxis tickFormatter={(value) => formatUsd(Number(value))} tickMargin={4} type="number" />
          <BarChart.YAxis dataKey="label" tickFormatter={shortenLabel} tickMargin={4} type="category" width={140} />
          <BarChart.Bar
            barSize={14}
            dataKey="costUsd"
            fill="var(--accent)"
            name="Spend (USD)"
            radius={[0, 24, 24, 0]}
          />
          <BarChart.Tooltip
            content={({ active, label, payload }) => {
              if (!active || !payload?.length) {
                return null;
              }
              return (
                <ChartTooltip>
                  <ChartTooltip.Header>{String(label)}</ChartTooltip.Header>
                  {payload.map((entry) => (
                    <ChartTooltip.Item key={String(entry.dataKey)}>
                      <ChartTooltip.Indicator color={entry.color ?? entry.fill} />
                      <ChartTooltip.Label>{entry.name ?? "Spend (USD)"}</ChartTooltip.Label>
                      <ChartTooltip.Value>{formatUsd(Number(entry.value ?? 0))}</ChartTooltip.Value>
                    </ChartTooltip.Item>
                  ))}
                </ChartTooltip>
              );
            }}
          />
        </BarChart>
      </Card.Content>
    </Card>
  );
}

function LegendSwatch({ color, label }: { readonly color: string; readonly label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="size-3 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-muted text-xs">{label}</span>
    </div>
  );
}

function EmptyChart({ children }: { readonly children: string }) {
  return <p className="text-muted text-sm">{children}</p>;
}

function shortenLabel(value: number | string) {
  const text = String(value);
  return text.length > 22 ? `${text.slice(0, 21)}…` : text;
}
