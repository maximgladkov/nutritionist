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
  await agentTurns().upsert({
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
  const existing = await agentTurns().findUnique({
    where: { sessionId_turnId: { sessionId: input.sessionId, turnId: input.turnId } },
  });
  const transcript = mutate(parseTranscript(existing?.messages));
  const summary = summarizeTranscript(transcript);
  const model = input.model ?? summary.model ?? existing?.model ?? undefined;
  await agentTurns().upsert({
    create: {
      channel: input.channel,
      cacheReadTokens: summary.cacheReadTokens,
      cacheWriteTokens: summary.cacheWriteTokens,
      costUsd: decimalUsd(summary.costUsd),
      inputTokens: summary.inputTokens,
      messages: transcript as Prisma.InputJsonValue,
      model,
      outputTokens: summary.outputTokens,
      sessionId: input.sessionId,
      startedAt: input.startedAt ?? existing?.startedAt ?? new Date(),
      status: existing?.status ?? "running",
      turnId: input.turnId,
      turnSequence: input.turnSequence ?? existing?.turnSequence ?? 0,
      userId: input.userId ?? existing?.userId ?? null,
      userPreview: summary.userPreview ?? existing?.userPreview,
    },
    update: {
      cacheReadTokens: summary.cacheReadTokens,
      cacheWriteTokens: summary.cacheWriteTokens,
      costUsd: decimalUsd(summary.costUsd),
      inputTokens: summary.inputTokens,
      messages: transcript as Prisma.InputJsonValue,
      model,
      outputTokens: summary.outputTokens,
      userId: input.userId === undefined ? undefined : input.userId,
      userPreview: summary.userPreview ?? existing?.userPreview,
    },
    where: {
      sessionId_turnId: { sessionId: input.sessionId, turnId: input.turnId },
    },
  });
}

export async function findAgentTurnModel(sessionId: string, turnId: string) {
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
}

function decimalUsd(value: number): Prisma.Decimal {
  return new Prisma.Decimal(Number.isFinite(value) ? value.toFixed(6) : "0");
}
