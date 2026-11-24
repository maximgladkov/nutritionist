import { randomUUID } from "node:crypto";
import { z } from "zod";
import { addIdea, recordVoiceNote, undoLogged } from "../../assistant/actions.ts";
import { loadConversation } from "../../assistant/conversation.ts";
import { homeCardMessages } from "../../assistant/home-card.ts";
import { bookTalk, TALK_INSTRUCTIONS, TALK_MAX_SECONDS, TALK_MODEL, TALK_WEBSOCKET_URL } from "../../assistant/talk.ts";
import { prisma } from "../../prisma.ts";
import { apiDeps } from "../deps.ts";
import { ApiError, notFound } from "../errors.ts";
import { json, readJson, readQuery } from "../http.ts";
import type { RouteDefinition } from "../router.ts";

const voiceNoteSchema = z.object({
  durationMs: z.number().int().min(0).max(600_000),
  id: z.string().min(1).max(64),
  levels: z.array(z.number().min(0).max(1)).max(40),
  sessionId: z.string().min(1).max(200),
  text: z.string().min(1).max(8_000),
});

// Messages themselves go straight to eve (/eve/v1/session), which streams the reply.
export const assistantRoutes: RouteDefinition[] = [
  {
    handler: async ({ user }) => ({
      messages: await homeCardMessages(user.id, apiDeps().now()),
      talk: apiDeps().talk.available(),
    }),
    method: "GET",
    path: "/assistant/card",
  },
  {
    async handler({ url, user }) {
      const { before } = readQuery(url, z.object({ before: z.iso.datetime().optional() }));
      const view = await loadConversation({ before: before ? new Date(before) : undefined, now: apiDeps().now(), userId: user.id });
      return { ...view, talk: apiDeps().talk.available() };
    },
    method: "GET",
    path: "/assistant/conversation",
  },
  {
    async handler({ request, user }) {
      const body = await readJson(request, voiceNoteSchema);
      const session = await prisma.agentSession.findUnique({ where: { eveSessionId: body.sessionId } });
      // A brand-new session may not have its row yet; someone else's never gets a note.
      if (session && session.userId !== user.id) {
        throw notFound("That conversation isn't yours.");
      }
      const { id, ...note } = body;
      await recordVoiceNote({ ...note, callId: id, userId: user.id });
      return null;
    },
    method: "POST",
    path: "/assistant/voice-notes",
  },
  {
    // Starts a live spoken conversation: the phone connects to the gateway itself with this key.
    async handler({ user }) {
      const { now, talk } = apiDeps();
      if (!talk.available()) {
        throw new ApiError(503, "talk_unavailable", "Talking isn't available right now.");
      }
      const callId = `talk:${randomUUID()}`;
      if (!(await bookTalk(user.id, callId, now()))) {
        throw new ApiError(429, "talk_limit", "You've talked a lot lately. Try again later, or type instead.");
      }
      try {
        const { expiresAt, token } = await talk.mintSecret();
        const response = json({
          expiresAt,
          instructions: TALK_INSTRUCTIONS,
          maxSeconds: TALK_MAX_SECONDS,
          model: TALK_MODEL,
          token,
          url: TALK_WEBSOCKET_URL,
        });
        response.headers.set("Cache-Control", "no-store");
        return response;
      } catch (error) {
        // A call that never started doesn't count.
        await prisma.assistantAction.deleteMany({ where: { callId, userId: user.id } });
        console.error("talk secret failed", error);
        throw new ApiError(502, "talk_failed", "Couldn't start talking. Try again in a moment.");
      }
    },
    method: "POST",
    path: "/assistant/talk",
  },
  {
    async handler({ params, user }) {
      const profile = await prisma.userProfile.findUnique({ select: { country: true }, where: { userId: user.id } });
      const card = await addIdea({ country: profile?.country ?? undefined, id: params.id ?? "", userId: user.id });
      if (!card) throw notFound("That idea is gone.");
      return json({ card });
    },
    method: "POST",
    path: "/assistant/cards/:id/add",
  },
  {
    async handler({ params, user }) {
      const card = await undoLogged({ id: params.id ?? "", userId: user.id });
      if (!card) throw notFound("There's nothing to undo.");
      return json({ card });
    },
    method: "POST",
    path: "/assistant/cards/:id/undo",
  },
];
