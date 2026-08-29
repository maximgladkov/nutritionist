import { createTelegramFetchFile, telegramChannel } from "eve/channels/telegram";
import type { TelegramContext, TelegramMessage } from "eve/channels/telegram";
import { handleChannelLink, resolveChannelUser, saveChannelThreadId } from "../lib/channel-identity";
import { telegramSummaryMiniAppUrl } from "../../lib/app-url";
import { TELEGRAM_ACK_TURN_CONTEXT, postTelegramAck, telegramAckVisibleUserText } from "../../lib/telegram-ack";
import { appendTelegramAckHistory, loadTelegramAckHistory } from "../../lib/telegram-ack-history";
import { claimTelegramMessage } from "../../lib/telegram-message-claim";
import { markdownToTelegramHtml, telegramHtmlMessage } from "../../lib/telegram-html";
import { attachTelegramVision } from "../../lib/telegram-vision";
import { appPrincipal } from "../../lib/principal";

const credentials = {
  botToken: () => process.env.TELEGRAM_BOT_TOKEN!,
};

export default attachTelegramVision(
  telegramChannel({
    credentials,
    turnPolicy: "queue",
    events: {
      async "message.completed"(data, channel) {
        if (data.finishReason === "tool-calls" || !data.message) {
          return;
        }
        const userId = channel.state.triggeringUserId;
        if (userId) {
          void appendTelegramAckHistory(userId, [{ role: "assistant", text: data.message }]);
        }
        const html = markdownToTelegramHtml(data.message);
        try {
          await channel.telegram.post(telegramHtmlMessage(html));
        } catch {
          await channel.telegram.post(data.message);
        }
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
      const userText = telegramAckVisibleUserText(message);
      const ackPosted = loadTelegramAckHistory(from.id).then((history) =>
        postTelegramAck(ctx.telegram, {
          caption: message.caption,
          hasFiles: message.attachments.length > 0,
          history,
          languageCode: from.languageCode,
          text: message.text,
        }),
      );
      void appendTelegramAckHistory(from.id, [
        { role: "user", text: userText.length > 0 ? userText : "(attached file)" },
      ]);
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
      const posted = await ackPosted.catch(() => false);
      return {
        auth: appPrincipal(user.id, "telegram"),
        ...(posted ? { context: [TELEGRAM_ACK_TURN_CONTEXT] } : {}),
      };
    },
  }),
  createTelegramFetchFile({
    credentials,
    policy: { allowedMediaTypes: "*", maxBytes: 25 * 1024 * 1024 },
  }),
);

function shouldDispatchTelegramMessage(message: TelegramMessage, botUsername: string | undefined) {
  if (message.from?.isBot === true || message.chat.type === "channel") {
    return false;
  }
  const text = message.text || message.caption;
  if (text.trim().length === 0 && message.attachments.length === 0) {
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
