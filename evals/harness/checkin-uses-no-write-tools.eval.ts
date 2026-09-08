import { defineEval } from "eve/evals";
import { checkInPrompt } from "../../lib/reminder-clock.ts";
import { formatToolCategoriesContext } from "../../lib/tool-categories.ts";
import { calledNoToolsIn, requestedToolNames, WRITE_TOOLS } from "./shared.ts";

export default defineEval({
  description: "A meal check-in tagged none must not force a write tool.",
  tags: ["harness"],
  async test(t) {
    const turn = await t.send(`${formatToolCategoriesContext(["none"])}\n${checkInPrompt("lunch")}`);
    t.succeeded();
    t.check(requestedToolNames(turn), calledNoToolsIn(WRITE_TOOLS, "check-in used no write tools"));
  },
});
