import { AdminChannelIcon } from "@/app/admin/_components/admin-channel-icon";
import { AdminTranscript } from "@/app/admin/_components/admin-transcript";
import { requireAdmin } from "@/lib/admin-guard";
import { formatDateTime, formatDuration, formatTokenCount, formatUsd, formatUserLabel, adminUserPath } from "@/lib/admin-format";
import { loadAdminSession } from "@/lib/admin-queries";
import { Chip } from "@heroui/react";
import NextLink from "next/link";
import { notFound } from "next/navigation";

export default async function AdminSessionPage({
  params,
}: {
  readonly params: Promise<{ readonly sessionId: string }>;
}) {
  await requireAdmin();
  const { sessionId } = await params;
  const turns = await loadAdminSession(sessionId);
  if (turns === null) {
    notFound();
  }
  const first = turns[0];
  const totalCost = turns.reduce((sum, turn) => sum + turn.costUsd, 0);
  const totalDuration = turns.reduce((sum, turn) => sum + (turn.durationMs ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <NextLink className="text-muted text-sm hover:underline" href="/admin/requests">
          All requests
        </NextLink>
        <h1 className="mt-2 text-xl font-semibold">Session</h1>
        <p className="text-muted break-all font-mono text-xs">{sessionId}</p>
        {first ? (
          <p className="text-muted mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            {first.userId ? (
              <NextLink className="underline-offset-2 hover:underline" href={adminUserPath(first.userId)}>
                {formatUserLabel(first)}
              </NextLink>
            ) : (
              formatUserLabel(first)
            )}
            <span aria-hidden>·</span>
            <AdminChannelIcon channel={first.channel} />
            <span aria-hidden>·</span>
            <span>{turns.length} turns</span>
            <span aria-hidden>·</span>
            <span>{formatUsd(totalCost)}</span>
            <span aria-hidden>·</span>
            <span>{formatDuration(totalDuration)}</span>
          </p>
        ) : null}
      </div>
      {turns.map((turn) => (
        <section className="border-divider rounded-2xl border p-4" id={turn.turnId} key={turn.id}>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Turn {turn.turnSequence}</p>
              <p className="text-muted text-xs">{formatDateTime(turn.startedAt)}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Chip color={turn.status === "completed" ? "success" : turn.status === "failed" ? "danger" : "accent"} size="sm" variant="soft">
                {turn.status}
              </Chip>
              <span className="text-muted text-xs">{turn.model ?? "unknown model"}</span>
              <span className="text-muted text-xs">{formatDuration(turn.durationMs)}</span>
              <span className="text-muted text-xs">{formatUsd(turn.costUsd)}</span>
              <span className="text-muted text-xs">
                {formatTokenCount(turn.inputTokens)} in / {formatTokenCount(turn.outputTokens)} out
              </span>
            </div>
          </div>
          {turn.errorMessage ? (
            <p className="text-danger mb-3 text-sm">
              {turn.errorCode}: {turn.errorMessage}
            </p>
          ) : null}
          <AdminTranscript messages={turn.messages} />
        </section>
      ))}
    </div>
  );
}
