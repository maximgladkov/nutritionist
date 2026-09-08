import { defineEval } from "eve/evals";
import { calledNoToolsIn, noneContext, requestedToolNames, WRITE_TOOLS } from "./shared.ts";

export default defineEval({
  description: "A greeting with category none must not force a write tool.",
  tags: ["harness"],
  async test(t) {
    const turn = await t.send("Hello!", noneContext);
    t.succeeded();
    t.check(requestedToolNames(turn), calledNoToolsIn(WRITE_TOOLS, "greeting used no write tools"));
  },
});
