export const USER_PREVIEW_MAX_CHARS = 280;
export const TOOL_JSON_MAX_CHARS = 16_000;

export type AgentTurnStatus = "running" | "completed" | "failed" | "cancelled";

export type AgentTurnUserPart = {
  readonly filename?: string;
  readonly mediaType?: string;
  readonly size?: number;
  readonly text?: string;
  readonly type: string;
  readonly url?: string;
};

export type AgentTurnUserMessage = {
  readonly at: string;
  readonly parts?: readonly AgentTurnUserPart[];
  readonly text: string;
  readonly type: "user";
};

export type AgentTurnAckMessage = {
  readonly at: string;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly costUsd: number;
  readonly inputTokens: number;
  readonly model: string;
  readonly outputTokens: number;
  readonly text: string;
  readonly type: "ack";
};

export type AgentTurnAssistantMessage = {
  readonly at: string;
  readonly finishReason: string;
  readonly stepIndex: number;
  readonly text: string;
  readonly type: "assistant";
};

export type AgentTurnToolMessage = {
  readonly at: string;
  readonly callId: string;
  readonly input?: unknown;
  readonly isError?: boolean;
  readonly output?: unknown;
  readonly stepIndex: number;
  readonly text?: string;
  readonly toolName: string;
  readonly type: "tool";
};

export type AgentTurnMessage =
  | AgentTurnAckMessage
  | AgentTurnAssistantMessage
  | AgentTurnToolMessage
  | AgentTurnUserMessage;

export type AgentTurnStepUsage = {
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly costUsd: number;
  readonly inputTokens: number;
  readonly model: string;
  readonly outputTokens: number;
  readonly stepIndex: number;
};

export type AgentTurnTranscript = {
  readonly items: readonly AgentTurnMessage[];
  readonly steps: readonly AgentTurnStepUsage[];
};

export type AgentTurnUsageSummary = {
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly costUsd: number;
  readonly inputTokens: number;
  readonly model: string | null;
  readonly outputTokens: number;
  readonly userPreview: string | null;
};

export function emptyTranscript(): AgentTurnTranscript {
  return { items: [], steps: [] };
}

export function parseTranscript(value: unknown): AgentTurnTranscript {
  if (Array.isArray(value)) {
    return {
      items: value.filter(isTurnMessage),
      steps: [],
    };
  }
  if (value === null || typeof value !== "object") {
    return emptyTranscript();
  }
  const record = value as { items?: unknown; steps?: unknown };
  return {
    items: Array.isArray(record.items) ? record.items.filter(isTurnMessage) : [],
    steps: Array.isArray(record.steps) ? record.steps.filter(isStepUsage) : [],
  };
}

export function normalizeChannelKind(kind: string | undefined): string {
  if (kind === undefined || kind === "eve" || kind === "http") {
    return "web";
  }
  if (kind.startsWith("channel:")) {
    return kind.slice("channel:".length);
  }
  return kind;
}

export function clipJson(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return { preview: "[unserializable]", truncated: true };
  }
  if (serialized === undefined) {
    return undefined;
  }
  if (serialized.length <= TOOL_JSON_MAX_CHARS) {
    return value;
  }
  return { preview: serialized.slice(0, TOOL_JSON_MAX_CHARS), truncated: true };
}

export function applyUserMessage(
  transcript: AgentTurnTranscript,
  input: { at: string; parts?: readonly AgentTurnUserPart[]; text: string },
): AgentTurnTranscript {
  const items = [...transcript.items];
  const next: AgentTurnUserMessage = {
    at: input.at,
    parts: input.parts,
    text: input.text,
    type: "user",
  };
  const insertAt = items.findIndex((item) => item.type !== "user");
  if (insertAt === -1) {
    items.push(next);
  } else {
    items.splice(insertAt, 0, next);
  }
  return { ...transcript, items };
}

export function applyAckMessage(
  transcript: AgentTurnTranscript,
  input: {
    at: string;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    costUsd?: number;
    inputTokens?: number;
    model: string;
    outputTokens?: number;
    text: string;
  },
): AgentTurnTranscript {
  if (transcript.items.some((item) => item.type === "ack")) {
    return transcript;
  }
  const items = [...transcript.items];
  const next: AgentTurnAckMessage = {
    at: input.at,
    cacheReadTokens: input.cacheReadTokens ?? 0,
    cacheWriteTokens: input.cacheWriteTokens ?? 0,
    costUsd: input.costUsd ?? 0,
    inputTokens: input.inputTokens ?? 0,
    model: input.model,
    outputTokens: input.outputTokens ?? 0,
    text: input.text,
    type: "ack",
  };
  const insertAt = items.findIndex((item) => item.type !== "user");
  if (insertAt === -1) {
    items.push(next);
  } else {
    items.splice(insertAt, 0, next);
  }
  return { ...transcript, items };
}

export function applyAssistantMessage(
  transcript: AgentTurnTranscript,
  input: { at: string; finishReason: string; stepIndex: number; text: string },
): AgentTurnTranscript {
  return {
    ...transcript,
    items: [
      ...transcript.items,
      {
        at: input.at,
        finishReason: input.finishReason,
        stepIndex: input.stepIndex,
        text: input.text,
        type: "assistant" as const,
      },
    ],
  };
}

export function applyToolRequested(
  transcript: AgentTurnTranscript,
  input: { at: string; callId: string; stepIndex: number; toolInput?: unknown; toolName: string },
): AgentTurnTranscript {
  if (transcript.items.some((item) => item.type === "tool" && item.callId === input.callId)) {
    return transcript;
  }
  return {
    ...transcript,
    items: [
      ...transcript.items,
      {
        at: input.at,
        callId: input.callId,
        input: clipJson(input.toolInput),
        stepIndex: input.stepIndex,
        toolName: input.toolName,
        type: "tool" as const,
      },
    ],
  };
}

export function applyToolResult(
  transcript: AgentTurnTranscript,
  input: {
    at: string;
    callId: string;
    isError?: boolean;
    output?: unknown;
    stepIndex: number;
    toolName: string;
  },
): AgentTurnTranscript {
  const clipped = clipJson(input.output);
  const items = transcript.items.map((item) => {
    if (item.type !== "tool" || item.callId !== input.callId) {
      return item;
    }
    return {
      ...item,
      isError: input.isError,
      output: clipped,
      toolName: input.toolName || item.toolName,
    };
  });
  if (items.some((item) => item.type === "tool" && item.callId === input.callId)) {
    return { ...transcript, items };
  }
  return {
    ...transcript,
    items: [
      ...items,
      {
        at: input.at,
        callId: input.callId,
        isError: input.isError,
        output: clipped,
        stepIndex: input.stepIndex,
        toolName: input.toolName,
        type: "tool" as const,
      },
    ],
  };
}

export function applyStepStarted(
  transcript: AgentTurnTranscript,
  input: { model: string; stepIndex: number },
): AgentTurnTranscript {
  const retry =
    transcript.steps.some((step) => step.stepIndex === input.stepIndex) ||
    transcript.items.some((item) => isRetryableTurnItem(item) && item.stepIndex === input.stepIndex);
  if (!retry) {
    return transcript;
  }
  return {
    items: transcript.items.filter((item) => !isRetryableTurnItem(item) || item.stepIndex < input.stepIndex),
    steps: transcript.steps.filter((step) => step.stepIndex < input.stepIndex),
  };
}

export function applyStepCompleted(
  transcript: AgentTurnTranscript,
  input: {
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    costUsd?: number;
    inputTokens?: number;
    model: string;
    outputTokens?: number;
    stepIndex: number;
  },
): AgentTurnTranscript {
  const next: AgentTurnStepUsage = {
    cacheReadTokens: input.cacheReadTokens ?? 0,
    cacheWriteTokens: input.cacheWriteTokens ?? 0,
    costUsd: input.costUsd ?? 0,
    inputTokens: input.inputTokens ?? 0,
    model: input.model,
    outputTokens: input.outputTokens ?? 0,
    stepIndex: input.stepIndex,
  };
  const without = transcript.steps.filter((step) => step.stepIndex !== input.stepIndex);
  return { ...transcript, steps: [...without, next].sort((a, b) => a.stepIndex - b.stepIndex) };
}

export function summarizeTranscript(transcript: AgentTurnTranscript): AgentTurnUsageSummary {
  const lastStep = transcript.steps.at(-1);
  const user = transcript.items.find((item) => item.type === "user");
  const acks = transcript.items.filter((item): item is AgentTurnAckMessage => item.type === "ack");
  return {
    cacheReadTokens:
      transcript.steps.reduce((sum, step) => sum + step.cacheReadTokens, 0) +
      acks.reduce((sum, ack) => sum + ack.cacheReadTokens, 0),
    cacheWriteTokens:
      transcript.steps.reduce((sum, step) => sum + step.cacheWriteTokens, 0) +
      acks.reduce((sum, ack) => sum + ack.cacheWriteTokens, 0),
    costUsd:
      transcript.steps.reduce((sum, step) => sum + step.costUsd, 0) +
      acks.reduce((sum, ack) => sum + ack.costUsd, 0),
    inputTokens:
      transcript.steps.reduce((sum, step) => sum + step.inputTokens, 0) +
      acks.reduce((sum, ack) => sum + ack.inputTokens, 0),
    model: lastStep?.model ?? null,
    outputTokens:
      transcript.steps.reduce((sum, step) => sum + step.outputTokens, 0) +
      acks.reduce((sum, ack) => sum + ack.outputTokens, 0),
    userPreview: userPreviewFrom(user?.text),
  };
}

export function toolCallsFromActions(actions: unknown): readonly {
  readonly callId: string;
  readonly toolInput?: unknown;
  readonly toolName: string;
}[] {
  if (!Array.isArray(actions)) {
    return [];
  }
  const calls: { callId: string; toolInput?: unknown; toolName: string }[] = [];
  for (const action of actions) {
    if (action === null || typeof action !== "object") {
      continue;
    }
    const record = action as {
      callId?: unknown;
      input?: unknown;
      kind?: unknown;
      name?: unknown;
      toolName?: unknown;
    };
    if (typeof record.callId !== "string") {
      continue;
    }
    const toolName =
      typeof record.toolName === "string"
        ? record.toolName
        : typeof record.name === "string"
          ? record.name
          : typeof record.kind === "string"
            ? record.kind
            : "action";
    calls.push({ callId: record.callId, toolInput: record.input, toolName });
  }
  return calls;
}

export function toolResultFromAction(result: unknown): {
  readonly callId: string;
  readonly isError?: boolean;
  readonly output?: unknown;
  readonly toolName: string;
} | null {
  if (result === null || typeof result !== "object") {
    return null;
  }
  const record = result as {
    callId?: unknown;
    isError?: unknown;
    name?: unknown;
    output?: unknown;
    subagentName?: unknown;
    toolName?: unknown;
  };
  if (typeof record.callId !== "string") {
    return null;
  }
  const toolName =
    typeof record.toolName === "string"
      ? record.toolName
      : typeof record.subagentName === "string"
        ? record.subagentName
        : typeof record.name === "string"
          ? record.name
          : "action";
  return {
    callId: record.callId,
    isError: record.isError === true,
    output: record.output,
    toolName,
  };
}

export function userPreviewFrom(text: string | undefined): string | null {
  const trimmed = text?.trim() ?? "";
  if (trimmed.length === 0) {
    return null;
  }
  return trimmed.length <= USER_PREVIEW_MAX_CHARS
    ? trimmed
    : `${trimmed.slice(0, USER_PREVIEW_MAX_CHARS - 1)}…`;
}

function isRetryableTurnItem(
  item: AgentTurnMessage,
): item is AgentTurnAssistantMessage | AgentTurnToolMessage {
  return item.type === "assistant" || item.type === "tool";
}

function isTurnMessage(value: unknown): value is AgentTurnMessage {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const type = (value as { type?: unknown }).type;
  return type === "user" || type === "ack" || type === "assistant" || type === "tool";
}

function isStepUsage(value: unknown): value is AgentTurnStepUsage {
  if (value === null || typeof value !== "object") {
    return false;
  }
  return typeof (value as { stepIndex?: unknown }).stepIndex === "number";
}
