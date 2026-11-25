import {
  defaultEveAuth,
  eveChannel,
} from "eve/channels/eve";
import {
  ForbiddenError,
  localDev,
  type AuthFn,
  vercelOidc,
} from "eve/channels/auth";
import type { ChannelReceiveContext, MessageContent } from "eve/channels";
import { appPrincipal } from "../../lib/principal";
import { ASSISTANT_MAX_REQUEST_BYTES, assistantLimit } from "../../lib/assistant/limits";
import { openingNotes } from "../../lib/assistant/home-message";
import { referToPhotos, requireOwnPhotos } from "../../lib/assistant/photos";
import { ASLEEP_MESSAGE, loadUsage } from "../../lib/assistant/usage";
import { replaceDelivered } from "../../lib/media-ref";
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
  const [usage, limited] = await Promise.all([loadUsage(userId, new Date()), assistantLimit(userId)]);
  if (usage.asleep) {
    throw new ForbiddenError({ code: "asleep", message: ASLEEP_MESSAGE });
  }
  if (limited) {
    throw new ForbiddenError({ code: "rate_limited", message: limited });
  }
}

const channel = replaceDelivered(
  eveChannel({
    auth: [appSession(), vercelOidc(), localDev()],
    // Having its own files is what lets a channel replace what's delivered; uploads never get here.
    fetchFile: async () => null,
    async onMessage(ctx, message) {
      const caller = ctx.eve.caller;
      const inApp = caller?.attributes?.channel === "app";
      const [context] = await Promise.all([
        inApp ? openingNotes(caller.principalId, new Date()).catch(() => []) : undefined,
        requireOwnPhotos(message, {
          channel: String(caller?.attributes?.channel ?? ""),
          userId: caller?.principalId ?? "",
        }),
      ]);
      return { auth: defaultEveAuth(ctx), context };
    },
  }),
  referToPhotos,
);

Object.assign(channel, {
  async receive(
    input: {
      readonly auth: ReturnType<typeof appPrincipal> | null;
      readonly message: MessageContent;
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
