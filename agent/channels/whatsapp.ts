import { createWhatsAppAdapter } from "@chat-adapter/whatsapp";
import type { Message, Thread } from "chat";
import { chatSdkChannel, messageToUserContent } from "eve/channels/chat-sdk";
import { handleChannelLink, resolveChannelUser, saveChannelThreadId } from "../lib/channel-identity";
import { createPrismaChatState } from "../lib/chat-sdk-state";
import { APP_NAME } from "../../lib/brand";
import { appPrincipal } from "../../lib/principal";

export const { bot, channel, send } = chatSdkChannel({
  userName: APP_NAME,
  adapters: {
    whatsapp: createWhatsAppAdapter({
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN || "unconfigured",
      appSecret: process.env.WHATSAPP_APP_SECRET || "unconfigured",
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "0",
      verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || "unconfigured",
    }),
  },
  state: createPrismaChatState(),
});

async function dispatchWhatsApp(thread: Thread, message: Message) {
  if (message.author.isBot === true || message.author.isMe) {
    return;
  }
  const linkReply = await handleChannelLink({
    provider: "whatsapp",
    providerUserId: message.author.userId,
    name: message.author.fullName,
    text: message.text,
  });
  if (linkReply) {
    await thread.post(linkReply);
    return;
  }
  const user = await resolveChannelUser({
    provider: "whatsapp",
    providerUserId: message.author.userId,
    name: message.author.fullName,
  });
  const serialized = thread.toJSON() as { id?: string; channelId?: string };
  await saveChannelThreadId({
    provider: "whatsapp",
    providerUserId: message.author.userId,
    threadId: serialized.id ?? serialized.channelId ?? thread.channelId,
  });
  await send(messageToUserContent(message), {
    auth: appPrincipal(user.id, "whatsapp"),
    thread,
  });
}

bot.onNewMention(async (thread: Thread, message: Message) => {
  await thread.subscribe();
  await dispatchWhatsApp(thread, message);
});

bot.onSubscribedMessage(async (thread: Thread, message: Message) => {
  await dispatchWhatsApp(thread, message);
});

export default channel;
