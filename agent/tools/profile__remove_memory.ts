import { defineTool } from "eve/tools";
import { z } from "zod";
import { PROFILE_MEMORY_SLOT, removePersistentMemory } from "../lib/memory-provider";
import { requireUser } from "../lib/require-user";

export default defineTool({
  description:
    "Durable facts and preferences for this person across web, Telegram, and WhatsApp.\n\nRemove one persistent memory by the index shown in recalled memory. Use when it is wrong, outdated, or no longer needed.",
  inputSchema: z.object({ index: z.number().int().min(0) }),
  async execute({ index }, ctx) {
    const { userId } = await requireUser(ctx);
    return removePersistentMemory({
      index,
      signal: ctx.abortSignal,
      slot: PROFILE_MEMORY_SLOT,
      userId,
    });
  },
});
