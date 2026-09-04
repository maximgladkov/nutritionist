import { AdminChannelIcon } from "@/app/admin/_components/admin-channel-icon";
import { AdminTranscript } from "@/app/admin/_components/admin-transcript";
import { requireAdmin } from "@/lib/admin-guard";
import { formatDateTime, formatDuration, formatTokenCount, formatUsd, formatUserLabel, adminUserPath } from "@/lib/admin-format";
import { loadAdminRequest } from "@/lib/admin-queries";
import { Chip } from "@heroui/react";
import NextLink from "next/link";
import { notFound } from "next/navigation";

export default async function AdminRequestPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const turn = await loadAdminRequest(id);
  if (!turn) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <NextLink className="text-muted text-sm hover:underline" href="/admin/requests">
          All requests
        </NextLink>
        <h1 className="mt-2 text-xl font-semibold">Request</h1>
        <div className="text-muted mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span>{formatDateTime(turn.startedAt)}</span>
          <span aria-hidden>·</span>
          {turn.userId ? (
            <NextLink className="underline-offset-2 hover:underline" href={adminUserPath(turn.userId)}>
              {formatUserLabel(turn)}
            </NextLink>
          ) : (
            formatUserLabel(turn)
          )}
          <span aria-hidden>·</span>
          <AdminChannelIcon channel={turn.channel} />
          <span aria-hidden>·</span>
          <Chip color={turn.status === "completed" ? "success" : turn.status === "failed" ? "danger" : "accent"} size="sm" variant="soft">
            {turn.status}
          </Chip>
          <span aria-hidden>·</span>
          <span>{turn.model ?? "unknown model"}</span>
          <span aria-hidden>·</span>
          <span>{formatDuration(turn.durationMs)}</span>
          <span aria-hidden>·</span>
          <span>{formatUsd(turn.costUsd)}</span>
          <span aria-hidden>·</span>
          <span>
            {formatTokenCount(turn.inputTokens)} in / {formatTokenCount(turn.outputTokens)} out
          </span>
        </div>
        <p className="mt-2">
          <NextLink
            className="text-muted text-sm underline-offset-2 hover:underline"
            href={`/admin/sessions/${encodeURIComponent(turn.sessionId)}`}
          >
            View session
          </NextLink>
        </p>
      </div>
      <section className="border-divider rounded-2xl border p-4">
        {turn.errorMessage ? (
          <p className="text-danger mb-3 text-sm">
            {turn.errorCode}: {turn.errorMessage}
          </p>
        ) : null}
        <AdminTranscript messages={turn.messages} />
      </section>
    </div>
  );
}
