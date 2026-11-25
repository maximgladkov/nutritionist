import { defineDynamic, defineInstructions, type DynamicContext } from "eve/instructions";
import { clockContextText } from "../../lib/clock-context";
import { liveNutritionContextText } from "../../lib/live-nutrition-context";
import { loadTodayNutritionProgress } from "../../lib/nutrition-progress";
import { prisma } from "../../lib/prisma";
import { getLiveUserId } from "../lib/require-user";

// Called before every model call; the same words all through a turn.
export default defineDynamic(async (ctx) =>
  defineInstructions({
    content: await ctx.memo(["clock", ctx.turn?.id ?? null], () => resolveClockContext(ctx)),
  }),
);

async function resolveClockContext(ctx: DynamicContext): Promise<string> {
  const now = new Date();
  let timeZone = "UTC";
  let timezoneIsFallback = true;
  let catalogCountry: string | undefined;
  let userId: string | undefined;
  try {
    userId = await getLiveUserId(ctx);
    if (userId) {
      const profile = await prisma.userProfile.findUnique({
        select: { country: true, timezone: true },
        where: { userId },
      });
      if (profile?.timezone) {
        timeZone = profile.timezone;
        timezoneIsFallback = false;
      }
      catalogCountry = profile?.country ?? undefined;
    }
  } catch {
    return clockContextText({ now, timeZone: "UTC", timezoneIsFallback: true });
  }
  let liveNutrition: string | undefined;
  if (userId) {
    try {
      liveNutrition = liveNutritionContextText(await loadTodayNutritionProgress(userId, now));
    } catch {
      liveNutrition = undefined;
    }
  }
  return clockContextText({ catalogCountry, liveNutrition, now, timeZone, timezoneIsFallback });
}
