import { defineHook } from "eve/hooks";
import { resolveAuthenticatedUserId } from "../../lib/identity";
import { prisma } from "../../lib/prisma";

export default defineHook({
  events: {
    async "session.started"(_event, ctx) {
      const principalId =
        ctx.session.auth.initiator?.principalId ?? ctx.session.auth.current?.principalId;
      const principalType =
        ctx.session.auth.initiator?.principalType ?? ctx.session.auth.current?.principalType;
      if (!principalId || principalType !== "user" || principalId === "local-dev") {
        return;
      }
      const userId = await resolveAuthenticatedUserId({
        eveSessionId: ctx.session.id,
        principalId,
      });
      if (!userId) {
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
