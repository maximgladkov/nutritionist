import { defineTool } from "eve/tools";
import { z } from "zod";
import { listReminders } from "../../lib/reminders";
import { requireUser } from "../lib/require-user";

export default defineTool({
  description:
    "Get the caller's check-in reminders: whether each is enabled, the local clock time, timezone, and next run.",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    const { userId } = await requireUser(ctx);
    return listReminders(userId);
  },
});
