import { Prisma } from "../generated/prisma/client.ts";
import {
  emptyTranscript,
  parseTranscript,
  summarizeTranscript,
  type AgentTurnStatus,
  type AgentTurnTranscript,
} from "./agent-turn-model.ts";
import { prisma } from "./prisma.ts";

export * from "./agent-turn-model.ts";
export { drainAgentTurnPersist, enqueueAgentTurnPersist, resetAgentTurnPersistQueue } from "./agent-turn-persist.ts";

const turnModels = new Map<string, string>();
const turnRows = new Map<string, CachedAgentTurn>();

type CachedAgentTurn = {
  id: string;
  messages: AgentTurnTranscript;
  model: string | null;
  startedAt: Date;
  status: AgentTurnStatus;
  turnSequence: number;
  userId: string | null;
  userPreview: string | null;
};

function turnCacheKey(sessionId: string, turnId: string) {
  return `${sessionId}:${turnId}`;
}

export function rememberAgentTurnModel(sessionId: string, turnId: string, model: string): void {
  turnModels.set(turnCacheKey(sessionId, turnId), model);
}

export function peekAgentTurnModel(sessionId: string, turnId: string): string | undefined {
  return turnModels.get(turnCacheKey(sessionId, turnId));
}

export function resetAgentTurnCaches(): void {
  turnModels.clear();
  turnRows.clear();
}

function agentTurns() {
  const delegate = prisma["agentTurn"];
  if (delegate === undefined) {
    throw new Error("Prisma client is missing AgentTurn. Restart the eve runtime after prisma generate.");
  }
  return delegate;
}

export async function startAgentTurn(input: {
  channel: string;
  sessionId: string;
  startedAt: Date;
  turnId: string;
  turnSequence: number;
  userId: string | null;
}): Promise<void> {
  const row = await agentTurns().upsert({
    create: {
      channel: input.channel,
      messages: emptyTranscript() as Prisma.InputJsonValue,
      sessionId: input.sessionId,
      startedAt: input.startedAt,
      status: "running",
      turnId: input.turnId,
      turnSequence: input.turnSequence,
      userId: input.userId,
    },
    update: {
      channel: input.channel,
      startedAt: input.startedAt,
      turnSequence: input.turnSequence,
      userId: input.userId ?? undefined,
    },
    where: {
      sessionId_turnId: { sessionId: input.sessionId, turnId: input.turnId },
    },
  });
  cacheAgentTurnRow(input.sessionId, input.turnId, row);
}

export async function patchAgentTurnTranscript(
  input: {
    channel: string;
    model?: string;
    sessionId: string;
    startedAt?: Date;
    turnId: string;
    turnSequence?: number;
    userId?: string | null;
  },
  mutate: (transcript: AgentTurnTranscript) => AgentTurnTranscript,
): Promise<void> {
  const cached = await loadCachedAgentTurn(input.sessionId, input.turnId);
  const transcript = mutate(cached?.messages ?? emptyTranscript());
  const summary = summarizeTranscript(transcript);
  const model = input.model ?? summary.model ?? cached?.model ?? undefined;
  const data = {
    cacheReadTokens: summary.cacheReadTokens,
    cacheWriteTokens: summary.cacheWriteTokens,
    costUsd: decimalUsd(summary.costUsd),
    inputTokens: summary.inputTokens,
    messages: transcript as Prisma.InputJsonValue,
    model,
    outputTokens: summary.outputTokens,
    userId: input.userId === undefined ? undefined : input.userId,
    userPreview: summary.userPreview ?? cached?.userPreview,
  };
  if (cached?.id) {
    const row = await agentTurns().update({
      data,
      where: { id: cached.id },
    });
    cacheAgentTurnRow(input.sessionId, input.turnId, row);
    return;
  }
  const row = await agentTurns().upsert({
    create: {
      channel: input.channel,
      ...data,
      sessionId: input.sessionId,
      startedAt: input.startedAt ?? cached?.startedAt ?? new Date(),
      status: cached?.status ?? "running",
      turnId: input.turnId,
      turnSequence: input.turnSequence ?? cached?.turnSequence ?? 0,
      userId: input.userId ?? cached?.userId ?? null,
    },
    update: data,
    where: {
      sessionId_turnId: { sessionId: input.sessionId, turnId: input.turnId },
    },
  });
  cacheAgentTurnRow(input.sessionId, input.turnId, row);
}

export async function findAgentTurnModel(sessionId: string, turnId: string) {
  const remembered = peekAgentTurnModel(sessionId, turnId);
  if (remembered !== undefined) {
    return { model: remembered };
  }
  const cached = turnRows.get(turnCacheKey(sessionId, turnId));
  if (cached?.model) {
    return { model: cached.model };
  }
  return agentTurns().findUnique({
    select: { model: true },
    where: { sessionId_turnId: { sessionId, turnId } },
  });
}

export async function loadAgentTurnAckDelivery(sessionId: string, turnId: string) {
  const row = await agentTurns().findUnique({
    select: { messages: true, status: true },
    where: { sessionId_turnId: { sessionId, turnId } },
  });
  if (!row) {
    return null;
  }
  return {
    hasAssistant: parseTranscript(row.messages).items.some((item) => item.type === "assistant"),
    status: row.status as AgentTurnStatus,
  };
}

export async function finalizeAgentTurn(input: {
  endedAt: Date;
  errorCode?: string;
  errorMessage?: string;
  sessionId: string;
  status: Exclude<AgentTurnStatus, "running">;
  turnId: string;
}): Promise<void> {
  const existing = await agentTurns().findUnique({
    where: { sessionId_turnId: { sessionId: input.sessionId, turnId: input.turnId } },
  });
  if (!existing) {
    return;
  }
  const durationMs = Math.max(0, input.endedAt.getTime() - existing.startedAt.getTime());
  await agentTurns().update({
    data: {
      durationMs,
      endedAt: input.endedAt,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      status: input.status,
    },
    where: { id: existing.id },
  });
  forgetAgentTurn(input.sessionId, input.turnId);
}

function decimalUsd(value: number): Prisma.Decimal {
  return new Prisma.Decimal(Number.isFinite(value) ? value.toFixed(6) : "0");
}

function cacheAgentTurnRow(
  sessionId: string,
  turnId: string,
  row: {
    id: string;
    messages: unknown;
    model: string | null;
    startedAt: Date;
    status: string;
    turnSequence: number;
    userId: string | null;
    userPreview: string | null;
  },
): void {
  turnRows.set(turnCacheKey(sessionId, turnId), {
    id: row.id,
    messages: parseTranscript(row.messages),
    model: row.model,
    startedAt: row.startedAt,
    status: row.status as AgentTurnStatus,
    turnSequence: row.turnSequence,
    userId: row.userId,
    userPreview: row.userPreview,
  });
  if (row.model) {
    rememberAgentTurnModel(sessionId, turnId, row.model);
  }
}

async function loadCachedAgentTurn(sessionId: string, turnId: string): Promise<CachedAgentTurn | undefined> {
  const cached = turnRows.get(turnCacheKey(sessionId, turnId));
  if (cached) {
    return cached;
  }
  const existing = await agentTurns().findUnique({
    where: { sessionId_turnId: { sessionId, turnId } },
  });
  if (!existing) {
    return undefined;
  }
  cacheAgentTurnRow(sessionId, turnId, existing);
  return turnRows.get(turnCacheKey(sessionId, turnId));
}

function forgetAgentTurn(sessionId: string, turnId: string): void {
  const key = turnCacheKey(sessionId, turnId);
  turnRows.delete(key);
  turnModels.delete(key);
}
