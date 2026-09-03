import type {
  Channel,
  ChannelFrom,
  ChannelReceiveContext,
  ChannelSource,
  RouteDefinition,
} from "eve/channels";
import {
  conversationMessageText,
  loadRecentConversation,
  persistTelegramConversationMessage,
  TELEGRAM_CONVERSATION_CHANNEL,
} from "./conversation.ts";
import { settleTelegramTurn, wrapTelegramLastMessageSend } from "./telegram-last-message-turn.ts";

export function wrapTelegramLastMessageChannel<TState, TReceiveTarget, TMetadata extends Record<string, unknown>>(
  channel: Channel<TState, TReceiveTarget, TMetadata>,
): Channel<TState, TReceiveTarget, TMetadata> {
  return {
    ...channel,
    receive: wrapTelegramReceive(channel.receive),
    routes: channel.routes.map((route) => wrapTelegramRoute(route)),
  };
}

export function wrapTelegramLastMessageSource<TState>(
  source: ChannelSource<TState>,
  address: string,
): ChannelSource<TState> {
  const lastMessage = wrapTelegramLastMessageSend(source, {
    address,
    loadRecentContext: (userId) =>
      loadRecentConversation({
        channel: TELEGRAM_CONVERSATION_CHANNEL,
        userId,
      }),
  });
  return {
    ...lastMessage,
    async send(message, options) {
      const session = await lastMessage.send(message, options);
      const userId = options.auth?.principalType === "user" ? options.auth.principalId : undefined;
      await persistTelegramConversationMessage({
        role: "user",
        sessionId: session.id,
        text: conversationMessageText(message),
        userId,
      });
      return session;
    },
  };
}

export { settleTelegramTurn };

function wrapTelegramReceive<TState, TReceiveTarget>(
  receive: Channel<TState, TReceiveTarget>["receive"],
): Channel<TState, TReceiveTarget>["receive"] {
  if (receive === undefined) {
    return undefined;
  }
  return (input, ctx: ChannelReceiveContext<TState>) =>
    receive(input, {
      ...ctx,
      from: wrapTelegramFrom(ctx.from),
    });
}

function wrapTelegramRoute<TState>(route: RouteDefinition<TState>): RouteDefinition<TState> {
  if (route.transport === "websocket") {
    return route;
  }
  return {
    ...route,
    handler: (request, args) =>
      route.handler(request, {
        ...args,
        from: wrapTelegramFrom(args.from),
      }),
  };
}

function wrapTelegramFrom<TState>(from: ChannelFrom<TState>): ChannelFrom<TState> {
  return (address) => wrapTelegramLastMessageSource(from(address), address);
}
