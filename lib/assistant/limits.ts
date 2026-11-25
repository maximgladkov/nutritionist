import { prisma } from "../prisma.ts";

// Photos are uploaded first and sent as links, so anything bigger than this isn't a chat message.
export const ASSISTANT_MAX_REQUEST_BYTES = 32 * 1024;
export const ASSISTANT_BURST = { max: 20, windowMs: 5 * 60_000 };
export const ASSISTANT_DAILY = { max: 150, windowMs: 24 * 60 * 60_000 };

// Why this person can't send another message right now, or null when they can.
export async function assistantLimit(userId: string, now = new Date()): Promise<string | null> {
  const sentSince = (windowMs: number) =>
    prisma.agentTurn.count({
      where: { channel: "app", startedAt: { gte: new Date(now.getTime() - windowMs) }, userId },
    });
  const [burst, daily] = await Promise.all([sentSince(ASSISTANT_BURST.windowMs), sentSince(ASSISTANT_DAILY.windowMs)]);
  if (daily >= ASSISTANT_DAILY.max) {
    return "That's a lot of messages for one day. Your coach is back tomorrow.";
  }
  if (burst >= ASSISTANT_BURST.max) {
    return "You're going quickly. Give it a few minutes and try again.";
  }
  return null;
}
