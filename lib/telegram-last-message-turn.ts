import type { UserContent } from "ai";
import type { ChannelSendOptions, ChannelSource } from "eve/channels";

export type TelegramTurnTracker = {
  begin(address: string): boolean;
  enqueue<T>(address: string, work: () => Promise<T>): Promise<T>;
  settle(address: string): void;
};

export function createTelegramTurnTracker(): TelegramTurnTracker {
  const counts = new Map<string, number>();
  const tails = new Map<string, Promise<void>>();
  return {
    begin(address) {
      const previous = counts.get(address) ?? 0;
      counts.set(address, previous + 1);
      return previous > 0;
    },
    enqueue(address, work) {
      if (address.length === 0) {
        return work();
      }
      const previous = tails.get(address) ?? Promise.resolve();
      const current = previous.then(work, work);
      tails.set(
        address,
        current.then(
          () => undefined,
          () => undefined,
        ),
      );
      return current;
    },
    settle(address) {
      if (address.length === 0) {
        return;
      }
      const previous = counts.get(address) ?? 0;
      if (previous <= 1) {
        counts.delete(address);
        return;
      }
      counts.set(address, previous - 1);
    },
  };
}

export const telegramTurnTracker = createTelegramTurnTracker();

export function settleTelegramTurn(address: string | undefined) {
  if (address === undefined || address.length === 0) {
    return;
  }
  telegramTurnTracker.settle(address);
}

export async function sendTelegramLastMessageTurn<TState>(
  source: ChannelSource<TState>,
  message: string | UserContent,
  options: ChannelSendOptions<TState>,
  extras?: {
    overlapping?: boolean;
    recentContext?: string;
  },
) {
  if (extras?.overlapping !== true) {
    await source.clear();
  }
  const context = [
    ...(options.context ?? []),
    ...(extras?.recentContext !== undefined && extras.recentContext.length > 0
      ? [extras.recentContext]
      : []),
  ];
  return source.send(message, context.length > 0 ? { ...options, context } : options);
}

export function wrapTelegramLastMessageSend<TState>(
  source: ChannelSource<TState>,
  input?: {
    address?: string;
    loadRecentContext?: (userId: string) => Promise<string | undefined>;
    tracker?: TelegramTurnTracker;
  },
): ChannelSource<TState> {
  const tracker = input?.tracker ?? telegramTurnTracker;
  const address = input?.address ?? "";
  return {
    ...source,
    async send(message, options) {
      const overlapping = address.length > 0 ? tracker.begin(address) : false;
      return tracker.enqueue(address, async () => {
        try {
          const recentContext =
            overlapping || input?.loadRecentContext === undefined
              ? undefined
              : await loadRecentContextForSender(options, input.loadRecentContext);
          return await sendTelegramLastMessageTurn(source, message, options, {
            overlapping,
            recentContext,
          });
        } catch (error) {
          if (address.length > 0) {
            tracker.settle(address);
          }
          throw error;
        }
      });
    },
  };
}

async function loadRecentContextForSender<TState>(
  options: ChannelSendOptions<TState>,
  loadRecentContext: (userId: string) => Promise<string | undefined>,
) {
  const userId = options.auth?.principalType === "user" ? options.auth.principalId : undefined;
  if (userId === undefined) {
    return undefined;
  }
  try {
    return await loadRecentContext(userId);
  } catch (error) {
    console.error("telegram recent conversation load failed", error);
    return undefined;
  }
}
