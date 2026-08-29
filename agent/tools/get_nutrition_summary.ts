import { defineTool } from "eve/tools";
import { z } from "zod";
import { parseIsoDate, summarizeNutrition } from "../../lib/meals";
import { prisma } from "../../lib/prisma";
import { normalizeTimezone } from "../../lib/timezone";
import { requireUser } from "../lib/require-user";

export default defineTool({
  description:
    "Sum nutrition for the caller's meals in a date range. from is inclusive, to is exclusive. Both are ISO-8601. Pass groupBy day for a per-day breakdown. Uses the saved timezone for day buckets unless timezone is passed.",
  inputSchema: z.object({
    from: z.string().min(1),
    to: z.string().min(1),
    groupBy: z.enum(["day"]).optional(),
    timezone: z.string().min(1).optional(),
  }),
  async execute({ from, to, groupBy, timezone }, ctx) {
    const { userId } = requireUser(ctx);
    return summarizeNutrition({
      userId,
      from: parseIsoDate(from, "from"),
      to: parseIsoDate(to, "to"),
      groupBy,
      timezone: await resolveSummaryTimezone(timezone, userId),
    });
  },
});

async function resolveSummaryTimezone(
  override: string | undefined,
  userId: string,
): Promise<string | undefined> {
  if (override !== undefined && override !== "") {
    const normalized = normalizeTimezone(override);
    if (!normalized) {
      throw new Error("timezone must be a valid IANA time zone");
    }
    return normalized;
  }
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { timezone: true },
  });
  return profile?.timezone ?? undefined;
}
