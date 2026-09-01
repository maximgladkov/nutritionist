import { createTelegramFetchFile, telegramChannel } from "eve/channels/telegram";
import type { TelegramContext, TelegramMessage } from "eve/channels/telegram";
import { handleChannelLink, resolveChannelUser, saveChannelThreadId } from "../lib/channel-identity";
import { telegramSummaryMiniAppUrl } from "../../lib/app-url";
import { TELEGRAM_ACK_TURN_CONTEXT, postTelegramAck, telegramAckFiles } from "../../lib/telegram-ack";
import { applyTelegramHiddenMedia, telegramMessageHasInboundContent } from "../../lib/telegram-media";
import { claimTelegramMessage } from "../../lib/telegram-message-claim";
import { markdownToTelegramHtml, telegramHtmlMessage } from "../../lib/telegram-html";
import { attachTelegramVision } from "../../lib/telegram-vision";
import { wrapTelegramLastMessageChannel } from "../../lib/telegram-last-message";
import { persistTelegramConversationMessage } from "../../lib/conversation";
import { appPrincipal } from "../../lib/principal";
import { getLiveUserId } from "../lib/require-user";

const credentials = {
  botToken: () => process.env.TELEGRAM_BOT_TOKEN!,
};

const fetchFile = createTelegramFetchFile({
  credentials,
  policy: { allowedMediaTypes: "*", maxBytes: 25 * 1024 * 1024 },
});

export default wrapTelegramLastMessageChannel(
  attachTelegramVision(
    telegramChannel({
      credentials,
      turnPolicy: "queue",
      events: {
        async "message.completed"(data, channel, ctx) {
          if (data.finishReason === "tool-calls" || !data.message) {
            return;
          }
          const html = markdownToTelegramHtml(data.message);
          try {
            await channel.telegram.post(telegramHtmlMessage(html));
          } catch {
            await channel.telegram.post(data.message);
          }
          const caller = ctx.session.auth.current ?? ctx.session.auth.initiator;
          await persistTelegramConversationMessage({
            role: "assistant",
            sessionId: ctx.session.id,
            text: data.message,
            userId: (await getLiveUserId(ctx)) ?? (caller?.principalType === "user" ? caller.principalId : undefined),
          });
        },
      },
      async onMessage(ctx, message) {
        const from = message.from;
        if (!from || from.isBot) {
          return null;
        }
        const isLink = /^\/link(?:@|\s|$)/u.test(message.text.trim());
        if (isLink && message.chat.type !== "private") {
          await ctx.telegram.sendMessage("Account linking only works in a private chat with me.");
          return null;
        }
        const linkReply = await handleChannelLink({
          provider: "telegram",
          providerUserId: from.id,
          name: [from.firstName, from.lastName].filter(Boolean).join(" ") || from.username,
          text: message.text,
        });
        if (linkReply) {
          await ctx.telegram.sendMessage(linkReply);
          return null;
        }
        if (await handleSummaryCommand(ctx, message)) {
          return null;
        }
        if (!shouldDispatchTelegramMessage(message, ctx.telegram.botUsername)) {
          return null;
        }
        if (!(await claimTelegramMessage(message.chat.id, message.messageId))) {
          return null;
        }
        void ctx.telegram.startTyping();
        applyTelegramHiddenMedia(message);
        const files = telegramAckFiles(message.attachments);
        const ackPosted = postTelegramAck(ctx.telegram, {
          caption: message.caption,
          files,
          text: message.text,
        });
        const user = await resolveChannelUser({
          provider: "telegram",
          providerUserId: from.id,
          name: [from.firstName, from.lastName].filter(Boolean).join(" ") || from.username,
        });
        if (message.chat.type === "private") {
          await saveChannelThreadId({
            provider: "telegram",
            providerUserId: String(from.id),
            threadId: String(message.chat.id),
          });
          void ensureSummaryMenuButton(ctx);
        }
        const ack = await ackPosted.catch(() => false);
        return {
          auth: appPrincipal(user.id, "telegram"),
          ...(ack ? { context: [TELEGRAM_ACK_TURN_CONTEXT] } : {}),
        };
      },
    }),
    fetchFile,
  ),
);

function shouldDispatchTelegramMessage(message: TelegramMessage, botUsername: string | undefined) {
  if (message.from?.isBot === true || message.chat.type === "channel") {
    return false;
  }
  const text = message.text || message.caption;
  if (!telegramMessageHasInboundContent(message)) {
    return false;
  }
  if (message.chat.type === "private") {
    return true;
  }
  if (message.replyToMessage?.from?.isBot === true) {
    return true;
  }
  if (isBotCommand(text, botUsername)) {
    return true;
  }
  return botUsername !== undefined && text.toLowerCase().includes(`@${botUsername.toLowerCase()}`);
}

function isBotCommand(text: string, botUsername: string | undefined) {
  const match = /^\/(?<command>[A-Za-z0-9_]+)(?:@(?<target>[A-Za-z0-9_]+))?(?:\s|$)/u.exec(text);
  if (!match) {
    return false;
  }
  const target = match.groups?.target;
  return target === undefined || botUsername !== undefined && target.toLowerCase() === botUsername.toLowerCase();
}

async function handleSummaryCommand(ctx: TelegramContext, message: TelegramMessage): Promise<boolean> {
  if (!/^\/summary(?:@|\s|$)/iu.test(message.text.trim())) {
    return false;
  }
  if (message.chat.type !== "private") {
    await ctx.telegram.sendMessage("Open a private chat with me to view your summary.");
    return true;
  }
  const from = message.from;
  if (from) {
    await resolveChannelUser({
      name: [from.firstName, from.lastName].filter(Boolean).join(" ") || from.username,
      provider: "telegram",
      providerUserId: from.id,
    });
    await saveChannelThreadId({
      provider: "telegram",
      providerUserId: String(from.id),
      threadId: String(message.chat.id),
    });
  }
  const url = telegramSummaryMiniAppUrl();
  if (!url) {
    await ctx.telegram.sendMessage("The summary page is not configured yet.");
    return true;
  }
  await ensureSummaryMenuButton(ctx);
  await ctx.telegram.post({
    reply_markup: {
      inline_keyboard: [[{ text: "Open summary", web_app: { url } }]],
    },
    text: "Open your nutrition summary.",
  });
  return true;
}

async function ensureSummaryMenuButton(ctx: TelegramContext): Promise<void> {
  const url = telegramSummaryMiniAppUrl();
  if (!url) {
    return;
  }
  try {
    await ctx.telegram.request("setChatMenuButton", {
      chat_id: ctx.telegram.chatId,
      menu_button: {
        text: "Summary",
        type: "web_app",
        web_app: { url },
      },
    });
  } catch {
    return;
  }
}
