import { createPublicKey, verify } from "node:crypto";

const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys";
const KEYS_TTL_MS = 60 * 60_000;
// Expo Go signs in under its own bundle id, so development accepts it too.
const EXPO_GO_BUNDLE_ID = "host.exp.Exponent";

export type AppleIdentity = {
  email: string | null;
  emailVerified: boolean;
  isPrivateEmail: boolean;
  sub: string;
};

type AppleJwk = { alg?: string; e?: string; kid?: string; kty?: string; n?: string; use?: string };

let cachedKeys: { at: number; keys: AppleJwk[] } | null = null;

async function appleKeys(forceRefresh = false): Promise<AppleJwk[]> {
  if (!forceRefresh && cachedKeys && Date.now() - cachedKeys.at < KEYS_TTL_MS) {
    return cachedKeys.keys;
  }
  const response = await fetch(APPLE_KEYS_URL);
  if (!response.ok) {
    throw new Error(`Apple keys request failed: ${response.status}`);
  }
  const body = (await response.json()) as { keys?: AppleJwk[] };
  cachedKeys = { at: Date.now(), keys: body.keys ?? [] };
  return cachedKeys.keys;
}

export function allowedAppleAudiences(): string[] {
  const configured = (process.env.APPLE_CLIENT_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return process.env.NODE_ENV === "production" ? configured : [...configured, EXPO_GO_BUNDLE_ID];
}

function decodeSegment<T>(segment: string): T {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as T;
}

function truthy(value: unknown): boolean {
  return value === true || value === "true";
}

// Verifies an identity token from Sign in with Apple: RS256 signature against Apple's
// published keys, issuer, audience (our bundle ids) and expiry.
export async function verifyAppleIdentityToken(token: string): Promise<AppleIdentity> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Malformed identity token");
  }
  const [rawHeader, rawPayload, rawSignature] = parts as [string, string, string];
  const header = decodeSegment<{ alg?: string; kid?: string }>(rawHeader);
  if (header.alg !== "RS256" || !header.kid) {
    throw new Error("Unsupported identity token");
  }
  let jwk = (await appleKeys()).find((key) => key.kid === header.kid);
  if (!jwk) {
    jwk = (await appleKeys(true)).find((key) => key.kid === header.kid);
  }
  if (!jwk) {
    throw new Error("Unknown Apple signing key");
  }
  const signed = verify(
    "RSA-SHA256",
    Buffer.from(`${rawHeader}.${rawPayload}`),
    createPublicKey({ format: "jwk", key: jwk }),
    Buffer.from(rawSignature, "base64url"),
  );
  if (!signed) {
    throw new Error("Bad identity token signature");
  }
  const claims = decodeSegment<{
    aud?: string;
    email?: string;
    email_verified?: boolean | string;
    exp?: number;
    is_private_email?: boolean | string;
    iss?: string;
    sub?: string;
  }>(rawPayload);
  if (claims.iss !== APPLE_ISSUER) {
    throw new Error("Wrong issuer");
  }
  if (!claims.aud || !allowedAppleAudiences().includes(claims.aud)) {
    throw new Error("Identity token is for another app");
  }
  if (!claims.exp || claims.exp * 1000 <= Date.now()) {
    throw new Error("Identity token expired");
  }
  if (!claims.sub) {
    throw new Error("Identity token has no subject");
  }
  return {
    email: claims.email?.toLowerCase() ?? null,
    emailVerified: truthy(claims.email_verified),
    isPrivateEmail: truthy(claims.is_private_email),
    sub: claims.sub,
  };
}
