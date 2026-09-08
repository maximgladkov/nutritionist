import { defineEval } from "eve/evals";
import { calledAnyTool, mealContext, MEAL_FORCE_TOOLS, requestedToolNames } from "./shared.ts";

export default defineEval({
  description: "A meal-tagged greeting must force a meal tool or ask_question, proving the harness is live.",
  tags: ["harness", "canary"],
  async test(t) {
    const turn = await t.send("Hello!", mealContext);
    t.check(requestedToolNames(turn), calledAnyTool(MEAL_FORCE_TOOLS, "forced a meal tool or ask_question"));
  },
});
