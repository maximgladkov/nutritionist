import { AdminChannelIcon } from "@/app/admin/_components/admin-channel-icon";
import { AdminRangeLinks } from "@/app/admin/_components/admin-range-links";
import { AdminRequestsTable } from "@/app/admin/_components/admin-requests-table";
import { AdminChannelSpendChart, AdminDailyCostChart, AdminDailyRequestsChart } from "@/app/admin/_components/admin-usage-charts";
import { AdminUserKpis } from "@/app/admin/_components/admin-user-kpis";
import { requireAdmin } from "@/lib/admin-guard";
import { formatDateTime, formatUserLabel } from "@/lib/admin-format";
import { loadAdminUser, parseAdminRange } from "@/lib/admin-queries";
import { Card } from "@heroui/react";
import NextLink from "next/link";
import { notFound } from "next/navigation";

export default async function AdminUserPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly userId: string }>;
  readonly searchParams: Promise<{ readonly range?: string }>;
}) {
  await requireAdmin();
  const { userId } = await params;
  const range = parseAdminRange((await searchParams).range);
  const user = await loadAdminUser(userId, range);
  if (!user) {
    notFound();
  }
  const profileBits = [user.timezone, user.locale, user.country].filter((value): value is string => Boolean(value));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <NextLink className="text-muted text-sm hover:underline" href={`/admin/users?range=${range}`}>
            All users
          </NextLink>
          <h1 className="mt-2 text-xl font-semibold">
            {formatUserLabel({ userEmail: user.userEmail, userId: user.id, userName: user.userName })}
          </h1>
          <p className="text-muted mt-1 break-all font-mono text-xs">{user.id}</p>
          <p className="text-muted mt-2 text-sm">
            Joined {formatDateTime(user.createdAt)}
            {profileBits.length > 0 ? ` · ${profileBits.join(" · ")}` : ""}
          </p>
        </div>
        <AdminRangeLinks path={`/admin/users/${encodeURIComponent(user.id)}`} range={range} />
      </div>
      <AdminUserKpis data={user} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AdminDailyCostChart data={user.daily} />
        <AdminDailyRequestsChart data={user.daily} />
      </div>
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <Card.Header>
            <Card.Title>Linked identities</Card.Title>
            <Card.Description>Channel accounts attached to this user.</Card.Description>
          </Card.Header>
          <Card.Content>
            {user.identities.length === 0 ? (
              <p className="text-muted text-sm">No linked identities.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {user.identities.map((identity) => (
                  <li key={`${identity.provider}:${identity.providerUserId}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <AdminChannelIcon channel={identity.provider} />
                      <span className="font-mono text-sm">{identity.providerUserId}</span>
                    </div>
                    <p className="text-muted mt-1 text-xs">
                      Linked {formatDateTime(identity.createdAt)}
                      {identity.threadId ? ` · thread ${identity.threadId}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card.Content>
        </Card>
        <AdminChannelSpendChart rows={user.byChannel} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Requests</h2>
        <AdminRequestsTable empty="No requests in this range." range={range} rows={user.requests} />
      </section>
    </div>
  );
}
