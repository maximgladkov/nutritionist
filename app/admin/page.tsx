import { AdminDashboardCharts } from "@/app/admin/_components/admin-dashboard-charts";
import { AdminRangeLinks } from "@/app/admin/_components/admin-range-links";
import { requireAdmin } from "@/lib/admin-guard";
import { loadAdminDashboard, parseAdminRange } from "@/lib/admin-queries";

export default async function AdminDashboardPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly range?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const range = parseAdminRange(params.range);
  const data = await loadAdminDashboard(range);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Usage</h1>
          <p className="text-muted text-sm">Cost, latency, and volume across every agent turn.</p>
        </div>
        <AdminRangeLinks path="/admin" range={range} />
      </div>
      <AdminDashboardCharts data={data} />
    </div>
  );
}
