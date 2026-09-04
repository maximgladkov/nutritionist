import { defineHook } from "eve/hooks";
import type { HookContext } from "eve/hooks";
import { resolveAuthenticatedUserId } from "../../lib/identity";
import { prisma } from "../../lib/prisma";
import { consumePendingAgentTurnAck } from "../../lib/agent-turn-ack";
import {
  applyAckMessage,
  applyAssistantMessage,
  applyStepCompleted,
  applyStepStarted,
  applyToolRequested,
  applyToolResult,
  applyUserMessage,
  finalizeAgentTurn,
  findAgentTurnModel,
  normalizeChannelKind,
  patchAgentTurnTranscript,
  startAgentTurn,
  toolCallsFromActions,
  toolResultFromAction,
  type AgentTurnUserPart,
} from "../../lib/agent-turns";

export default defineHook({
  events: {
    async "turn.started"(event, ctx) {
      await runQuietly("turn.started", async () => {
        const scope = await turnScope(ctx, event.data.turnId, event.meta.at);
        await startAgentTurn({
          channel: scope.channel,
          sessionId: scope.sessionId,
          startedAt: scope.at,
          turnId: scope.turnId,
          turnSequence: scope.turnSequence,
          userId: scope.userId,
        });
        const pending = await consumePendingAgentTurnAck({
          channel: scope.channel,
          userId: scope.userId,
        });
        if (pending) {
          await patchAgentTurnTranscript(scope, (transcript) => applyAckMessage(transcript, pending));
        }
      });
    },
    async "message.received"(event, ctx) {
      await runQuietly("message.received", async () => {
        const scope = await turnScope(ctx, event.data.turnId, event.meta.at);
        await patchAgentTurnTranscript(scope, (transcript) =>
          applyUserMessage(transcript, {
            at: event.meta.at,
            parts: receivedParts(event.data.parts),
            text: event.data.message,
          }),
        );
      });
    },
    async "step.started"(event, ctx) {
      await runQuietly("step.started", async () => {
        const scope = await turnScope(ctx, event.data.turnId, event.meta.at);
        await patchAgentTurnTranscript(
          { ...scope, model: event.data.modelId },
          (transcript) => applyStepStarted(transcript, {
            model: event.data.modelId,
            stepIndex: event.data.stepIndex,
          }),
        );
      });
    },
    async "actions.requested"(event, ctx) {
      await runQuietly("actions.requested", async () => {
        const scope = await turnScope(ctx, event.data.turnId, event.meta.at);
        await patchAgentTurnTranscript(scope, (transcript) => {
          let next = transcript;
          for (const call of toolCallsFromActions(event.data.actions)) {
            next = applyToolRequested(next, {
              at: event.meta.at,
              callId: call.callId,
              stepIndex: event.data.stepIndex,
              toolInput: call.toolInput,
              toolName: call.toolName,
            });
          }
          return next;
        });
      });
    },
    async "action.result"(event, ctx) {
      await runQuietly("action.result", async () => {
        const extracted = toolResultFromAction(event.data.result);
        if (!extracted) {
          return;
        }
        const scope = await turnScope(ctx, event.data.turnId, event.meta.at);
        await patchAgentTurnTranscript(scope, (transcript) =>
          applyToolResult(transcript, {
            at: event.meta.at,
            callId: extracted.callId,
            isError: extracted.isError,
            output: extracted.output,
            stepIndex: event.data.stepIndex,
            toolName: extracted.toolName,
          }),
        );
      });
    },
    async "message.completed"(event, ctx) {
      await runQuietly("message.completed", async () => {
        const text = event.data.message?.trim() ?? "";
        if (text.length === 0) {
          return;
        }
        const scope = await turnScope(ctx, event.data.turnId, event.meta.at);
        await patchAgentTurnTranscript(scope, (transcript) =>
          applyAssistantMessage(transcript, {
            at: event.meta.at,
            finishReason: event.data.finishReason,
            stepIndex: event.data.stepIndex,
            text,
          }),
        );
      });
    },
    async "step.completed"(event, ctx) {
      await runQuietly("step.completed", async () => {
        const existing = await findAgentTurnModel(ctx.session.id, event.data.turnId);
        const scope = await turnScope(ctx, event.data.turnId, event.meta.at);
        const model = existing?.model ?? "unknown";
        await patchAgentTurnTranscript({ ...scope, model }, (transcript) =>
          applyStepCompleted(transcript, {
            cacheReadTokens: event.data.usage?.cacheReadTokens,
            cacheWriteTokens: event.data.usage?.cacheWriteTokens,
            costUsd: event.data.usage?.costUsd,
            inputTokens: event.data.usage?.inputTokens,
            model,
            outputTokens: event.data.usage?.outputTokens,
            stepIndex: event.data.stepIndex,
          }),
        );
      });
    },
    async "turn.completed"(event, ctx) {
      await runQuietly("turn.completed", async () => {
        await finalizeAgentTurn({
          endedAt: new Date(event.meta.at),
          sessionId: ctx.session.id,
          status: "completed",
          turnId: event.data.turnId,
        });
      });
    },
    async "turn.failed"(event, ctx) {
      await runQuietly("turn.failed", async () => {
        await finalizeAgentTurn({
          endedAt: new Date(event.meta.at),
          errorCode: event.data.code,
          errorMessage: event.data.message,
          sessionId: ctx.session.id,
          status: "failed",
          turnId: event.data.turnId,
        });
      });
    },
    async "turn.cancelled"(event, ctx) {
      await runQuietly("turn.cancelled", async () => {
        await finalizeAgentTurn({
          endedAt: new Date(event.meta.at),
          sessionId: ctx.session.id,
          status: "cancelled",
          turnId: event.data.turnId,
        });
      });
    },
  },
});

type TurnScope = {
  at: Date;
  channel: string;
  sessionId: string;
  turnId: string;
  turnSequence: number;
  userId: string | null;
};

async function turnScope(
  ctx: HookContext,
  turnId: string,
  at: string,
): Promise<TurnScope> {
  return {
    at: new Date(at),
    channel: normalizeChannelKind(ctx.channel.kind),
    sessionId: ctx.session.id,
    turnId,
    turnSequence: ctx.session.turn.sequence,
    userId: await resolveTurnUserId(ctx),
  };
}

async function resolveTurnUserId(ctx: HookContext): Promise<string | null> {
  const caller = ctx.session.auth.current ?? ctx.session.auth.initiator;
  if (caller?.principalType === "user" && caller.principalId && caller.principalId !== "local-dev") {
    const userId = await resolveAuthenticatedUserId({
      eveSessionId: ctx.session.id,
      principalId: caller.principalId,
    });
    if (userId) {
      return userId;
    }
  }
  const mapped = await prisma["agentSession"].findUnique({
    select: { userId: true },
    where: { eveSessionId: ctx.session.id },
  });
  return mapped?.userId ?? null;
}

function receivedParts(parts: readonly { filename?: string; mediaType?: string; text?: string; type: string; url?: string; size?: number }[] | undefined): AgentTurnUserPart[] | undefined {
  if (parts === undefined || parts.length === 0) {
    return undefined;
  }
  return parts.map((part) => ({
    filename: part.filename,
    mediaType: part.mediaType,
    size: part.size,
    text: part.text,
    type: part.type,
    url: part.url,
  }));
}

async function runQuietly(event: string, work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (error) {
    console.error(`agent turn persist failed (${event})`, error);
  }
}
