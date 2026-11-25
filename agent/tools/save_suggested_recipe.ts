import { defineTool } from "eve/tools";
import { z } from "zod";
import { saveRecipe } from "../../lib/assistant/displays";
import { requireUser } from "../lib/require-user";

export default defineTool({
  description:
    "Save a recipe that suggest_recipe suggested earlier in this conversation to the caller's recipes, after they clearly said yes in their latest message. Pass the display id suggest_recipe returned. Never call it in the same turn as suggest_recipe.",
  inputSchema: z.object({ displayId: z.string().min(1) }),
  async execute({ displayId }, ctx) {
    const { userId } = await requireUser(ctx);
    const saved = await saveRecipe({ id: displayId, userId });
    return saved ? { display: saved.display, saved: true } : { reason: "That suggestion is gone.", saved: false };
  },
});
