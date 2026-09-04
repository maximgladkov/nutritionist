"use client";

import { AdminKpiSparkline } from "@/app/admin/_components/admin-kpi-sparkline";
import { adminUserRateMetrics } from "@/lib/admin-format";
import type { AdminUserDetail } from "@/lib/admin-queries";
import { KPIGroup, NumberValue } from "@heroui-pro/react";
import { KPI } from "@heroui-pro/react/kpi";

export function AdminUserKpis({
  data,
}: {
  readonly data: Pick<
    AdminUserDetail,
    "avgDurationMs" | "createdAt" | "daily" | "p95DurationMs" | "range" | "requestCount" | "totalCostUsd"
  >;
}) {
  const rates = adminUserRateMetrics({
    costUsd: data.totalCostUsd,
    createdAt: data.createdAt,
    range: data.range,
    requestCount: data.requestCount,
  });

  return (
    <div className="flex flex-col gap-4">
      <KPIGroup>
        <KPI>
          <KPI.Header>
            <KPI.Title>Requests</KPI.Title>
          </KPI.Header>
          <KPI.Content>
            <KPI.Value style="decimal" value={data.requestCount}>
              <NumberValue.Suffix> req</NumberValue.Suffix>
            </KPI.Value>
          </KPI.Content>
          <AdminKpiSparkline color="var(--chart-1)" data={data.daily} dataKey="requests" range={data.range} />
        </KPI>
        <KPIGroup.Separator />
        <KPI>
          <KPI.Header>
            <KPI.Title>Requests / day</KPI.Title>
          </KPI.Header>
          <KPI.Content>
            <KPI.Value maximumFractionDigits={2} style="decimal" value={rates.requestsPerDay}>
              <NumberValue.Suffix> req/day</NumberValue.Suffix>
            </KPI.Value>
          </KPI.Content>
        </KPI>
        <KPIGroup.Separator />
        <KPI>
          <KPI.Header>
            <KPI.Title>Total cost (USD)</KPI.Title>
          </KPI.Header>
          <KPI.Content>
            <KPI.Value currency="USD" maximumFractionDigits={4} style="currency" value={data.totalCostUsd} />
          </KPI.Content>
          <AdminKpiSparkline color="var(--chart-3)" data={data.daily} dataKey="costUsd" range={data.range} />
        </KPI>
        <KPIGroup.Separator />
        <KPI>
          <KPI.Header>
            <KPI.Title>Cost / day</KPI.Title>
          </KPI.Header>
          <KPI.Content>
            <KPI.Value currency="USD" maximumFractionDigits={4} style="currency" value={rates.costPerDay} />
          </KPI.Content>
        </KPI>
      </KPIGroup>
      <KPIGroup>
        <KPI>
          <KPI.Header>
            <KPI.Title>Cost / request</KPI.Title>
          </KPI.Header>
          <KPI.Content>
            <KPI.Value currency="USD" maximumFractionDigits={4} style="currency" value={rates.costPerRequest} />
          </KPI.Content>
        </KPI>
        <KPIGroup.Separator />
        <KPI>
          <KPI.Header>
            <KPI.Title>Avg duration</KPI.Title>
          </KPI.Header>
          <KPI.Content>
            <KPI.Value
              formatOptions={{
                maximumFractionDigits: 1,
                style: "unit",
                unit: "second",
                unitDisplay: "short",
              }}
              value={(data.avgDurationMs ?? 0) / 1000}
            />
          </KPI.Content>
        </KPI>
        <KPIGroup.Separator />
        <KPI>
          <KPI.Header>
            <KPI.Title>p95 duration</KPI.Title>
          </KPI.Header>
          <KPI.Content>
            <KPI.Value
              formatOptions={{
                maximumFractionDigits: 1,
                style: "unit",
                unit: "second",
                unitDisplay: "short",
              }}
              value={(data.p95DurationMs ?? 0) / 1000}
            />
          </KPI.Content>
        </KPI>
      </KPIGroup>
    </div>
  );
}
