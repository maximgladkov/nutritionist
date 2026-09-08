import { defineEval } from "eve/evals";
import { ASK_QUESTION_TOOL, calledAnyTool, mealContext, requestedToolNames } from "./shared.ts";

export default defineEval({
  description: "A meal-tagged repeat of yesterday's breakfast must call copy_meal.",
  tags: ["harness"],
  async test(t) {
    const turn = await t.send("Record the same breakfast I did yesterday", mealContext);
    t.check(
      requestedToolNames(turn),
      calledAnyTool(["copy_meal", ASK_QUESTION_TOOL], "called copy_meal or ask_question"),
    );
  },
});
