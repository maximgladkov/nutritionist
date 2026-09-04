import {
  abandonPendingAgentTurnAck,
  completePendingAgentTurnAck,
  loadPendingAgentTurnAckClaim,
  reservePendingAgentTurnAck,
  type PendingAgentTurnAck,
} from "./agent-turn-ack.ts";
import type { AgentTurnStatus } from "./agent-turn-model.ts";
import {
  applyAckMessage,
  loadAgentTurnAckDelivery,
  patchAgentTurnTranscript,
} from "./agent-turns.ts";
import { enqueueAgentTurnPersist } from "./agent-turn-persist.ts";
import {
  TELEGRAM_ACK_TURN_CONTEXT,
  generateTelegramAckText,
  telegramAckErrorMessage,
  type TelegramAckGeneration,
  type TelegramAckInput,
} from "./telegram-ack.ts";

type TelegramAckSender = {
  sendMessage: (message: string) => Promise<unknown>;
};

const replyPostedTurns = new Set<string>();

export type TelegramAckTurnStore = {
  abandon(id: string): Promise<void>;
  attachToTurn(sessionId: string, turnId: string, ack: PendingAgentTurnAck): Promise<void>;
  complete(id: string, ack: TelegramAckGeneration): Promise<{
    sessionId: string | null;
    turnId: string | null;
  } | null>;
  deliveryAllowed(id: string): Promise<boolean>;
  reserve(userId: string): Promise<string>;
};

export function telegramAckTurnKey(sessionId: string, turnId: string) {
  return `${sessionId}:${turnId}`;
}

export function markTelegramTurnReplyPosted(sessionId: string, turnId: string): void {
  replyPostedTurns.add(telegramAckTurnKey(sessionId, turnId));
}

export function telegramTurnReplyPosted(sessionId: string, turnId: string): boolean {
  return replyPostedTurns.has(telegramAckTurnKey(sessionId, turnId));
}

export function resetTelegramTurnReplyPosted(): void {
  replyPostedTurns.clear();
}

export function shouldDeliverTelegramAck(input: {
  hasAssistant: boolean;
  replyPosted: boolean;
  status: AgentTurnStatus | null;
}): boolean {
  if (input.replyPosted) {
    return false;
  }
  if (input.status === null) {
    return true;
  }
  if (input.status !== "running") {
    return false;
  }
  return !input.hasAssistant;
}

export function prismaTelegramAckTurnStore(): TelegramAckTurnStore {
  return {
    abandon: abandonPendingAgentTurnAck,
    async attachToTurn(sessionId, turnId, ack) {
      await enqueueAgentTurnPersist(sessionId, turnId, async () => {
        await patchAgentTurnTranscript(
          { channel: "telegram", model: ack.model, sessionId, turnId },
          (transcript) => applyAckMessage(transcript, ack),
        );
      });
    },
    async complete(id, ack) {
      const filled = await completePendingAgentTurnAck({
        cacheReadTokens: ack.cacheReadTokens,
        cacheWriteTokens: ack.cacheWriteTokens,
        costUsd: ack.costUsd,
        id,
        inputTokens: ack.inputTokens,
        model: ack.model,
        outputTokens: ack.outputTokens,
        text: ack.text,
      });
      if (!filled) {
        return null;
      }
      return { sessionId: filled.sessionId, turnId: filled.turnId };
    },
    deliveryAllowed: telegramAckDeliveryAllowed,
    reserve: (userId) => reservePendingAgentTurnAck({ channel: "telegram", userId }),
  };
}

export async function telegramAckDeliveryAllowed(pendingId: string): Promise<boolean> {
  const claim = await loadPendingAgentTurnAckClaim(pendingId);
  if (claim === null) {
    return false;
  }
  if (claim.sessionId === null || claim.turnId === null) {
    return true;
  }
  if (telegramTurnReplyPosted(claim.sessionId, claim.turnId)) {
    return false;
  }
  const turn = await loadAgentTurnAckDelivery(claim.sessionId, claim.turnId);
  return shouldDeliverTelegramAck({
    hasAssistant: turn?.hasAssistant ?? false,
    replyPosted: false,
    status: turn?.status ?? null,
  });
}

export async function startTelegramAckTurn(input: {
  generate: Promise<TelegramAckGeneration | { error: string }>;
  store?: TelegramAckTurnStore;
  telegram: TelegramAckSender;
  userId: string;
}): Promise<{ context: readonly string[]; settled: Promise<void> }> {
  const store = input.store ?? prismaTelegramAckTurnStore();
  const pendingId = await store.reserve(input.userId);
  const settled = settleTelegramAckTurn({
    generate: input.generate,
    pendingId,
    store,
    telegram: input.telegram,
  });
  void settled;
  return { context: [TELEGRAM_ACK_TURN_CONTEXT], settled };
}

export async function generateTelegramAckOrFalse(
  input: TelegramAckInput,
): Promise<TelegramAckGeneration | { error: string }> {
  try {
    return await generateTelegramAckText(input);
  } catch (error) {
    console.error("telegram ack failed", error);
    return { error: telegramAckErrorMessage(error) };
  }
}

export async function settleTelegramAckTurn(input: {
  generate: Promise<TelegramAckGeneration | { error: string }>;
  pendingId: string;
  store: TelegramAckTurnStore;
  telegram: TelegramAckSender;
}): Promise<void> {
  const ack = await input.generate.catch((error) => {
    console.error("telegram ack failed", error);
    return { error: telegramAckErrorMessage(error) };
  });
  const deliver = await input.store.deliveryAllowed(input.pendingId).catch(() => true);
  if (!("text" in ack)) {
    if (deliver) {
      try {
        await input.telegram.sendMessage(`Quick reply failed: ${ack.error}`);
      } catch (deliveryError) {
        console.error("telegram ack error delivery failed", deliveryError);
      }
    }
    await input.store.abandon(input.pendingId);
    return;
  }
  if (deliver) {
    try {
      await input.telegram.sendMessage(ack.text);
    } catch (deliveryError) {
      console.error("telegram ack error delivery failed", deliveryError);
    }
  }
  const claimed = await input.store.complete(input.pendingId, ack);
  if (claimed?.sessionId && claimed.turnId) {
    const pending: PendingAgentTurnAck = {
      at: new Date().toISOString(),
      cacheReadTokens: ack.cacheReadTokens,
      cacheWriteTokens: ack.cacheWriteTokens,
      costUsd: ack.costUsd,
      inputTokens: ack.inputTokens,
      model: ack.model,
      outputTokens: ack.outputTokens,
      text: ack.text,
    };
    await input.store.attachToTurn(claimed.sessionId, claimed.turnId, pending);
  }
}
