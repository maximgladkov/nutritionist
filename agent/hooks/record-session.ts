import { defineHook } from "eve/hooks";
import { prisma } from "../../lib/prisma";

export default defineHook({
  events: {
    async "session.started"(_event, ctx) {
      const userId = ctx.session.auth.initiator?.principalId ?? ctx.session.auth.current?.principalId;
      const principalType =
        ctx.session.auth.initiator?.principalType ?? ctx.session.auth.current?.principalType;
      if (!userId || principalType !== "user" || userId === "local-dev") {
        return;
      }
      const channelKind = ctx.channel.kind === "eve" ? "web" : (ctx.channel.kind ?? "web");
      await prisma.agentSession.upsert({
        where: { eveSessionId: ctx.session.id },
        create: {
          channel: channelKind,
          eveSessionId: ctx.session.id,
          userId,
        },
        update: {
          channel: channelKind,
          userId,
        },
      });
    },
  },
});
