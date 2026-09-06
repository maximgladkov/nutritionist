import { defineDynamic, defineInstructions, type DynamicResolveContext } from "eve/instructions";
import { clockContextText } from "../../lib/clock-context";
import { liveNutritionContextText } from "../../lib/live-nutrition-context";
import { loadTodayNutritionProgress } from "../../lib/nutrition-progress";
import { prisma } from "../../lib/prisma";
import { getLiveUserId } from "../lib/require-user";

export default defineDynamic({
  events: {
    async "turn.started"(_event, ctx) {
      return defineInstructions({
        content: await resolveClockContext(ctx),
      });
    },
  },
});

async function resolveClockContext(ctx: DynamicResolveContext): Promise<string> {
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
