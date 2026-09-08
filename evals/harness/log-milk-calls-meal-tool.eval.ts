import { defineEval } from "eve/evals";
import { calledAnyTool, MEAL_TOOLS, requestedToolNames } from "./shared.ts";

export default defineEval({
  description: "A text log request must call a meal-family tool.",
  tags: ["harness"],
  async test(t) {
    const turn = await t.send("Запиши 73 мл молока");
    t.check(requestedToolNames(turn), calledAnyTool(MEAL_TOOLS, "called a meal-family tool"));
  },
});
