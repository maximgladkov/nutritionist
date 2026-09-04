"use client";

import {
  AdminChannelSpendChart,
  AdminDailyUsageChart,
  AdminModelCostChart,
} from "@/app/admin/_components/admin-usage-charts";
import type { AdminDashboard } from "@/lib/admin-queries";
import { KPIGroup, NumberValue } from "@heroui-pro/react";
import { KPI } from "@heroui-pro/react/kpi";

export function AdminDashboardCharts({ data }: { readonly data: AdminDashboard }) {
  return (
    <div className="flex flex-col gap-6">
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
          {data.daily.length > 0 ? (
            <KPI.Chart color="var(--chart-1)" data={[...data.daily]} dataKey="requests" height={64} />
          ) : null}
        </KPI>
        <KPIGroup.Separator />
        <KPI>
          <KPI.Header>
            <KPI.Title>Total cost (USD)</KPI.Title>
          </KPI.Header>
          <KPI.Content>
            <KPI.Value currency="USD" maximumFractionDigits={4} style="currency" value={data.totalCostUsd} />
          </KPI.Content>
          {data.daily.length > 0 ? (
            <KPI.Chart color="var(--chart-3)" data={[...data.daily]} dataKey="costUsd" height={64} />
          ) : null}
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
      <AdminDailyUsageChart data={data.daily} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AdminModelCostChart rows={data.byModel} />
        <AdminChannelSpendChart rows={data.byChannel} />
      </div>
    </div>
  );
}
