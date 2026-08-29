import { defineMemory } from "eve/memory";
import { prismaMemoryProvider } from "../lib/memory-provider";
import { getLiveUserId } from "../lib/require-user";

export default defineMemory({
  description: "Durable facts and preferences for this person across web, Telegram, and WhatsApp.",
  provider: prismaMemoryProvider(),
  async scope(ctx) {
    return (await getLiveUserId(ctx)) ?? null;
  },
  visibility: "scope",
});
