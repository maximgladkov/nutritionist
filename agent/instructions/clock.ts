import { defineDynamic, defineInstructions, type DynamicResolveContext } from "eve/instructions";
import { clockContextText } from "../../lib/clock-context";
import { callerTimezone } from "../../lib/meals";
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
  try {
    const userId = await getLiveUserId(ctx);
    const timeZone = userId === undefined ? undefined : await callerTimezone(userId);
    if (timeZone) {
      return clockContextText({ now, timeZone, timezoneIsFallback: false });
    }
  } catch {
    return clockContextText({ now, timeZone: "UTC", timezoneIsFallback: true });
  }
  return clockContextText({ now, timeZone: "UTC", timezoneIsFallback: true });
}
