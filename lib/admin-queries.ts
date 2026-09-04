import { Prisma, type AgentTurnStatus } from "../generated/prisma/client";
import { sortAdminUserRows } from "./admin-format.ts";
import { parseTranscript } from "./agent-turn-model.ts";
import { prisma } from "./prisma.ts";

export type AdminRange = "7d" | "30d" | "all";

export type AdminDailyPoint = {
  readonly costUsd: number;
  readonly day: string;
  readonly requests: number;
};

export type AdminDashboard = {
  readonly avgDurationMs: number | null;
  readonly byChannel: readonly { readonly channel: string; readonly costUsd: number; readonly requests: number }[];
  readonly byModel: readonly { readonly costUsd: number; readonly model: string; readonly requests: number }[];
  readonly daily: readonly AdminDailyPoint[];
  readonly p95DurationMs: number | null;
  readonly range: AdminRange;
  readonly requestCount: number;
  readonly totalCostUsd: number;
};

export type AdminRequestRow = {
  readonly channel: string;
  readonly costUsd: number;
  readonly durationMs: number | null;
  readonly id: string;
  readonly model: string | null;
  readonly sessionId: string;
  readonly startedAt: string;
  readonly status: AgentTurnStatus;
  readonly userEmail: string | null;
  readonly userId: string | null;
  readonly userName: string | null;
  readonly userPreview: string | null;
};

export type AdminSessionTurn = {
  readonly channel: string;
  readonly costUsd: number;
  readonly durationMs: number | null;
  readonly endedAt: string | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly id: string;
  readonly inputTokens: number;
  readonly messages: ReturnType<typeof parseTranscript>["items"];
  readonly model: string | null;
  readonly outputTokens: number;
  readonly startedAt: string;
  readonly status: AgentTurnStatus;
  readonly turnId: string;
  readonly turnSequence: number;
  readonly userEmail: string | null;
  readonly userId: string | null;
  readonly userName: string | null;
  readonly userPreview: string | null;
};

export type AdminUserRow = {
  readonly channels: readonly string[];
  readonly costUsd: number;
  readonly id: string;
  readonly lastTurnAt: string | null;
  readonly providers: readonly string[];
  readonly requestCount: number;
  readonly userEmail: string | null;
  readonly userName: string | null;
};

export type AdminUserIdentity = {
  readonly createdAt: string;
  readonly provider: string;
  readonly providerUserId: string;
  readonly threadId: string | null;
};

export type AdminUserDetail = {
  readonly avgDurationMs: number | null;
  readonly byChannel: readonly { readonly channel: string; readonly costUsd: number; readonly requests: number }[];
  readonly country: string | null;
  readonly createdAt: string;
  readonly daily: readonly AdminDailyPoint[];
  readonly id: string;
  readonly identities: readonly AdminUserIdentity[];
  readonly locale: string | null;
  readonly range: AdminRange;
  readonly requestCount: number;
  readonly requests: readonly AdminRequestRow[];
  readonly timezone: string | null;
  readonly totalCostUsd: number;
  readonly userEmail: string | null;
  readonly userName: string | null;
};

const RANGE_MS: Record<Exclude<AdminRange, "all">, number> = {
  "30d": 30 * 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

export function parseAdminRange(value: string | undefined): AdminRange {
  if (value === "30d" || value === "all") {
    return value;
  }
  return "7d";
}

export function rangeStartedAt(range: AdminRange, now = new Date()): Date | null {
  if (range === "all") {
    return null;
  }
  return new Date(now.getTime() - RANGE_MS[range]);
}

export async function loadAdminDashboard(range: AdminRange): Promise<AdminDashboard> {
  const startedAt = rangeStartedAt(range);
  const where: Prisma.AgentTurnWhereInput = startedAt ? { startedAt: { gte: startedAt } } : {};
  const [totals, byChannel, byModel, daily] = await Promise.all([
    prisma.$queryRaw<
      readonly {
        avgDurationMs: number | null;
        p95DurationMs: number | null;
        requestCount: bigint;
        totalCostUsd: number | null;
      }[]
    >`
      SELECT
        COUNT(*)::bigint AS "requestCount",
        COALESCE(SUM("costUsd"), 0)::float8 AS "totalCostUsd",
        AVG("durationMs")::float8 AS "avgDurationMs",
        percentile_cont(0.95) WITHIN GROUP (ORDER BY "durationMs") FILTER (WHERE "durationMs" IS NOT NULL)::float8 AS "p95DurationMs"
      FROM "AgentTurn"
      WHERE ${startedAt === null ? Prisma.sql`TRUE` : Prisma.sql`"startedAt" >= ${startedAt}`}
    `,
    prisma.agentTurn.groupBy({
      by: ["channel"],
      _count: { _all: true },
      _sum: { costUsd: true },
      orderBy: { _count: { channel: "desc" } },
      where,
    }),
    prisma.agentTurn.groupBy({
      by: ["model"],
      _count: { _all: true },
      _sum: { costUsd: true },
      orderBy: { _count: { model: "desc" } },
      where,
    }),
    loadDailyTurnPoints(startedAt),
  ]);
  const row = totals[0];
  return {
    avgDurationMs: row?.avgDurationMs ?? null,
    byChannel: byChannel.map((item) => ({
      channel: item.channel,
      costUsd: decimalToNumber(item._sum.costUsd),
      requests: item._count._all,
    })),
    byModel: byModel.map((item) => ({
      costUsd: decimalToNumber(item._sum.costUsd),
      model: item.model ?? "(unknown)",
      requests: item._count._all,
    })),
    daily: mapDailyPoints(daily),
    p95DurationMs: row?.p95DurationMs ?? null,
    range,
    requestCount: Number(row?.requestCount ?? 0),
    totalCostUsd: row?.totalCostUsd ?? 0,
  };
}

export async function listAdminRequests(input: {
  channel?: string;
  range: AdminRange;
  status?: AgentTurnStatus;
  take?: number;
  user?: string;
}): Promise<readonly AdminRequestRow[]> {
  const startedAt = rangeStartedAt(input.range);
  const user = input.user?.trim() ?? "";
  const rows = await prisma.agentTurn.findMany({
    include: { user: { select: { email: true, name: true } } },
    orderBy: { startedAt: "desc" },
    take: input.take ?? 100,
    where: {
      channel: input.channel || undefined,
      startedAt: startedAt ? { gte: startedAt } : undefined,
      status: input.status,
      ...(user.length === 0
        ? {}
        : {
            OR: [
              { userId: user },
              { user: { email: { contains: user, mode: "insensitive" } } },
              { user: { name: { contains: user, mode: "insensitive" } } },
            ],
          }),
    },
  });
  return rows.map((row) => ({
    channel: row.channel,
    costUsd: decimalToNumber(row.costUsd),
    durationMs: row.durationMs,
    id: row.id,
    model: row.model,
    sessionId: row.sessionId,
    startedAt: row.startedAt.toISOString(),
    status: row.status,
    userEmail: row.user?.email ?? null,
    userId: row.userId,
    userName: row.user?.name ?? null,
    userPreview: row.userPreview,
  }));
}

export async function listAdminUsers(input: {
  q?: string;
  range: AdminRange;
}): Promise<readonly AdminUserRow[]> {
  const startedAt = rangeStartedAt(input.range);
  const q = input.q?.trim() ?? "";
  const users = await prisma.user.findMany({
    include: {
      identities: { orderBy: { createdAt: "asc" }, select: { provider: true } },
    },
    where:
      q.length === 0
        ? undefined
        : {
            OR: [
              { id: q },
              { email: { contains: q, mode: "insensitive" } },
              { name: { contains: q, mode: "insensitive" } },
            ],
          },
  });
  if (users.length === 0) {
    return [];
  }
  const userIds = users.map((user) => user.id);
  const turnWhere: Prisma.AgentTurnWhereInput = {
    userId: { in: userIds },
    ...(startedAt ? { startedAt: { gte: startedAt } } : {}),
  };
  const [turnStats, sessionChannels] = await Promise.all([
    prisma.agentTurn.groupBy({
      _count: { _all: true },
      _max: { startedAt: true },
      _sum: { costUsd: true },
      by: ["userId"],
      where: turnWhere,
    }),
    prisma.agentSession.groupBy({
      _count: { _all: true },
      by: ["userId", "channel"],
      where: { userId: { in: userIds } },
    }),
  ]);
  const statsByUser = new Map(
    turnStats.flatMap((row) =>
      row.userId
        ? [
            [
              row.userId,
              {
                costUsd: decimalToNumber(row._sum.costUsd),
                lastTurnAt: row._max.startedAt?.toISOString() ?? null,
                requestCount: row._count._all,
              },
            ] as const,
          ]
        : [],
    ),
  );
  const channelsByUser = new Map<string, string[]>();
  for (const row of sessionChannels) {
    const channels = channelsByUser.get(row.userId) ?? [];
    channels.push(row.channel);
    channelsByUser.set(row.userId, channels);
  }
  return sortAdminUserRows(
    users.map((user) => {
      const stats = statsByUser.get(user.id);
      return {
        channels: uniqueSorted(channelsByUser.get(user.id) ?? []),
        costUsd: stats?.costUsd ?? 0,
        id: user.id,
        lastTurnAt: stats?.lastTurnAt ?? null,
        providers: uniqueSorted(user.identities.map((identity) => identity.provider)),
        requestCount: stats?.requestCount ?? 0,
        userEmail: user.email,
        userName: user.name,
      };
    }),
  );
}

export async function loadAdminUser(userId: string, range: AdminRange): Promise<AdminUserDetail | null> {
  const startedAt = rangeStartedAt(range);
  const user = await prisma.user.findUnique({
    include: {
      identities: {
        orderBy: { createdAt: "asc" },
        select: { createdAt: true, provider: true, providerUserId: true, threadId: true },
      },
      profile: { select: { country: true, locale: true, timezone: true } },
    },
    where: { id: userId },
  });
  if (!user) {
    return null;
  }
  const where: Prisma.AgentTurnWhereInput = {
    userId,
    ...(startedAt ? { startedAt: { gte: startedAt } } : {}),
  };
  const [totals, byChannel, daily, requests] = await Promise.all([
    prisma.$queryRaw<
      readonly {
        avgDurationMs: number | null;
        requestCount: bigint;
        totalCostUsd: number | null;
      }[]
    >`
      SELECT
        COUNT(*)::bigint AS "requestCount",
        COALESCE(SUM("costUsd"), 0)::float8 AS "totalCostUsd",
        AVG("durationMs")::float8 AS "avgDurationMs"
      FROM "AgentTurn"
      WHERE "userId" = ${userId}
        AND ${startedAt === null ? Prisma.sql`TRUE` : Prisma.sql`"startedAt" >= ${startedAt}`}
    `,
    prisma.agentTurn.groupBy({
      _count: { _all: true },
      _sum: { costUsd: true },
      by: ["channel"],
      orderBy: { _count: { channel: "desc" } },
      where,
    }),
    loadDailyTurnPoints(startedAt, userId),
    listAdminRequests({ range, take: 50, user: userId }),
  ]);
  const row = totals[0];
  return {
    avgDurationMs: row?.avgDurationMs ?? null,
    byChannel: byChannel.map((item) => ({
      channel: item.channel,
      costUsd: decimalToNumber(item._sum.costUsd),
      requests: item._count._all,
    })),
    country: user.profile?.country ?? null,
    createdAt: user.createdAt.toISOString(),
    daily: mapDailyPoints(daily),
    id: user.id,
    identities: user.identities.map((identity) => ({
      createdAt: identity.createdAt.toISOString(),
      provider: identity.provider,
      providerUserId: identity.providerUserId,
      threadId: identity.threadId,
    })),
    locale: user.profile?.locale ?? null,
    range,
    requestCount: Number(row?.requestCount ?? 0),
    requests,
    timezone: user.profile?.timezone ?? null,
    totalCostUsd: row?.totalCostUsd ?? 0,
    userEmail: user.email,
    userName: user.name,
  };
}

export async function loadAdminSession(sessionId: string): Promise<readonly AdminSessionTurn[] | null> {
  const rows = await prisma.agentTurn.findMany({
    include: { user: { select: { email: true, name: true } } },
    orderBy: { turnSequence: "asc" },
    where: { sessionId },
  });
  if (rows.length === 0) {
    return null;
  }
  return rows.map((row) => ({
    channel: row.channel,
    costUsd: decimalToNumber(row.costUsd),
    durationMs: row.durationMs,
    endedAt: row.endedAt?.toISOString() ?? null,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    id: row.id,
    inputTokens: row.inputTokens,
    messages: parseTranscript(row.messages).items,
    model: row.model,
    outputTokens: row.outputTokens,
    startedAt: row.startedAt.toISOString(),
    status: row.status,
    turnId: row.turnId,
    turnSequence: row.turnSequence,
    userEmail: row.user?.email ?? null,
    userId: row.userId,
    userName: row.user?.name ?? null,
    userPreview: row.userPreview,
  }));
}

async function loadDailyTurnPoints(startedAt: Date | null, userId?: string) {
  return prisma.$queryRaw<readonly { costUsd: number; day: Date; requests: bigint }[]>`
    SELECT
      date_trunc('day', "startedAt") AS day,
      COUNT(*)::bigint AS requests,
      COALESCE(SUM("costUsd"), 0)::float8 AS "costUsd"
    FROM "AgentTurn"
    WHERE ${startedAt === null ? Prisma.sql`TRUE` : Prisma.sql`"startedAt" >= ${startedAt}`}
      AND ${userId === undefined ? Prisma.sql`TRUE` : Prisma.sql`"userId" = ${userId}`}
    GROUP BY 1
    ORDER BY 1
  `;
}

function mapDailyPoints(rows: readonly { costUsd: number; day: Date; requests: bigint }[]): AdminDailyPoint[] {
  return rows.map((item) => ({
    costUsd: item.costUsd,
    day: item.day.toISOString().slice(0, 10),
    requests: Number(item.requests),
  }));
}

function decimalToNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }
  if (typeof value === "number") {
    return value;
  }
  return value.toNumber();
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
