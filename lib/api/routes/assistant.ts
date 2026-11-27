import { randomUUID } from "node:crypto";
import { z } from "zod";
import { addIdea, recordVoiceNote, undoLogged } from "../../assistant/actions.ts";
import { saveRecipe } from "../../assistant/displays.ts";
import { loadConversation } from "../../assistant/conversation.ts";
import { homeCardMessages } from "../../assistant/home-card.ts";
import { bookTalk, saveTalk, TALK_INSTRUCTIONS, TALK_MAX_SECONDS, TALK_MODEL, TALK_WEBSOCKET_URL } from "../../assistant/talk.ts";
import { homeMessage, openHomeMessage, openingNotes } from "../../assistant/home-message.ts";
import { loadSettings, talkSettingsLines } from "../../assistant/settings.ts";
import { ASLEEP_MESSAGE, loadUsage, TALK_MIN_LEFT_S, usageLeft } from "../../assistant/usage.ts";
import { prisma } from "../../prisma.ts";
import { apiDeps } from "../deps.ts";
import { ApiError, notFound, planLimit } from "../errors.ts";
import { json, readJson, readQuery } from "../http.ts";
import type { RouteDefinition } from "../router.ts";

const voiceNoteSchema = z.object({
  durationMs: z.number().int().min(0).max(600_000),
  id: z.string().min(1).max(64),
  levels: z.array(z.number().min(0).max(1)).max(40),
  sessionId: z.string().min(1).max(200),
  text: z.string().min(1).max(8_000),
});

const talkLinesSchema = z.object({
  lines: z
    .array(
      z.object({
        atMs: z.number().int().min(0).max(3_600_000),
        speaker: z.enum(["assistant", "user"]),
        text: z.string().trim().min(1).max(4_000),
      }),
    )
    .max(400),
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
    // Something new to say at each visit, where /assistant/card has the fixed messages older apps show.
    async handler({ locale, user }) {
      const now = apiDeps().now();
      const [usage, settings] = await Promise.all([loadUsage(user.id, now), loadSettings(user.id)]);
      const message = usage.asleep || !settings.homeMessages ? null : await homeMessage(user.id, now, settings, await locale());
      return { asleep: usage.asleep, message, resetsAt: usage.resetsAt };
    },
    method: "GET",
    path: "/assistant/message",
  },
  {
    // How this week's minutes with the coach have gone.
    handler: async ({ user }) => loadUsage(user.id, apiDeps().now()),
    method: "GET",
    path: "/assistant/usage",
  },
  {
    async handler({ params, user }) {
      const opener = await openHomeMessage({ id: params.id ?? "", now: apiDeps().now(), userId: user.id });
      if (!opener) throw notFound("That message is gone.");
      return json({ opener });
    },
    method: "POST",
    path: "/assistant/message/:id/open",
  },
  {
    async handler({ url, user }) {
      const { before } = readQuery(url, z.object({ before: z.iso.datetime().optional() }));
      const view = await loadConversation({ before: before ? new Date(before) : undefined, now: apiDeps().now(), userId: user.id });
      const usage = before ? null : await loadUsage(user.id, apiDeps().now());
      return { ...view, ...(usage ? { usage } : {}), talk: apiDeps().talk.available() };
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
      const [usage, settings] = await Promise.all([loadUsage(user.id, now()), loadSettings(user.id)]);
      const { ai, talk: left } = usageLeft(usage);
      if (ai < TALK_MIN_LEFT_S) {
        throw new ApiError(403, "asleep", ASLEEP_MESSAGE);
      }
      if (left < TALK_MIN_LEFT_S) {
        throw planLimit("talk", usage.plan, "You've used this week's minutes for talking. Type instead, or upgrade for more.");
      }
      if (!talk.available()) {
        throw new ApiError(503, "talk_unavailable", "Talking isn't available right now.");
      }
      const callId = `talk:${randomUUID()}`;
      const id = await bookTalk(user.id, callId, now());
      if (!id) {
        throw new ApiError(429, "talk_limit", "You've talked a lot lately. Try again later, or type instead.");
      }
      try {
        const [{ expiresAt, token }, notes] = await Promise.all([talk.mintSecret(), openingNotes(user.id, now())]);
        const response = json({
          expiresAt,
          id,
          instructions: [TALK_INSTRUCTIONS, ...talkSettingsLines(settings), ...notes].join("\n\n"),
          maxSeconds: Math.min(TALK_MAX_SECONDS, left),
          model: TALK_MODEL,
          token,
          voice: settings.voice,
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
    async handler({ params, request, user }) {
      const { lines } = await readJson(request, talkLinesSchema);
      if (!(await saveTalk({ id: params.id ?? "", lines, now: apiDeps().now(), userId: user.id }))) {
        throw notFound("That call is gone.");
      }
      return null;
    },
    method: "PUT",
    path: "/assistant/talk/:id",
  },
  {
    async handler({ params, user }) {
      const saved = await saveRecipe({ id: params.id ?? "", userId: user.id });
      if (!saved) throw notFound("That recipe is gone.");
      return json({ display: saved.display });
    },
    method: "POST",
    path: "/assistant/displays/:id/save",
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
