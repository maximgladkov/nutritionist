type LatencyTrace = {
  chatId?: string;
  sessionId?: string;
  t0: number;
};

const traces = new Map<string, LatencyTrace>();

export function chatLatencyKey(chatId: string) {
  return `chat:${chatId}`;
}

export function sessionLatencyKey(sessionId: string) {
  return `session:${sessionId}`;
}

export function beginLatencyTrace(input: { chatId: string }): void {
  const trace: LatencyTrace = { chatId: input.chatId, t0: Date.now() };
  traces.set(chatLatencyKey(input.chatId), trace);
  markLatency(chatLatencyKey(input.chatId), "webhook_received");
}

export function bindLatencySession(chatId: string, sessionId: string): void {
  const existing = traces.get(chatLatencyKey(chatId));
  const trace = existing ?? { chatId, t0: Date.now() };
  trace.sessionId = sessionId;
  traces.set(chatLatencyKey(chatId), trace);
  traces.set(sessionLatencyKey(sessionId), trace);
}

export function markLatency(key: string, phase: string, extra?: Record<string, unknown>): void {
  const trace = traces.get(key) ?? traces.get(chatLatencyKey(key)) ?? traces.get(sessionLatencyKey(key));
  console.info(
    JSON.stringify({
      type: "latency",
      phase,
      ...(trace === undefined
        ? {}
        : {
            chatId: trace.chatId,
            ms: Date.now() - trace.t0,
            sessionId: trace.sessionId,
          }),
      ...extra,
    }),
  );
}

export function resetLatencyTraces(): void {
  traces.clear();
}
