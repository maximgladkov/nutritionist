export const TELEGRAM_PROGRESS_ACK_SUPPRESS_MS = 1500;

const ackPostedAtByPending = new Map<string, number>();
const ackPostedAtByTurn = new Map<string, number>();

export function telegramAckTurnKey(sessionId: string, turnId: string) {
  return `${sessionId}:${turnId}`;
}

export function rememberTelegramAckPosted(pendingId: string): void {
  ackPostedAtByPending.set(pendingId, Date.now());
}

export function bindTelegramAckPosted(pendingId: string, sessionId: string, turnId: string): void {
  const at = ackPostedAtByPending.get(pendingId);
  if (at === undefined) {
    return;
  }
  ackPostedAtByTurn.set(telegramAckTurnKey(sessionId, turnId), at);
}

export function telegramAckPostedRecently(
  sessionId: string,
  turnId: string,
  windowMs = TELEGRAM_PROGRESS_ACK_SUPPRESS_MS,
): boolean {
  const at = ackPostedAtByTurn.get(telegramAckTurnKey(sessionId, turnId));
  return at !== undefined && Date.now() - at < windowMs;
}

export function resetTelegramAckPosted(): void {
  ackPostedAtByPending.clear();
  ackPostedAtByTurn.clear();
}
