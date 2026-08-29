import type { MemoryScopeContext } from "eve/memory";

export function getUserId(ctx: Pick<MemoryScopeContext, "session">): string | undefined {
  const caller = ctx.session.auth.current ?? ctx.session.auth.initiator;
  if (caller?.principalType !== "user" || !caller.principalId) {
    return undefined;
  }
  return caller.principalId;
}

export function requireUser(ctx: Pick<MemoryScopeContext, "session">): { userId: string } {
  const userId = getUserId(ctx);
  if (!userId) {
    throw new Error("An authenticated user is required.");
  }
  return { userId };
}
