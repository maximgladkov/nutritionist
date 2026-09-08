import { defineEval } from "eve/evals";
import { calledAnyTool, mealDeleteContext, MEAL_DELETE_FORCE_TOOLS, requestedToolNames } from "./shared.ts";

export default defineEval({
  description: "A meal_delete-tagged turn must request delete_meal_item or ask_question.",
  tags: ["harness"],
  async test(t) {
    const turn = await t.send("Delete yesterday's pasta from my log.", mealDeleteContext);
    t.check(
      requestedToolNames(turn),
      calledAnyTool(MEAL_DELETE_FORCE_TOOLS, "called delete_meal_item or ask_question"),
    );
  },
});
