import { AdminChannelIcons } from "@/app/admin/_components/admin-channel-icon";
import { AdminRangeLinks } from "@/app/admin/_components/admin-range-links";
import { AdminTopSpendersChart } from "@/app/admin/_components/admin-usage-charts";
import { requireAdmin } from "@/lib/admin-guard";
import {
  adminUserPath,
  adminUserRateMetrics,
  formatDateTime,
  formatRequestCount,
  formatRequestPerDay,
  formatUsd,
  formatUsdPerDay,
  formatUserLabel,
  topAdminSpenders,
} from "@/lib/admin-format";
import { listAdminUsers, parseAdminRange } from "@/lib/admin-queries";
import { Button, Input, Label, Table, TextField } from "@heroui/react";
import NextLink from "next/link";

export default async function AdminUsersPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly q?: string; readonly range?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const range = parseAdminRange(params.range);
  const q = params.q?.trim() || undefined;
  const rows = await listAdminUsers({ q, range });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Users</h1>
          <p className="text-muted text-sm">Channels, spend, daily rates, and last activity for every account.</p>
        </div>
        <AdminRangeLinks params={{ q }} path="/admin/users" range={range} />
      </div>
      <form className="flex flex-wrap items-end gap-3" method="get">
        <input name="range" type="hidden" value={range} />
        <TextField className="w-72">
          <Label>Search</Label>
          <Input defaultValue={q ?? ""} name="q" placeholder="email, name, or id" />
        </TextField>
        <Button size="sm" type="submit" variant="primary">
          Search
        </Button>
      </form>
      <AdminTopSpendersChart rows={topAdminSpenders(rows)} />
      {rows.length === 0 ? (
        <p className="text-muted text-sm">{q ? "No users match this search." : "No users yet."}</p>
      ) : (
        <Table>
          <Table.ScrollContainer>
            <Table.Content aria-label="Users" className="min-w-[1120px]">
              <Table.Header>
                <Table.Column isRowHeader>User</Table.Column>
                <Table.Column>Identities</Table.Column>
                <Table.Column>Channels</Table.Column>
                <Table.Column>Requests</Table.Column>
                <Table.Column>Req / day</Table.Column>
                <Table.Column>Spend (USD)</Table.Column>
                <Table.Column>Spend / day</Table.Column>
                <Table.Column>Last turn</Table.Column>
              </Table.Header>
              <Table.Body>
                {rows.map((row) => {
                  const rates = adminUserRateMetrics({
                    costUsd: row.costUsd,
                    createdAt: row.createdAt,
                    range,
                    requestCount: row.requestCount,
                  });
                  return (
                    <Table.Row key={row.id}>
                      <Table.Cell>
                        <NextLink className="text-sm underline-offset-2 hover:underline" href={adminUserPath(row.id, range)}>
                          {formatUserLabel({ userEmail: row.userEmail, userId: row.id, userName: row.userName })}
                        </NextLink>
                      </Table.Cell>
                      <Table.Cell>
                        <AdminChannelIcons values={row.providers} />
                      </Table.Cell>
                      <Table.Cell>
                        <AdminChannelIcons values={row.channels} />
                      </Table.Cell>
                      <Table.Cell>{formatRequestCount(row.requestCount)}</Table.Cell>
                      <Table.Cell>{formatRequestPerDay(rates.requestsPerDay)}</Table.Cell>
                      <Table.Cell>{formatUsd(row.costUsd)}</Table.Cell>
                      <Table.Cell>{formatUsdPerDay(rates.costPerDay)}</Table.Cell>
                      <Table.Cell>{row.lastTurnAt ? formatDateTime(row.lastTurnAt) : "—"}</Table.Cell>
                    </Table.Row>
                  );
                })}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
      )}
    </div>
  );
}
