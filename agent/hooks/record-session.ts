import { defineHook } from "eve/hooks";
import { normalizeChannelKind } from "../../lib/agent-turn-model";
import { resolveAuthenticatedUserId } from "../../lib/identity";
import { prisma } from "../../lib/prisma";

export default defineHook({
  events: {
    "session.started"(_event, ctx) {
      const principalId =
        ctx.session.auth.initiator?.principalId ?? ctx.session.auth.current?.principalId;
      const principalType =
        ctx.session.auth.initiator?.principalType ?? ctx.session.auth.current?.principalType;
      if (!principalId || principalType !== "user" || principalId === "local-dev") {
        return;
      }
      void (async () => {
        try {
          const userId = await resolveAuthenticatedUserId({
            eveSessionId: ctx.session.id,
            principalId,
          });
          if (!userId) {
            return;
          }
          const channelKind = normalizeChannelKind(ctx.channel.kind);
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
        } catch (error) {
          console.error("agent session persist failed", error);
        }
      })();
    },
  },
});
