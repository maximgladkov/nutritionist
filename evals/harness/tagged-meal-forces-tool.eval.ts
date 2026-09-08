import { defineEval } from "eve/evals";
import { calledAnyTool, mealContext, MEAL_FORCE_TOOLS, requestedToolNames } from "./shared.ts";

export default defineEval({
  description: "A meal-tagged turn that looks like a completed log still has to request a meal tool.",
  tags: ["harness"],
  async test(t) {
    const turn = await t.send("Hacendado yogurt 125 g, leftover 1900 kcal.", mealContext);
    t.check(requestedToolNames(turn), calledAnyTool(MEAL_FORCE_TOOLS, "called a meal-family tool or ask_question"));
  },
});
