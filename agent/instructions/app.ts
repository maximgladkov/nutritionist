import { defineDynamic, defineInstructions } from "eve/instructions";
import { APP_INSTRUCTIONS } from "../../lib/assistant/app-instructions";

export default defineDynamic({
  events: {
    "turn.started"(_event, ctx) {
      const caller = ctx.session.auth.current ?? ctx.session.auth.initiator;
      return caller?.attributes?.channel === "app" ? defineInstructions({ content: APP_INSTRUCTIONS }) : null;
    },
  },
});
