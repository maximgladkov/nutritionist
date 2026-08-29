import { createTelegramFetchFile, telegramChannel } from "eve/channels/telegram";
import type { TelegramMessage } from "eve/channels/telegram";
import { handleChannelLink, resolveChannelUser } from "../lib/channel-identity";
import { markdownToTelegramHtml, telegramHtmlMessage } from "../../lib/telegram-html";
import { attachTelegramVision } from "../../lib/telegram-vision";
import { appPrincipal } from "../../lib/principal";

const credentials = {
  botToken: () => process.env.TELEGRAM_BOT_TOKEN!,
};

export default attachTelegramVision(
  telegramChannel({
    credentials,
    events: {
      async "message.completed"(data, channel) {
        if (!data.message) {
          return;
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
      if (!shouldDispatchTelegramMessage(message, ctx.telegram.botUsername)) {
        return null;
      }
      await ctx.telegram.startTyping();
      const user = await resolveChannelUser({
        provider: "telegram",
        providerUserId: from.id,
        name: [from.firstName, from.lastName].filter(Boolean).join(" ") || from.username,
      });
      return { auth: appPrincipal(user.id, "telegram") };
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
