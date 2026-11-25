import { defineDynamic, defineInstructions } from "eve/instructions";
import { resolveAuthenticatedUserId } from "../../lib/identity";
import { loadSettings, settingsInstructions } from "../../lib/assistant/settings";
import { APP_INSTRUCTIONS } from "../../lib/assistant/app-instructions";

export default defineDynamic({
  events: {
    async "turn.started"(_event, ctx) {
      const caller = ctx.session.auth.current ?? ctx.session.auth.initiator;
      if (!caller || caller.attributes?.channel !== "app") {
        return null;
      }
      return defineInstructions({ content: [APP_INSTRUCTIONS, await chosen(caller.principalId, ctx.session.id)].filter(Boolean).join("\n\n") });
    },
  },
});

async function chosen(principalId: string, eveSessionId: string): Promise<string | null> {
  try {
    const userId = await resolveAuthenticatedUserId({ eveSessionId, principalId });
    return userId ? settingsInstructions(await loadSettings(userId)) : null;
  } catch (error) {
    console.error("assistant settings failed", error);
    return null;
  }
}
