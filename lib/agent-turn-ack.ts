import { Prisma } from "../generated/prisma/client.ts";
import { prisma } from "./prisma.ts";

export type PendingAgentTurnAck = {
  readonly at: string;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly costUsd: number;
  readonly inputTokens: number;
  readonly model: string;
  readonly outputTokens: number;
  readonly text: string;
};

export type CompletedPendingAgentTurnAck = PendingAgentTurnAck & {
  readonly sessionId: string | null;
  readonly turnId: string | null;
};

export function oldestUnclaimedPendingAck<T extends { createdAt: Date; sessionId: string | null }>(
  rows: readonly T[],
): T | undefined {
  const unclaimed = rows.filter((row) => row.sessionId === null);
  if (unclaimed.length === 0) {
    return undefined;
  }
  return unclaimed.reduce((oldest, row) => (row.createdAt.getTime() < oldest.createdAt.getTime() ? row : oldest));
}

export function pendingAckIsReady(row: { model: string | null; text: string | null }): boolean {
  return (row.text?.trim() ?? "").length > 0 && (row.model?.trim() ?? "").length > 0;
}

function pendingAcks() {
  const delegate = prisma["agentTurnPendingAck"];
  if (delegate === undefined) {
    throw new Error("Prisma client is missing AgentTurnPendingAck. Restart the eve runtime after prisma generate.");
  }
  return delegate;
}

export async function reservePendingAgentTurnAck(input: {
  channel: string;
  userId: string;
}): Promise<string> {
  const row = await pendingAcks().create({
    data: {
      channel: input.channel,
      userId: input.userId,
    },
  });
  return row.id;
}

export async function claimPendingAgentTurnAck(input: {
  channel: string;
  sessionId: string;
  turnId: string;
  userId: string | null;
}): Promise<PendingAgentTurnAck | null> {
  const userId = input.userId;
  if (userId === null) {
    return null;
  }
  return prisma.$transaction(async (tx) => {
    const row = await tx.agentTurnPendingAck.findFirst({
      orderBy: { createdAt: "asc" },
      where: { channel: input.channel, sessionId: null, userId },
    });
    if (!row) {
      return null;
    }
    await tx.agentTurnPendingAck.update({
      data: { sessionId: input.sessionId, turnId: input.turnId },
      where: { id: row.id },
    });
    const claimed = await tx.agentTurnPendingAck.findUnique({ where: { id: row.id } });
    if (!claimed) {
      return null;
    }
    return pendingAckFromRow(claimed);
  });
}

export async function completePendingAgentTurnAck(input: {
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  id: string;
  inputTokens: number;
  model: string;
  outputTokens: number;
  text: string;
}): Promise<CompletedPendingAgentTurnAck | null> {
  try {
    const row = await pendingAcks().update({
      data: {
        cacheReadTokens: input.cacheReadTokens,
        cacheWriteTokens: input.cacheWriteTokens,
        costUsd: decimalUsd(input.costUsd),
        inputTokens: input.inputTokens,
        model: input.model,
        outputTokens: input.outputTokens,
        text: input.text,
      },
      where: { id: input.id },
    });
    const ack = pendingAckFromRow(row);
    if (!ack) {
      return null;
    }
    return { ...ack, sessionId: row.sessionId, turnId: row.turnId };
  } catch {
    return null;
  }
}

export async function abandonPendingAgentTurnAck(id: string): Promise<void> {
  try {
    await pendingAcks().delete({ where: { id } });
  } catch {
    return;
  }
}

export async function loadPendingAgentTurnAckClaim(id: string) {
  const row = await pendingAcks().findUnique({
    select: { sessionId: true, turnId: true },
    where: { id },
  });
  if (!row) {
    return null;
  }
  return { sessionId: row.sessionId, turnId: row.turnId };
}

function pendingAckFromRow(row: {
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: Prisma.Decimal | number;
  createdAt: Date;
  inputTokens: number;
  model: string | null;
  outputTokens: number;
  text: string | null;
}): PendingAgentTurnAck | null {
  const text = row.text?.trim() ?? "";
  const model = row.model?.trim() ?? "";
  if (!pendingAckIsReady(row)) {
    return null;
  }
  return {
    at: row.createdAt.toISOString(),
    cacheReadTokens: row.cacheReadTokens,
    cacheWriteTokens: row.cacheWriteTokens,
    costUsd: decimalToNumber(row.costUsd),
    inputTokens: row.inputTokens,
    model,
    outputTokens: row.outputTokens,
    text,
  };
}

function decimalUsd(value: number): Prisma.Decimal {
  return new Prisma.Decimal(Number.isFinite(value) ? value.toFixed(6) : "0");
}

function decimalToNumber(value: Prisma.Decimal | number): number {
  if (typeof value === "number") {
    return value;
  }
  return value.toNumber();
}
