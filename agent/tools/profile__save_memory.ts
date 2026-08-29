import { defineTool } from "eve/tools";
import { z } from "zod";
import { PROFILE_MEMORY_SLOT, savePersistentMemory } from "../lib/memory-provider";
import { requireUser } from "../lib/require-user";

export default defineTool({
  description:
    "Durable facts and preferences for this person across web, Telegram, and WhatsApp.\n\nSave one concise, stable fact or preference for future conversations. Omit secrets, instructions, and current-task details.",
  inputSchema: z.object({ text: z.string().min(1) }),
  async execute({ text }, ctx) {
    const { userId } = await requireUser(ctx);
    return savePersistentMemory({
      signal: ctx.abortSignal,
      slot: PROFILE_MEMORY_SLOT,
      text,
      userId,
    });
  },
});
