import { createHash, randomBytes } from "node:crypto";
import { decode, encode } from "next-auth/jwt";
import { prisma } from "../prisma.ts";
import { apiDeps } from "./deps.ts";
import { unauthorized } from "./errors.ts";

const ACCESS_SALT = "btrme.api.access";
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_DAYS = 90;

export type TokenPair = {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  tokenType: "Bearer";
};

function authSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is not configured");
  }
  return secret;
}

export function hashToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function createAccessToken(userId: string): Promise<string> {
  return encode({
    maxAge: ACCESS_TOKEN_TTL_SECONDS,
    salt: ACCESS_SALT,
    secret: authSecret(),
    token: { sub: userId, typ: "access" },
  });
}

export async function verifyAccessToken(token: string): Promise<string | null> {
  try {
    const payload = await decode({ salt: ACCESS_SALT, secret: authSecret(), token });
    if (payload?.typ !== "access" || typeof payload.sub !== "string" || payload.sub.length === 0) {
      return null;
    }
    return payload.sub;
  } catch {
    return null;
  }
}

export async function issueTokens(userId: string, deviceName?: string): Promise<TokenPair> {
  const refreshToken = randomBytes(32).toString("base64url");
  const now = apiDeps().now();
  await prisma.refreshToken.create({
    data: {
      deviceName: deviceName?.slice(0, 120) ?? null,
      expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_DAYS * 86_400_000),
      tokenHash: hashToken(refreshToken),
      userId,
    },
  });
  return {
    accessToken: await createAccessToken(userId),
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    refreshToken,
    tokenType: "Bearer",
  };
}

// Rotates a refresh token. Reusing an already-rotated token revokes every session of that
// user, since only a leaked copy would still be presenting it.
export async function rotateRefreshToken(refreshToken: string): Promise<TokenPair> {
  const now = apiDeps().now();
  const row = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(refreshToken) } });
  if (!row) {
    throw unauthorized("Sign in again.");
  }
  if (row.revokedAt) {
    await prisma.refreshToken.updateMany({
      data: { revokedAt: now },
      where: { revokedAt: null, userId: row.userId },
    });
    throw unauthorized("Sign in again.");
  }
  if (row.expiresAt <= now) {
    throw unauthorized("Sign in again.");
  }
  const claimed = await prisma.refreshToken.updateMany({
    data: { lastUsedAt: now, revokedAt: now },
    where: { id: row.id, revokedAt: null },
  });
  if (claimed.count === 0) {
    throw unauthorized("Sign in again.");
  }
  return issueTokens(row.userId, row.deviceName ?? undefined);
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    data: { revokedAt: apiDeps().now() },
    where: { revokedAt: null, tokenHash: hashToken(refreshToken) },
  });
}
