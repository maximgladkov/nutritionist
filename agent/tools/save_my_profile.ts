import { defineTool } from "eve/tools";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireUser } from "../lib/require-user";

export default defineTool({
  description: "Save or replace the caller's nutrition profile notes. Never pass another person's id.",
  inputSchema: z.object({ notes: z.string().max(4000) }),
  async execute({ notes }, ctx) {
    const { userId } = requireUser(ctx);
    const profile = await prisma.userProfile.upsert({
      where: { userId },
      create: { userId, notes },
      update: { notes },
    });
    return { notes: profile.notes };
  },
});
