import { defineEval } from "eve/evals";
import { calledAnyTool, GOALS_TOOLS, mealAndGoalsContext, MEAL_TOOLS, requestedToolNames } from "./shared.ts";

export default defineEval({
  description: "A mixed log-and-goals request must hit both write families.",
  tags: ["harness"],
  timeoutMs: 240_000,
  async test(t) {
    const turn = await t.send(
      "Log 73 ml of skim milk as breakfast, then save my daily protein goal of 150 grams.",
      mealAndGoalsContext,
    );
    t.check(requestedToolNames(turn), calledAnyTool(MEAL_TOOLS, "called a meal-family tool"));
    t.check(requestedToolNames(turn), calledAnyTool(GOALS_TOOLS, "called a goals-family tool"));
  },
});
