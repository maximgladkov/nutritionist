import { defineTool } from "eve/tools";
import { z } from "zod";
import { REMINDER_LABELS, saveReminders } from "../../lib/reminders";
import { requireUser } from "../lib/require-user";

const reminderPatchSchema = z
  .object({
    label: z.enum(REMINDER_LABELS),
    enabled: z.boolean().optional(),
    hour: z.number().int().min(0).max(23).optional(),
    minute: z.number().int().min(0).max(59).optional(),
  })
  .refine(
    (value) =>
      value.enabled !== undefined || value.hour !== undefined || value.minute !== undefined,
    { message: "Provide enabled, hour, and/or minute" },
  );

export default defineTool({
  description:
    "Change the caller's check-in reminders. Pass one or more of breakfast, lunch, dinner, and summary. hour and minute are local clock time in the saved timezone (0-23 and 0-59). A timezone must already be saved. Enabling a reminder or changing its time reschedules the next run. Never pass another person's id.",
  inputSchema: z.object({
    reminders: z.array(reminderPatchSchema).min(1).max(4),
  }),
  async execute({ reminders }, ctx) {
    const { userId } = await requireUser(ctx);
    return saveReminders({ userId, patches: reminders });
  },
});
