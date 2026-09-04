import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyAckMessage,
  applyAssistantMessage,
  applyStepCompleted,
  applyStepStarted,
  applyToolRequested,
  applyToolResult,
  applyUserMessage,
  clipJson,
  emptyTranscript,
  normalizeChannelKind,
  parseTranscript,
  summarizeTranscript,
  TOOL_JSON_MAX_CHARS,
  toolCallsFromActions,
  toolResultFromAction,
  userPreviewFrom,
} from "./agent-turn-model.ts";

describe("normalizeChannelKind", () => {
  it("maps eve and http to web", () => {
    assert.equal(normalizeChannelKind("eve"), "web");
    assert.equal(normalizeChannelKind("http"), "web");
    assert.equal(normalizeChannelKind(undefined), "web");
  });

  it("strips the authored channel prefix", () => {
    assert.equal(normalizeChannelKind("channel:telegram"), "telegram");
    assert.equal(normalizeChannelKind("telegram"), "telegram");
  });
});

describe("transcript reducers", () => {
  it("captures a user to assistant turn", () => {
    let transcript = applyUserMessage(emptyTranscript(), {
      at: "2026-09-04T10:00:00.000Z",
      text: "logged yogurt",
    });
    transcript = applyAssistantMessage(transcript, {
      at: "2026-09-04T10:00:02.000Z",
      finishReason: "stop",
      stepIndex: 0,
      text: "Got it.",
    });
    assert.equal(transcript.items.length, 2);
    assert.equal(summarizeTranscript(transcript).userPreview, "logged yogurt");
  });

  it("records tool input then output", () => {
    let transcript = applyToolRequested(emptyTranscript(), {
      at: "2026-09-04T10:00:01.000Z",
      callId: "call_1",
      stepIndex: 0,
      toolInput: { name: "yogurt" },
      toolName: "log_meal",
    });
    transcript = applyToolResult(transcript, {
      at: "2026-09-04T10:00:02.000Z",
      callId: "call_1",
      output: { ok: true },
      stepIndex: 0,
      toolName: "log_meal",
    });
    const tool = transcript.items[0];
    assert.equal(tool?.type, "tool");
    if (tool?.type === "tool") {
      assert.deepEqual(tool.input, { name: "yogurt" });
      assert.deepEqual(tool.output, { ok: true });
    }
  });

  it("truncates later steps on retry and recomputes cost", () => {
    let transcript = applyUserMessage(emptyTranscript(), {
      at: "2026-09-04T10:00:00.000Z",
      text: "hi",
    });
    transcript = applyAssistantMessage(transcript, {
      at: "2026-09-04T10:00:01.000Z",
      finishReason: "tool-calls",
      stepIndex: 0,
      text: "checking",
    });
    transcript = applyStepCompleted(transcript, {
      costUsd: 0.002,
      inputTokens: 100,
      model: "zai/glm-5.3-flash",
      outputTokens: 20,
      stepIndex: 0,
    });
    transcript = applyAssistantMessage(transcript, {
      at: "2026-09-04T10:00:03.000Z",
      finishReason: "stop",
      stepIndex: 1,
      text: "abandoned",
    });
    transcript = applyStepCompleted(transcript, {
      costUsd: 0.01,
      inputTokens: 50,
      model: "zai/glm-5.3-flash",
      outputTokens: 10,
      stepIndex: 1,
    });
    transcript = applyStepStarted(transcript, { model: "zai/glm-5.3-flash", stepIndex: 1 });
    transcript = applyAssistantMessage(transcript, {
      at: "2026-09-04T10:00:04.000Z",
      finishReason: "stop",
      stepIndex: 1,
      text: "final",
    });
    transcript = applyStepCompleted(transcript, {
      costUsd: 0.003,
      inputTokens: 40,
      model: "zai/glm-5.3-flash",
      outputTokens: 8,
      stepIndex: 1,
    });
    const texts = transcript.items.map((item) => (item.type === "assistant" ? item.text : item.type));
    assert.deepEqual(texts, ["user", "checking", "final"]);
    const summary = summarizeTranscript(transcript);
    assert.equal(summary.costUsd, 0.005);
    assert.equal(summary.inputTokens, 140);
    assert.equal(summary.outputTokens, 28);
    assert.equal(summary.model, "zai/glm-5.3-flash");
  });

  it("keeps a quick answer ahead of retries and includes its cost", () => {
    let transcript = applyAckMessage(emptyTranscript(), {
      at: "2026-09-04T10:00:00.000Z",
      costUsd: 0.00012,
      inputTokens: 80,
      model: "google/gemini-3.5-flash-lite",
      outputTokens: 6,
      text: "Checking calories…",
    });
    transcript = applyUserMessage(transcript, {
      at: "2026-09-04T10:00:00.100Z",
      text: "calories?",
    });
    transcript = applyAssistantMessage(transcript, {
      at: "2026-09-04T10:00:01.000Z",
      finishReason: "stop",
      stepIndex: 0,
      text: "stale",
    });
    transcript = applyStepCompleted(transcript, {
      costUsd: 0.004,
      inputTokens: 40,
      model: "zai/glm-5.3-flash",
      outputTokens: 10,
      stepIndex: 0,
    });
    transcript = applyStepStarted(transcript, { model: "zai/glm-5.3-flash", stepIndex: 0 });
    transcript = applyAssistantMessage(transcript, {
      at: "2026-09-04T10:00:02.000Z",
      finishReason: "stop",
      stepIndex: 0,
      text: "1,200 kcal",
    });
    transcript = applyStepCompleted(transcript, {
      costUsd: 0.003,
      inputTokens: 42,
      model: "zai/glm-5.3-flash",
      outputTokens: 8,
      stepIndex: 0,
    });
    assert.deepEqual(
      transcript.items.map((item) => item.type),
      ["user", "ack", "assistant"],
    );
    const ack = transcript.items.find((item) => item.type === "ack");
    assert.equal(ack?.type === "ack" ? ack.text : null, "Checking calories…");
    const summary = summarizeTranscript(transcript);
    assert.equal(Number(summary.costUsd.toFixed(6)), 0.00312);
    assert.equal(summary.inputTokens, 122);
    assert.equal(summary.outputTokens, 14);
    assert.equal(summary.model, "zai/glm-5.3-flash");
  });

  it("inserts a late quick answer after the user message", () => {
    let transcript = applyUserMessage(emptyTranscript(), {
      at: "2026-09-04T10:00:00.000Z",
      text: "calories?",
    });
    transcript = applyAssistantMessage(transcript, {
      at: "2026-09-04T10:00:01.000Z",
      finishReason: "stop",
      stepIndex: 0,
      text: "1,200 kcal",
    });
    transcript = applyAckMessage(transcript, {
      at: "2026-09-04T10:00:00.500Z",
      costUsd: 0.0001,
      inputTokens: 20,
      model: "google/gemini-3.5-flash-lite",
      outputTokens: 4,
      text: "Checking calories…",
    });
    assert.deepEqual(
      transcript.items.map((item) => item.type),
      ["user", "ack", "assistant"],
    );
  });

  it("clips oversized tool payloads", () => {
    const huge = "x".repeat(TOOL_JSON_MAX_CHARS + 10);
    const clipped = clipJson({ body: huge }) as { preview: string; truncated: boolean };
    assert.equal(clipped.truncated, true);
    assert.equal(clipped.preview.length, TOOL_JSON_MAX_CHARS);
  });

  it("parses stored wrapper or a raw array", () => {
    const wrapped = parseTranscript({
      items: [{ at: "t", text: "hi", type: "user" }],
      steps: [{ stepIndex: 0, model: "m", inputTokens: 1, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.1 }],
    });
    assert.equal(wrapped.items.length, 1);
    assert.equal(wrapped.steps.length, 1);
    const raw = parseTranscript([{ at: "t", text: "hi", type: "user" }]);
    assert.equal(raw.items.length, 1);
    assert.equal(raw.steps.length, 0);
  });
});

describe("userPreviewFrom", () => {
  it("returns null for blank text", () => {
    assert.equal(userPreviewFrom("  "), null);
  });

  it("truncates long previews", () => {
    const preview = userPreviewFrom("a".repeat(400));
    assert.equal(preview?.endsWith("…"), true);
    assert.equal(preview?.length, 280);
  });
});

describe("action extractors", () => {
  it("reads tool-call actions", () => {
    const calls = toolCallsFromActions([
      { callId: "c1", kind: "tool-call", toolName: "log_meal", input: { label: "lunch" } },
    ]);
    assert.deepEqual(calls, [
      { callId: "c1", toolInput: { label: "lunch" }, toolName: "log_meal" },
    ]);
  });

  it("reads tool results", () => {
    const result = toolResultFromAction({
      callId: "c1",
      isError: false,
      kind: "tool-result",
      output: { ok: true },
      toolName: "log_meal",
    });
    assert.deepEqual(result, {
      callId: "c1",
      isError: false,
      output: { ok: true },
      toolName: "log_meal",
    });
  });
});
