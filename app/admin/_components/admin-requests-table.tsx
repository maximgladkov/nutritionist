import { AdminChannelIcon } from "@/app/admin/_components/admin-channel-icon";
import { adminUserPath, formatDateTime, formatDuration, formatUsd, formatUserLabel } from "@/lib/admin-format";
import type { AdminRange, AdminRequestRow } from "@/lib/admin-queries";
import type { AgentTurnStatus } from "@/lib/agent-turn-model";
import { Chip, Table } from "@heroui/react";
import NextLink from "next/link";

export function AdminRequestsTable({
  empty,
  range,
  rows,
}: {
  readonly empty: string;
  readonly range?: AdminRange;
  readonly rows: readonly AdminRequestRow[];
}) {
  if (rows.length === 0) {
    return <p className="text-muted text-sm">{empty}</p>;
  }
  return (
    <Table>
      <Table.ScrollContainer>
        <Table.Content aria-label="Agent requests" className="min-w-[960px]">
          <Table.Header>
            <Table.Column isRowHeader>Time</Table.Column>
            <Table.Column>User</Table.Column>
            <Table.Column>Channel</Table.Column>
            <Table.Column>Model</Table.Column>
            <Table.Column>Duration</Table.Column>
            <Table.Column>Cost (USD)</Table.Column>
            <Table.Column>Status</Table.Column>
            <Table.Column>Preview</Table.Column>
          </Table.Header>
          <Table.Body>
            {rows.map((row) => (
              <Table.Row key={row.id}>
                <Table.Cell>
                  <NextLink className="text-sm underline-offset-2 hover:underline" href={`/admin/sessions/${encodeURIComponent(row.sessionId)}`}>
                    {formatDateTime(row.startedAt)}
                  </NextLink>
                </Table.Cell>
                <Table.Cell>
                  {row.userId ? (
                    <NextLink className="text-sm underline-offset-2 hover:underline" href={adminUserPath(row.userId, range)}>
                      {formatUserLabel(row)}
                    </NextLink>
                  ) : (
                    formatUserLabel(row)
                  )}
                </Table.Cell>
                <Table.Cell>
                  <AdminChannelIcon channel={row.channel} />
                </Table.Cell>
                <Table.Cell>{row.model ?? "—"}</Table.Cell>
                <Table.Cell>{formatDuration(row.durationMs)}</Table.Cell>
                <Table.Cell>{formatUsd(row.costUsd)}</Table.Cell>
                <Table.Cell>
                  <Chip color={statusColor(row.status)} size="sm" variant="soft">
                    {row.status}
                  </Chip>
                </Table.Cell>
                <Table.Cell>
                  <span className="line-clamp-2 max-w-xs text-sm">{row.userPreview ?? "—"}</span>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}

function statusColor(status: AgentTurnStatus): "accent" | "danger" | "success" | "warning" {
  if (status === "completed") {
    return "success";
  }
  if (status === "failed") {
    return "danger";
  }
  if (status === "cancelled") {
    return "warning";
  }
  return "accent";
}
