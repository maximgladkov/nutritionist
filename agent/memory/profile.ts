import { defineMemory } from "eve/memory";
import { prismaMemoryProvider } from "../lib/memory-provider";
import { getUserId } from "../lib/require-user";

export default defineMemory({
  description: "Durable facts and preferences for this person across web, Telegram, and WhatsApp.",
  provider: prismaMemoryProvider(),
  scope(ctx) {
    return getUserId(ctx) ?? null;
  },
  visibility: "scope",
});
