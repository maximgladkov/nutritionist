import type { UserContent } from "ai";
import type { ChannelSendOptions, ChannelSource } from "eve/channels";

export async function sendTelegramLastMessageTurn<TState>(
  source: ChannelSource<TState>,
  message: string | UserContent,
  options: ChannelSendOptions<TState>,
) {
  await source.clear();
  return source.send(message, options);
}

export function wrapTelegramLastMessageSend<TState>(source: ChannelSource<TState>): ChannelSource<TState> {
  return {
    ...source,
    send(message, options) {
      return sendTelegramLastMessageTurn(source, message, options);
    },
  };
}
