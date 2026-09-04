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

function pendingAcks() {
  const delegate = prisma["agentTurnPendingAck"];
  if (delegate === undefined) {
    throw new Error("Prisma client is missing AgentTurnPendingAck. Restart the eve runtime after prisma generate.");
  }
  return delegate;
}

export async function enqueuePendingAgentTurnAck(input: {
  cacheReadTokens: number;
  cacheWriteTokens: number;
  channel: string;
  costUsd: number;
  inputTokens: number;
  model: string;
  outputTokens: number;
  text: string;
  userId: string;
}): Promise<void> {
  await pendingAcks().create({
    data: {
      cacheReadTokens: input.cacheReadTokens,
      cacheWriteTokens: input.cacheWriteTokens,
      channel: input.channel,
      costUsd: decimalUsd(input.costUsd),
      inputTokens: input.inputTokens,
      model: input.model,
      outputTokens: input.outputTokens,
      text: input.text,
      userId: input.userId,
    },
  });
}

export async function consumePendingAgentTurnAck(input: {
  channel: string;
  userId: string | null;
}): Promise<PendingAgentTurnAck | null> {
  const userId = input.userId;
  if (userId === null) {
    return null;
  }
  return prisma.$transaction(async (tx) => {
    const row = await tx.agentTurnPendingAck.findFirst({
      orderBy: { createdAt: "asc" },
      where: { channel: input.channel, userId },
    });
    if (!row) {
      return null;
    }
    await tx.agentTurnPendingAck.delete({ where: { id: row.id } });
    return {
      at: row.createdAt.toISOString(),
      cacheReadTokens: row.cacheReadTokens,
      cacheWriteTokens: row.cacheWriteTokens,
      costUsd: decimalToNumber(row.costUsd),
      inputTokens: row.inputTokens,
      model: row.model,
      outputTokens: row.outputTokens,
      text: row.text,
    };
  });
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
