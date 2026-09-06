import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  beginLatencyTrace,
  bindLatencySession,
  chatLatencyKey,
  markLatency,
  resetLatencyTraces,
  sessionLatencyKey,
} from "./latency-log.ts";

describe("latency-log", () => {
  it("records elapsed ms from webhook start through session bind", () => {
    resetLatencyTraces();
    const lines: string[] = [];
    const original = console.info;
    console.info = (message?: unknown) => {
      if (typeof message === "string") {
        lines.push(message);
      }
    };
    try {
      beginLatencyTrace({ chatId: "42" });
      bindLatencySession("42", "sess_1");
      markLatency(sessionLatencyKey("sess_1"), "turn.started");
    } finally {
      console.info = original;
      resetLatencyTraces();
    }
    const events = lines.map((line) => JSON.parse(line) as { chatId?: string; phase: string; sessionId?: string; type: string });
    assert.equal(events[0]?.type, "latency");
    assert.equal(events[0]?.phase, "webhook_received");
    assert.equal(events[0]?.chatId, "42");
    assert.equal(events[1]?.phase, "turn.started");
    assert.equal(events[1]?.sessionId, "sess_1");
    assert.equal(chatLatencyKey("42"), "chat:42");
  });
});
