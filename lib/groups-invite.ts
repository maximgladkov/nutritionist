export const INVITE_TOKEN_LENGTH = 16;
export const INVITE_START_PREFIX = "g_";

const TOKEN_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const TOKEN_PATTERN = `[A-Za-z0-9]{${INVITE_TOKEN_LENGTH}}`;

export function generateInviteToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(INVITE_TOKEN_LENGTH));
  return Array.from(bytes, (byte) => TOKEN_ALPHABET[byte % TOKEN_ALPHABET.length]).join("");
}

export function isInviteToken(value: string): boolean {
  return new RegExp(`^${TOKEN_PATTERN}$`, "u").test(value);
}

export function telegramStartInvitePayload(token: string): string {
  return `${INVITE_START_PREFIX}${token}`;
}

export function parseInviteStartParam(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const match = new RegExp(`^${INVITE_START_PREFIX}(${TOKEN_PATTERN})$`, "u").exec(value.trim());
  return match?.[1] ?? null;
}

export function parseTelegramStartInvite(text: string): string | null {
  const match = new RegExp(
    `^/start(?:@[A-Za-z0-9_]+)?\\s+${INVITE_START_PREFIX}(${TOKEN_PATTERN})\\s*$`,
    "u",
  ).exec(text.trim());
  return match?.[1] ?? null;
}

export type MembershipMergeRow = {
  readonly groupId: string;
  readonly id: string;
  readonly role: "owner" | "member";
};

export function planMembershipMerge(
  survivor: readonly MembershipMergeRow[],
  absorbed: readonly MembershipMergeRow[],
): { deleteIds: string[]; moveIds: string[]; promoteIds: string[] } {
  const survivorByGroup = new Map(survivor.map((row) => [row.groupId, row]));
  const deleteIds: string[] = [];
  const moveIds: string[] = [];
  const promoteIds: string[] = [];
  for (const row of absorbed) {
    const existing = survivorByGroup.get(row.groupId);
    if (existing) {
      deleteIds.push(row.id);
      if (row.role === "owner" && existing.role !== "owner") {
        promoteIds.push(existing.id);
      }
      continue;
    }
    moveIds.push(row.id);
  }
  return { deleteIds, moveIds, promoteIds };
}
