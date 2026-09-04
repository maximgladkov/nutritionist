const persistTails = new Map<string, Promise<void>>();

function persistKey(sessionId: string, turnId: string) {
  return `${sessionId}:${turnId}`;
}

export function enqueueAgentTurnPersist(
  sessionId: string,
  turnId: string,
  work: () => Promise<void>,
): Promise<void> {
  const key = persistKey(sessionId, turnId);
  const previous = persistTails.get(key) ?? Promise.resolve();
  const current = previous.then(work, work);
  persistTails.set(
    key,
    current.then(
      () => undefined,
      () => undefined,
    ),
  );
  return current;
}

export async function drainAgentTurnPersist(sessionId: string, turnId: string): Promise<void> {
  const key = persistKey(sessionId, turnId);
  while (true) {
    const tail = persistTails.get(key);
    if (tail === undefined) {
      return;
    }
    await tail;
    if (persistTails.get(key) === tail) {
      persistTails.delete(key);
      return;
    }
  }
}

export function resetAgentTurnPersistQueue(): void {
  persistTails.clear();
}
