import { Prisma } from "../generated/prisma/client.ts";
import { prisma } from "./prisma.ts";
import { bindTelegramAckPosted } from "./telegram-ack-posted.ts";
import {
  isToolCategory,
  normalizeIntents,
  type ToolCategory,
  type ToolIntent,
} from "./tool-categories.ts";

export type PendingAgentTurnAck = {
  readonly at: string;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly categories?: readonly ToolCategory[];
  readonly costUsd: number;
  readonly inputTokens: number;
  readonly intents?: readonly ToolIntent[];
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
  return pendingAckToClaim(rows);
}

export function pendingAckToClaim<T extends { createdAt: Date; sessionId: string | null }>(
  rows: readonly T[],
  previousTurnStartedAt?: Date | null,
): T | undefined {
  const unclaimed = rows.filter((row) => row.sessionId === null);
  if (unclaimed.length === 0) {
    return undefined;
  }
  const ordered = [...unclaimed].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  if (previousTurnStartedAt === undefined || previousTurnStartedAt === null) {
    return ordered[0];
  }
  const previousAt = previousTurnStartedAt.getTime();
  const fresh = ordered.filter((row) => row.createdAt.getTime() >= previousAt);
  return fresh[0] ?? ordered[0];
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
  startedAt: Date;
  turnId: string;
  userId: string | null;
}): Promise<PendingAgentTurnAck | null> {
  const userId = input.userId;
  if (userId === null) {
    return null;
  }
  const turns = prisma["agentTurn"];
  if (turns === undefined) {
    throw new Error("Prisma client is missing AgentTurn. Restart the eve runtime after prisma generate.");
  }
  const previous = await turns.findFirst({
    select: { startedAt: true },
    orderBy: { startedAt: "desc" },
    where: {
      channel: input.channel,
      startedAt: { lt: input.startedAt },
      userId,
    },
  });
  return prisma.$transaction(async (tx) => {
    const fresh = previous
      ? await tx.agentTurnPendingAck.findFirst({
          orderBy: { createdAt: "asc" },
          where: {
            channel: input.channel,
            createdAt: { gte: previous.startedAt },
            sessionId: null,
            userId,
          },
        })
      : null;
    const row =
      fresh ??
      (await tx.agentTurnPendingAck.findFirst({
        orderBy: { createdAt: "asc" },
        where: { channel: input.channel, sessionId: null, userId },
      }));
    if (!row) {
      return null;
    }
    await tx.agentTurnPendingAck.update({
      data: { sessionId: input.sessionId, turnId: input.turnId },
      where: { id: row.id },
    });
    await tx.agentTurnPendingAck.deleteMany({
      where: {
        channel: input.channel,
        createdAt: { lt: row.createdAt },
        sessionId: null,
        userId,
      },
    });
    bindTelegramAckPosted(row.id, input.sessionId, input.turnId);
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
  categories?: readonly ToolCategory[];
  costUsd: number;
  id: string;
  inputTokens: number;
  intents?: readonly ToolIntent[];
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
        text: encodePendingAckOutput({
          categories: input.categories,
          intents: input.intents,
          text: input.text,
        }),
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
  const decoded = decodePendingAckOutput(row.text?.trim() ?? "");
  const model = row.model?.trim() ?? "";
  if (decoded.text.length === 0 || model.length === 0) {
    return null;
  }
  return {
    at: row.createdAt.toISOString(),
    cacheReadTokens: row.cacheReadTokens,
    cacheWriteTokens: row.cacheWriteTokens,
    categories: decoded.categories,
    costUsd: decimalToNumber(row.costUsd),
    inputTokens: row.inputTokens,
    intents: decoded.intents,
    model,
    outputTokens: row.outputTokens,
    text: decoded.text,
  };
}

export function encodePendingAckOutput(input: {
  categories?: readonly ToolCategory[];
  intents?: readonly ToolIntent[];
  text: string;
}): string {
  if (input.intents === undefined && input.categories === undefined) {
    return input.text;
  }
  return JSON.stringify({
    ack: input.text,
    ...(input.categories === undefined ? {} : { categories: input.categories }),
    ...(input.intents === undefined ? {} : { intents: input.intents }),
  });
}

export function decodePendingAckOutput(text: string): {
  categories?: ToolCategory[];
  intents?: ToolIntent[];
  text: string;
} {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed) as {
        ack?: unknown;
        categories?: unknown;
        intents?: unknown;
      };
      if (typeof parsed.ack === "string" && parsed.ack.trim().length > 0) {
        const intents = Array.isArray(parsed.intents)
          ? normalizeIntents({
              intents: parsed.intents.filter(
                (intent): intent is { category: string; text: string } =>
                  intent !== null &&
                  typeof intent === "object" &&
                  typeof (intent as { category?: unknown }).category === "string" &&
                  typeof (intent as { text?: unknown }).text === "string",
              ),
            })
          : undefined;
        const categories = Array.isArray(parsed.categories)
          ? parsed.categories.filter((value): value is ToolCategory => typeof value === "string" && isToolCategory(value))
          : undefined;
        return {
          categories: categories !== undefined && categories.length > 0 ? categories : undefined,
          intents: intents !== undefined && intents.length > 0 ? intents : undefined,
          text: parsed.ack.trim(),
        };
      }
    } catch {
      return { text: trimmed };
    }
  }
  return { text: trimmed };
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
