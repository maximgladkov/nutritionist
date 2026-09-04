import { AdminRangeLinks } from "@/app/admin/_components/admin-range-links";
import { AdminRequestsTable } from "@/app/admin/_components/admin-requests-table";
import { requireAdmin } from "@/lib/admin-guard";
import type { AgentTurnStatus } from "@/lib/agent-turn-model";
import { listAdminRequests, parseAdminRange } from "@/lib/admin-queries";
import { Button, Input, Label, TextField } from "@heroui/react";

const STATUSES: readonly AgentTurnStatus[] = ["running", "completed", "failed", "cancelled"];

export default async function AdminRequestsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    readonly channel?: string;
    readonly range?: string;
    readonly status?: string;
    readonly user?: string;
  }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const range = parseAdminRange(params.range);
  const status = STATUSES.find((value) => value === params.status);
  const channel = params.channel?.trim() || undefined;
  const user = params.user?.trim() || undefined;
  const rows = await listAdminRequests({ channel, range, status, user });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Requests</h1>
          <p className="text-muted text-sm">Every user turn, newest first.</p>
        </div>
        <AdminRangeLinks params={{ channel, status, user }} path="/admin/requests" range={range} />
      </div>
      <form className="flex flex-wrap items-end gap-3" method="get">
        <input name="range" type="hidden" value={range} />
        <TextField className="w-40">
          <Label>Channel</Label>
          <Input defaultValue={channel ?? ""} name="channel" placeholder="web" />
        </TextField>
        <TextField className="w-56">
          <Label>User</Label>
          <Input defaultValue={user ?? ""} name="user" placeholder="email, name, or id" />
        </TextField>
        <TextField className="w-40">
          <Label>Status</Label>
          <Input defaultValue={status ?? ""} name="status" placeholder="completed" />
        </TextField>
        <Button size="sm" type="submit" variant="primary">
          Filter
        </Button>
      </form>
      <AdminRequestsTable empty="No requests match these filters." range={range} rows={rows} />
    </div>
  );
}
