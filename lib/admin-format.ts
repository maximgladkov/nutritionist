export function formatUsd(value: number): string {
  if (!Number.isFinite(value) || value === 0) {
    return "$0";
  }
  if (value >= 1) {
    return `$${value.toFixed(2)}`;
  }
  if (value >= 0.01) {
    return `$${value.toFixed(4)}`;
  }
  return `$${value.toFixed(6)}`;
}

export function formatUsdPerDay(value: number): string {
  return `${formatUsd(value)}/day`;
}

export function formatRequestCount(value: number): string {
  const count = Number.isFinite(value) ? value : 0;
  return `${count.toLocaleString("en-US")} req`;
}

export function formatRequestPerDay(value: number): string {
  const count = Number.isFinite(value) ? value : 0;
  return `${count.toLocaleString("en-US", {
    maximumFractionDigits: count >= 10 ? 1 : 2,
  })} req/day`;
}

export function formatTokenCount(value: number): string {
  const count = Number.isFinite(value) ? value : 0;
  return `${count.toLocaleString("en-US")} tok`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) {
    return "—";
  }
  if (ms < 1000) {
    return `${Math.round(ms)} ms`;
  }
  if (ms < 60_000) {
    return `${(ms / 1000).toFixed(1)} s`;
  }
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${String(minutes)}m ${String(seconds)}s`;
}

export function formatUserLabel(input: {
  readonly userEmail: string | null;
  readonly userId: string | null;
  readonly userName: string | null;
}): string {
  return input.userEmail ?? input.userName ?? input.userId ?? "anonymous";
}

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}

export function formatChannelLabel(channel: string): string {
  if (channel === "web") {
    return "Web";
  }
  if (channel === "telegram") {
    return "Telegram";
  }
  if (channel === "whatsapp") {
    return "WhatsApp";
  }
  if (channel === "email") {
    return "Email";
  }
  return channel;
}

export function adminUserPath(userId: string, range?: string): string {
  const search = range ? `?range=${encodeURIComponent(range)}` : "";
  return `/admin/users/${encodeURIComponent(userId)}${search}`;
}

export type AdminChannelChartRow = {
  readonly costUsd: number;
  readonly name: string;
  readonly requests: number;
  readonly value: number;
};

export function adminChannelChartRows(
  rows: readonly { channel: string; costUsd: number; requests: number }[],
): AdminChannelChartRow[] {
  const useCost = rows.some((row) => row.costUsd > 0);
  return rows.map((row) => ({
    costUsd: row.costUsd,
    name: row.channel,
    requests: row.requests,
    value: useCost ? row.costUsd : row.requests,
  }));
}

export function topAdminSpenders(
  rows: readonly {
    costUsd: number;
    id: string;
    userEmail: string | null;
    userName: string | null;
  }[],
  limit = 8,
): { costUsd: number; label: string }[] {
  return [...rows]
    .filter((row) => row.costUsd > 0)
    .sort((left, right) => right.costUsd - left.costUsd || left.id.localeCompare(right.id))
    .slice(0, limit)
    .map((row) => ({
      costUsd: row.costUsd,
      label: formatUserLabel({ userEmail: row.userEmail, userId: row.id, userName: row.userName }),
    }));
}

export function sortAdminUserRows<T extends { costUsd: number; id: string; lastTurnAt: string | null }>(
  rows: readonly T[],
): T[] {
  return [...rows].sort((left, right) => {
    if (right.costUsd !== left.costUsd) {
      return right.costUsd - left.costUsd;
    }
    const leftTime = left.lastTurnAt ? Date.parse(left.lastTurnAt) : 0;
    const rightTime = right.lastTurnAt ? Date.parse(right.lastTurnAt) : 0;
    if (rightTime !== leftTime) {
      return rightTime - leftTime;
    }
    return left.id.localeCompare(right.id);
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function adminRangeDayCount(
  range: "7d" | "30d" | "all",
  createdAtIso: string,
  now = new Date(),
): number {
  const created = Date.parse(createdAtIso);
  const elapsed = Number.isFinite(created) ? now.getTime() - created : DAY_MS;
  const lifetimeDays = Math.max(1, Math.ceil(elapsed / DAY_MS) || 1);
  if (range === "all") {
    return lifetimeDays;
  }
  return Math.min(range === "30d" ? 30 : 7, lifetimeDays);
}

export function adminUserRateMetrics(input: {
  readonly costUsd: number;
  readonly createdAt: string;
  readonly range: "7d" | "30d" | "all";
  readonly requestCount: number;
  readonly now?: Date;
}): {
  readonly costPerDay: number;
  readonly costPerRequest: number;
  readonly days: number;
  readonly requestsPerDay: number;
} {
  const days = adminRangeDayCount(input.range, input.createdAt, input.now);
  const costUsd = Number.isFinite(input.costUsd) ? input.costUsd : 0;
  const requestCount = Number.isFinite(input.requestCount) ? input.requestCount : 0;
  return {
    costPerDay: costUsd / days,
    costPerRequest: requestCount > 0 ? costUsd / requestCount : 0,
    days,
    requestsPerDay: requestCount / days,
  };
}
