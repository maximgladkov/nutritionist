import { defineHook } from "eve/hooks";
import { recordConversationMessage, TELEGRAM_CONVERSATION_CHANNEL } from "../../lib/conversation";
import { getLiveUserId } from "../lib/require-user";

export default defineHook({
  events: {
    async "message.received"(event, ctx) {
      if (ctx.channel.kind !== TELEGRAM_CONVERSATION_CHANNEL) {
        return;
      }
      await persistTelegramTurn({
        role: "user",
        sessionId: ctx.session.id,
        text: event.data.message,
        userId: await getLiveUserId(ctx),
      });
    },
    async "message.completed"(event, ctx) {
      if (ctx.channel.kind !== TELEGRAM_CONVERSATION_CHANNEL) {
        return;
      }
      if (event.data.finishReason === "tool-calls" || !event.data.message) {
        return;
      }
      await persistTelegramTurn({
        role: "assistant",
        sessionId: ctx.session.id,
        text: event.data.message,
        userId: await getLiveUserId(ctx),
      });
    },
  },
});

async function persistTelegramTurn(input: {
  role: "assistant" | "user";
  sessionId: string;
  text: string;
  userId: string | undefined;
}) {
  if (!input.userId) {
    return;
  }
  try {
    await recordConversationMessage({
      channel: TELEGRAM_CONVERSATION_CHANNEL,
      role: input.role,
      sessionId: input.sessionId,
      text: input.text,
      userId: input.userId,
    });
  } catch (error) {
    console.error("telegram conversation persist failed", error);
  }
}
