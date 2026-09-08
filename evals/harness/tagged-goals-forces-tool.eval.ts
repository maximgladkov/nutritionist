import { defineEval } from "eve/evals";
import { calledAnyTool, GOALS_FORCE_TOOLS, requestedToolNames, toolCategoryContext } from "./shared.ts";

export default defineEval({
  description: "A goals-tagged turn must request a goals-family tool.",
  tags: ["harness"],
  async test(t) {
    const turn = await t.send("Set my protein goal to 150 grams.", toolCategoryContext(["goals"]));
    t.check(requestedToolNames(turn), calledAnyTool(GOALS_FORCE_TOOLS, "called a goals-family tool or ask_question"));
  },
});
