import { defineDynamic, defineInstructions } from "eve/instructions";
import { resolveAuthenticatedUserId } from "../../lib/identity";
import { loadSettings, settingsInstructions } from "../../lib/assistant/settings";
import { APP_INSTRUCTIONS } from "../../lib/assistant/app-instructions";

export default defineDynamic(async (ctx) => {
  const caller = ctx.session.auth.current ?? ctx.session.auth.initiator;
  if (!caller || caller.attributes?.channel !== "app") {
    return null;
  }
  // Called before every model call; what they chose is read once a turn.
  const settings = await ctx.memo(["settings", ctx.turn?.id ?? null], () => chosen(caller.principalId, ctx.session.id));
  return defineInstructions({ content: [APP_INSTRUCTIONS, settings].filter(Boolean).join("\n\n") });
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
