import { defineMemory } from "eve/memory";
import { prismaMemoryProvider } from "../lib/memory-provider";

export default defineMemory({
  description: "Durable facts and preferences for this person across web, Telegram, and WhatsApp.",
  provider: prismaMemoryProvider(),
  scope(ctx) {
    const caller = ctx.session.auth.current;
    if (caller?.principalType !== "user" || !caller.principalId) {
      return null;
    }
    return caller.principalId;
  },
  visibility: "scope",
});
