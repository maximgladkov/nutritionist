import { defineTool } from "eve/tools";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireUser } from "../lib/require-user";

export default defineTool({
  description: "Get the caller's saved nutrition profile notes.",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    const { userId } = requireUser(ctx);
    const profile = await prisma.userProfile.findUnique({ where: { userId } });
    return { notes: profile?.notes ?? "" };
  },
});
