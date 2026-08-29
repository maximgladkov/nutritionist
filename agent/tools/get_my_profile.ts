import { defineTool } from "eve/tools";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireUser } from "../lib/require-user";

export default defineTool({
  description:
    "Get the caller's saved nutrition profile notes, country, and timezone. Use get_my_goals for calorie and other goals.",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    const { userId } = await requireUser(ctx);
    const profile = await prisma.userProfile.findUnique({ where: { userId } });
    return {
      notes: profile?.notes ?? "",
      country: profile?.country ?? null,
      timezone: profile?.timezone ?? null,
    };
  },
});
