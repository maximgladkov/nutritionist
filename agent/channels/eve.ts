import type { UserContent } from "ai";
import { eveChannel } from "eve/channels/eve";
import {
  ForbiddenError,
  localDev,
  type AuthFn,
  vercelOidc,
} from "eve/channels/auth";
import type { ChannelReceiveContext } from "eve/channels";
import { appPrincipal } from "../../lib/principal";
import { ASSISTANT_MAX_REQUEST_BYTES, assistantLimit } from "../../lib/assistant/limits";
import { prisma } from "../../lib/prisma";
import { eveSessionIdFromPath, getUserFromRequest } from "../../lib/session";
import { formatToolCategoriesContext } from "../../lib/tool-categories";

function appSession(): AuthFn<Request> {
  return async (request) => {
    let user;
    try {
      user = await getUserFromRequest(request);
    } catch {
      return null;
    }
    if (!user) {
      return null;
    }

    // The mobile app signs its requests with an API token; the web app has a session cookie.
    const channel = /^Bearer\s/i.test(request.headers.get("authorization") ?? "") ? "app" : "web";
    const sessionId = eveSessionIdFromPath(new URL(request.url).pathname);
    if (sessionId) {
      const owned = await prisma.agentSession.findUnique({
        where: { eveSessionId: sessionId },
      });
      if (owned && owned.userId !== user.id) {
        throw new ForbiddenError({ message: "This conversation belongs to another user." });
      }
      if (!owned) {
        // The session hook may be writing the same row, so a second write is fine.
        await prisma.agentSession.createMany({
          data: [{ channel, eveSessionId: sessionId, userId: user.id }],
          skipDuplicates: true,
        });
      }
    }

    if (channel === "app" && request.method === "POST") {
      await requireAssistantCapacity(request, user.id);
    }

    return appPrincipal(user.id, channel);
  };
}

async function requireAssistantCapacity(request: Request, userId: string): Promise<void> {
  // Stopping a reply is always allowed.
  if (new URL(request.url).pathname.endsWith("/cancel")) {
    return;
  }
  if (Number(request.headers.get("content-length") ?? 0) > ASSISTANT_MAX_REQUEST_BYTES) {
    throw new ForbiddenError({ code: "message_too_long", message: "That message is too long." });
  }
  const limited = await assistantLimit(userId);
  if (limited) {
    throw new ForbiddenError({ code: "rate_limited", message: limited });
  }
}

const channel = eveChannel({
  auth: [appSession(), vercelOidc(), localDev()],
});

Object.assign(channel, {
  async receive(
    input: {
      readonly auth: ReturnType<typeof appPrincipal> | null;
      readonly message: string | UserContent;
      readonly target: Readonly<{ sessionId?: string }>;
    },
    ctx: ChannelReceiveContext,
  ) {
    const sessionId = input.target.sessionId;
    if (!sessionId) {
      throw new Error("Web reminder delivery requires target.sessionId");
    }
    return ctx.from(sessionId).send(input.message, {
      auth: input.auth,
      context: [formatToolCategoriesContext(["none"])],
    });
  },
});

export default channel;
