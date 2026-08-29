export type LinkCommand = { kind: "generate" } | { kind: "consume"; code: string };

export function parseLinkCommand(text: string): LinkCommand | null {
  const match = /^\/link(?:@[A-Za-z0-9_]+)?(?:\s+(\S+))?\s*$/u.exec(text.trim());
  if (!match) {
    return null;
  }
  if (match[1]) {
    return { kind: "consume", code: match[1].trim().toUpperCase() };
  }
  return { kind: "generate" };
}

export function generateLinkCodeValue(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}
