import { eveChannel } from "eve/channels/eve";
import {
  ForbiddenError,
  localDev,
  type AuthFn,
  vercelOidc,
} from "eve/channels/auth";
import { appPrincipal } from "../../lib/principal";
import { prisma } from "../../lib/prisma";
import { eveSessionIdFromPath, getUserFromRequest } from "../../lib/session";

function appSession(): AuthFn<Request> {
  return async (request) => {
    const user = await getUserFromRequest(request);
    if (!user) {
      return null;
    }

    const sessionId = eveSessionIdFromPath(new URL(request.url).pathname);
    if (sessionId) {
      const owned = await prisma.agentSession.findUnique({
        where: { eveSessionId: sessionId },
      });
      if (owned && owned.userId !== user.id) {
        throw new ForbiddenError({ message: "This conversation belongs to another user." });
      }
      if (!owned) {
        await prisma.agentSession.create({
          data: {
            channel: "web",
            eveSessionId: sessionId,
            userId: user.id,
          },
        });
      }
    }

    return appPrincipal(user.id, "web");
  };
}

export default eveChannel({
  auth: [appSession(), vercelOidc(), localDev()],
});
