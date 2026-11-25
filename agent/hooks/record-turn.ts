import { defineHook } from "eve/hooks";
import type { HookContext } from "eve/hooks";
import { call, failure, runs, type UserPart } from "eve/events";
import { attachedPhotoLink } from "../../lib/assistant/photos";
import { resolveAuthenticatedUserId } from "../../lib/identity";
import { ASK_QUESTION_TOOL } from "../../lib/tool-categories";
import { markLatency, sessionLatencyKey } from "../../lib/latency-log";
import { prisma } from "../../lib/prisma";
import { claimPendingAgentTurnAck } from "../../lib/agent-turn-ack";
import {
  applyAckMessage,
  applyAssistantMessage,
  applyStepCompleted,
  applyStepStarted,
  applyToolRequested,
  applyToolResult,
  applyUserMessage,
  drainAgentTurnPersist,
  enqueueAgentTurnPersist,
  finalizeAgentTurn,
  patchAgentTurnTranscript,
  peekAgentTurnModel,
  rememberAgentTurnModel,
  startAgentTurn,
  turnChannel,
  type AgentTurnUserPart,
} from "../../lib/agent-turns";
import { filesForTurnMediaPersist, schedulePersistTurnMedia } from "../../lib/persist-turn-media";

export default defineHook({
  events: {
    "turn.started"(event, ctx) {
      const { turnId } = event.data;
      markLatency(sessionLatencyKey(ctx.session.id), "turn.started", { turnId });
      persistTurnEvent("turn.started", ctx, turnId, async (scope) => {
        await startAgentTurn({
          channel: scope.channel,
          sessionId: scope.sessionId,
          startedAt: scope.at,
          turnId: scope.turnId,
          turnSequence: scope.turnSequence,
          userId: scope.userId,
        });
        const pending = await claimPendingAgentTurnAck({
          channel: scope.channel,
          sessionId: scope.sessionId,
          startedAt: scope.at,
          turnId: scope.turnId,
          userId: scope.userId,
        });
        if (pending) {
          await patchAgentTurnTranscript(scope, (transcript) => applyAckMessage(transcript, pending));
        }
      });
    },
    "delivery.consumed"(event, ctx) {
      const said = event.data.parts;
      if (said.length === 0) {
        return;
      }
      const parts = receivedParts(said);
      persistTurnEvent("delivery.consumed", ctx, event.data.turnId, async (scope) => {
        await patchAgentTurnTranscript(scope, (transcript) =>
          // An answer to what the coach asked is kept with the question.
          transcript.items.some((item) => item.type === "tool" && item.toolName === ASK_QUESTION_TOOL) ? transcript : applyUserMessage(transcript, {
            at: scope.at.toISOString(),
            parts,
            text: said
              .map((part) => (part.kind === "text" ? part.text : `[file: ${part.filename ?? part.mediaType} (${part.mediaType})]`))
              .join("\n"),
          }),
        );
        schedulePersistTurnMedia({
          channel: scope.channel,
          files: filesForTurnMediaPersist(scope.sessionId, parts),
          sessionId: scope.sessionId,
          turnId: scope.turnId,
          userId: scope.userId,
        });
      });
    },
    "model.started"(event, ctx) {
      const { runId } = event.data;
      // Models are named as the gateway lists them.
      const modelId = event.data.modelId.replace(/^gateway\//u, "");
      const step = stepOf(ctx, runId);
      if (!step) {
        return;
      }
      if (step.stepIndex === 0) {
        markLatency(sessionLatencyKey(ctx.session.id), "step.started", { model: modelId, stepIndex: 0 });
      }
      rememberAgentTurnModel(ctx.session.id, step.turnId, modelId);
      persistTurnEvent("model.started", ctx, step.turnId, async (scope) => {
        await patchAgentTurnTranscript({ ...scope, model: modelId }, (transcript) =>
          applyStepStarted(transcript, { model: modelId, stepIndex: step.stepIndex }),
        );
      });
    },
    "call.requested"(event, ctx) {
      const { callId, capability, input, owner } = event.data;
      const step = "runId" in owner ? stepOf(ctx, owner.runId) : null;
      if (!step) {
        return;
      }
      persistTurnEvent("call.requested", ctx, step.turnId, async (scope) => {
        await patchAgentTurnTranscript(scope, (transcript) =>
          applyToolRequested(transcript, {
            at: scope.at.toISOString(),
            callId,
            stepIndex: step.stepIndex,
            toolInput: input,
            toolName: capability.name,
          }),
        );
      });
    },
    "call.settled"(event, ctx) {
      const { callId, error, outcome, output } = event.data;
      const observed = call(ctx.view, callId);
      const step = observed?.runId ? stepOf(ctx, observed.runId) : null;
      if (!observed || !step) {
        return;
      }
      persistTurnEvent("call.settled", ctx, step.turnId, async (scope) => {
        await patchAgentTurnTranscript(scope, (transcript) =>
          applyToolResult(transcript, {
            at: scope.at.toISOString(),
            callId,
            isError: outcome !== "completed",
            output: output ?? error?.message,
            stepIndex: step.stepIndex,
            toolName: observed.name,
          }),
        );
      });
    },
    "content.completed"(event, ctx) {
      const { kind, phase, runId, value } = event.data;
      const step = runId ? stepOf(ctx, runId) : null;
      const text = kind === "text" && typeof value === "string" ? value.trim() : "";
      if (!step || !text) {
        return;
      }
      // What's said on the way to using a tool is narration, not the answer.
      const finishReason = phase === "reply" ? "stop" : "tool-calls";
      markLatency(sessionLatencyKey(ctx.session.id), "message.completed", { finishReason, stepIndex: step.stepIndex });
      persistTurnEvent("content.completed", ctx, step.turnId, async (scope) => {
        await patchAgentTurnTranscript(scope, (transcript) =>
          applyAssistantMessage(transcript, {
            at: scope.at.toISOString(),
            finishReason,
            stepIndex: step.stepIndex,
            text,
          }),
        );
      });
    },
    "usage.recorded"(event, ctx) {
      const { owner, usage } = event.data;
      const step = owner && "runId" in owner ? stepOf(ctx, owner.runId) : null;
      if (!step) {
        return;
      }
      persistTurnEvent("usage.recorded", ctx, step.turnId, async (scope) => {
        const model = peekAgentTurnModel(ctx.session.id, step.turnId) ?? "unknown";
        await patchAgentTurnTranscript({ ...scope, model }, (transcript) =>
          applyStepCompleted(transcript, { ...usage, model, stepIndex: step.stepIndex }),
        );
      });
    },
    async "turn.settled"(event, ctx) {
      const { error, outcome, turnId } = event.data;
      const failed = outcome === "failed" ? (error ?? failure(ctx.view, turnId)) : undefined;
      persistTurnEvent("turn.settled", ctx, turnId, async (scope) => {
        await finalizeAgentTurn({
          endedAt: scope.at,
          ...(failed ? { errorCode: failed.code, errorMessage: failed.message } : {}),
          sessionId: ctx.session.id,
          status: outcome,
          turnId,
        });
      });
      await drainAgentTurnPersist(ctx.session.id, turnId);
    },
  },
});

// The turn a model run belongs to, and which of its model calls it is.
function stepOf(ctx: HookContext, runId: string): { stepIndex: number; turnId: string } | null {
  const turnId = runs(ctx.view).find((run) => run.runId === runId)?.turnId;
  if (!turnId) {
    return null;
  }
  return { stepIndex: runs(ctx.view, { turnId }).findIndex((run) => run.runId === runId), turnId };
}

type TurnScope = {
  at: Date;
  channel: string;
  sessionId: string;
  turnId: string;
  turnSequence: number;
  userId: string | null;
};

function persistTurnEvent(
  event: string,
  ctx: HookContext,
  turnId: string,
  work: (scope: TurnScope) => Promise<void>,
): Promise<void> {
  return enqueueAgentTurnPersist(ctx.session.id, turnId, async () => {
    await runQuietly(event, async () => {
      const scope = await turnScope(ctx, turnId);
      await work(scope);
    });
  });
}

async function turnScope(
  ctx: HookContext,
  turnId: string,
): Promise<TurnScope> {
  return {
    at: ctx.now,
    channel: turnChannel(
      ctx.channel.kind,
      (ctx.session.auth.current ?? ctx.session.auth.initiator)?.attributes,
    ),
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

function receivedParts(parts: readonly UserPart[]): AgentTurnUserPart[] {
  return parts.map((part): AgentTurnUserPart => {
    if (part.kind === "text") {
      return { text: part.text, type: "text" };
    }
    const photo = attachedPhotoLink(part.filename);
    return {
      filename: photo ? undefined : part.filename,
      mediaType: part.mediaType,
      size: part.size,
      type: "file",
      url: photo ?? part.url,
    };
  });
}

async function runQuietly(event: string, work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (error) {
    console.error(`agent turn persist failed (${event})`, error);
  }
}
