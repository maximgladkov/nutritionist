import { defineEval } from "eve/evals";
import { calledNoToolsIn, MEAL_TOOLS, requestedToolNames } from "./shared.ts";

export default defineEval({
  description: "A today recap must not be treated as a meal log.",
  tags: ["harness"],
  async test(t) {
    const turn = await t.send("How am I doing today?");
    t.succeeded();
    t.check(requestedToolNames(turn), calledNoToolsIn(MEAL_TOOLS, "recap used no meal tools"));
  },
});
