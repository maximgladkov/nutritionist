import { defineEval } from "eve/evals";
import { calledAnyTool, MEAL_FORCE_TOOLS, requestedToolNames } from "./shared.ts";

export default defineEval({
  description: "An untagged breakfast photo must request a meal-family tool or ask_question.",
  tags: ["harness", "media"],
  timeoutMs: 240_000,
  async test(t) {
    const turn = await t.sendFile("Log this breakfast.", "public/breakfast.png", "image/png");
    t.check(requestedToolNames(turn), calledAnyTool(MEAL_FORCE_TOOLS, "called a meal-family tool or ask_question"));
  },
});
