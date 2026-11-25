import type { MessageContent } from "eve/channels";

// eve copies every attached file into a sandbox and shows the model only some kinds of them. A file
// named this way it passes on as it is: the model's middleware puts the file itself in its place.
const KEY = "btrme";

export type MediaRef = { id: string; kind: "telegram" | "upload" };

export function mediaRef(kind: MediaRef["kind"], id: string): Record<string, string> {
  return { [KEY]: `${kind}:${id}` };
}

export function readMediaRef(data: unknown): MediaRef | null {
  if (typeof data !== "object" || data === null) return null;
  const found = /^(telegram|upload):(.+)$/u.exec(String((data as Record<string, unknown>)[KEY] ?? ""));
  return found ? { id: found[2]!, kind: found[1] as MediaRef["kind"] } : null;
}

type Payload = Record<string, unknown> & { message?: MessageContent };
type Adapter = { deliver?: (payload: Payload, ctx: unknown) => unknown };

// What the session takes in of a delivery, with its message replaced.
export function replaceDelivered<T extends object>(
  channel: T,
  replace: (message: MessageContent, ctx: unknown) => MessageContent,
): T {
  const adapter = (channel as { adapter?: Adapter }).adapter;
  if (!adapter) {
    throw new Error("The channel has no adapter to replace messages in.");
  }
  const original = adapter.deliver;
  adapter.deliver = async (payload, ctx) => {
    const delivered = original ? ((await original(payload, ctx)) as Payload | undefined) : payload;
    if (!delivered || delivered.message === undefined) {
      return original ? delivered : nothingIn(payload) ? undefined : stepInput(payload);
    }
    const message = replace(delivered.message, ctx);
    return original ? { ...delivered, message } : { ...stepInput(payload), message };
  };
  return channel;
}

function nothingIn(payload: Payload): boolean {
  return [payload.answers, payload.context, payload.__eveClientContext, payload.outputSchema].every(
    (part) => part === undefined || (Array.isArray(part) && part.length === 0),
  );
}

// Everything else of a payload is about its sender, not what it says.
function stepInput(payload: Payload): Payload {
  const keep = ["answers", "context", "message", "outputSchema", "__eveClientContext", "__eveInputText"];
  return Object.fromEntries(Object.entries(payload).filter(([key, value]) => keep.includes(key) && value !== undefined));
}
