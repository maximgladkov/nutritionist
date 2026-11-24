import { defineTool } from "eve/tools";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireUser } from "../lib/require-user";

export default defineTool({
  description: "The caller's logged weights, newest first, in kilograms. Use when they ask about their weight or progress.",
  inputSchema: z.object({ limit: z.number().int().min(1).max(60).optional() }),
  async execute({ limit }, ctx) {
    const { userId } = await requireUser(ctx);
    const weights = await prisma.weightEntry.findMany({
      orderBy: { date: "desc" },
      select: { date: true, weightKg: true },
      take: limit ?? 14,
      where: { userId },
    });
    return { weights };
  },
});
