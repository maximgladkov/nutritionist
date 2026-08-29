import type { SessionContext } from "eve/context";

export function getUserId(ctx: SessionContext): string | undefined {
  const caller = ctx.session.auth.current ?? ctx.session.auth.initiator;
  if (caller?.principalType !== "user" || !caller.principalId) {
    return undefined;
  }
  return caller.principalId;
}

export function requireUser(ctx: SessionContext): { userId: string } {
  const userId = getUserId(ctx);
  if (!userId) {
    throw new Error("An authenticated user is required.");
  }
  return { userId };
}
