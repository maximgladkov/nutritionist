import type { MemoryScopeContext } from "eve/memory";
import { resolveAuthenticatedUserId } from "../../lib/identity";

export function getUserId(ctx: Pick<MemoryScopeContext, "session">): string | undefined {
  const caller = ctx.session.auth.current ?? ctx.session.auth.initiator;
  if (caller?.principalType !== "user" || !caller.principalId) {
    return undefined;
  }
  return caller.principalId;
}

export async function getLiveUserId(
  ctx: Pick<MemoryScopeContext, "session">,
): Promise<string | undefined> {
  return resolveAuthenticatedUserId({
    eveSessionId: ctx.session.id,
    principalId: getUserId(ctx),
  });
}

export async function requireUser(
  ctx: Pick<MemoryScopeContext, "session">,
): Promise<{ userId: string }> {
  const userId = await getLiveUserId(ctx);
  if (!userId) {
    throw new Error("An authenticated user is required.");
  }
  return { userId };
}
