import type { SessionContext } from "eve/context";

export function requireUser(ctx: SessionContext): { userId: string } {
  const caller = ctx.session.auth.current;
  if (caller?.principalType !== "user" || !caller.principalId) {
    throw new Error("An authenticated user is required.");
  }
  return { userId: caller.principalId };
}
