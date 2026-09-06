import { defineDynamic, defineInstructions, type DynamicResolveContext } from "eve/instructions";
import { clockContextText } from "../../lib/clock-context";
import { callerTimezone } from "../../lib/meals";
import { liveNutritionContextText } from "../../lib/live-nutrition-context";
import { loadTodayNutritionProgress } from "../../lib/nutrition-progress";
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
  let userId: string | undefined;
  try {
    userId = await getLiveUserId(ctx);
    const saved = userId === undefined ? undefined : await callerTimezone(userId);
    if (saved) {
      timeZone = saved;
      timezoneIsFallback = false;
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
  return clockContextText({ liveNutrition, now, timeZone, timezoneIsFallback });
}
