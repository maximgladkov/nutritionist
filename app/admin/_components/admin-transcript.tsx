import type { AgentTurnMessage } from "@/lib/agent-turn-model";
import { formatTokenCount, formatUsd } from "@/lib/admin-format";

export function AdminTranscript({ messages }: { readonly messages: readonly AgentTurnMessage[] }) {
  if (messages.length === 0) {
    return <p className="text-muted text-sm">No transcript captured for this turn.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {messages.map((message, index) => (
        <article
          className="border-divider bg-surface rounded-xl border p-3"
          key={`${message.type}-${message.at}-${String(index)}`}
        >
          <p className="text-muted mb-1 text-xs font-medium tracking-wide uppercase">
            {message.type === "ack" ? "Quick answer" : message.type}
          </p>
          {message.type === "user" ? <p className="whitespace-pre-wrap text-sm">{message.text}</p> : null}
          {message.type === "ack" ? (
            <div className="flex flex-col gap-1">
              <p className="whitespace-pre-wrap text-sm">{message.text}</p>
              <p className="text-muted text-xs">
                {message.model} · {formatUsd(message.costUsd)} · {formatTokenCount(message.inputTokens)} in ·{" "}
                {formatTokenCount(message.outputTokens)} out
              </p>
            </div>
          ) : null}
          {message.type === "assistant" ? (
            <p className="whitespace-pre-wrap text-sm">{message.text}</p>
          ) : null}
          {message.type === "tool" ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">{message.toolName}</p>
              {message.input !== undefined ? (
                <pre className="bg-surface-secondary overflow-x-auto rounded-lg p-2 text-xs">
                  {stringify(message.input)}
                </pre>
              ) : null}
              {message.output !== undefined ? (
                <pre className="bg-surface-secondary overflow-x-auto rounded-lg p-2 text-xs">
                  {stringify(message.output)}
                </pre>
              ) : null}
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function stringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
